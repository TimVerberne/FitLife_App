import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { HomeScreen } from './screens/HomeScreen';
import { TrainScreen } from './screens/TrainScreen';
import { StatsScreen } from './screens/StatsScreen';
import { LifeScreen } from './screens/LifeScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ActiveSessionScreen } from './screens/ActiveSessionScreen';
import { FinishScreen } from './screens/FinishScreen';
import { BottomNav } from './components/BottomNav';
import { MiniBar } from './components/MiniBar';
import { RestTimerWatcher } from './components/RestTimerWatcher';
import { SheetContainer } from './components/SheetContainer';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Toast } from './components/Toast';
import { BadgeCelebration } from './components/BadgeCelebration';
import { PrCelebration } from './components/PrCelebration';
import { AuthGate } from './features/auth/AuthGate';
import { useAuthState } from './lib/auth';
import { throttleOnFocus } from './lib/focusThrottle';
import { armNudge, disarmNudge } from './lib/pushNudges';
import { setsCountOf } from './lib/records';

function ScreenForMode(mode: string, tab: string) {
  if (mode === 'session') return <ActiveSessionScreen />;
  if (mode === 'finish') return <FinishScreen />;
  if (tab === 'train') return <TrainScreen />;
  if (tab === 'stats') return <StatsScreen />;
  if (tab === 'life') return <LifeScreen />;
  if (tab === 'you') return <ProfileScreen />;
  return <HomeScreen />;
}

function CurrentScreen() {
  const mode = useStore((s) => s.mode);
  const tab = useStore((s) => s.tab);
  const sessionMorph = useStore((s) => s.sessionMorph);

  // Keying the wrapper on the screen identity restarts the entrance
  // animation on a genuinely fresh element every switch, so tapping rapidly
  // between tabs can't stack or half-play — the newest one simply wins.
  // Switching tabs already swaps component types (and so remounts), so this
  // costs no state that wasn't being discarded anyway.
  const screenKey = mode === 'tabs' ? `tab:${tab}` : `mode:${mode}`;

  // The session screen owns the morph while minimising/restoring; ordinary
  // tab switches get the light cross-fade instead. They're mutually
  // exclusive — a morph is not a tab change.
  let cls = 'tab-fade';
  if (sessionMorph === 'minimizing') cls = 'session-morph-out';
  else if (sessionMorph === 'restoring') cls = 'session-morph-in';

  return (
    <div key={screenKey} className={`screen-wrap ${cls}`}>
      {ScreenForMode(mode, tab)}
    </div>
  );
}

function App() {
  return (
    <AuthGate>
      <AuthedApp />
    </AuthGate>
  );
}

function AuthedApp() {
  const init = useStore((s) => s.init);
  const loaded = useStore((s) => s.loaded);
  const active = useStore((s) => s.active);
  const mode = useStore((s) => s.mode);
  const syncWithCloud = useStore((s) => s.syncWithCloud);
  const { userId } = useAuthState();

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    if (loaded && userId) void syncWithCloud(userId);
  }, [loaded, userId, syncWithCloud]);

  useEffect(() => {
    if (loaded && userId) void useStore.getState().refreshFriends();
  }, [loaded, userId]);

  // Re-fetch friends' sessions whenever the friend list itself changes.
  // Friend sessions are tagged at fetch time with a display label that's
  // disambiguated against the *current* friend set (see labelsForFriends);
  // if a friend is later added/removed and that set changes, an already-
  // fetched friend could be relabeled at render while their sessions still
  // carry the old tag — making their stats read as zero until the next
  // refetch. Re-tagging here keeps the labels in lockstep.
  const friends = useStore((s) => s.friends);
  useEffect(() => {
    if (loaded && userId && friends.length) void useStore.getState().refreshFriendSessions();
  }, [friends, loaded, userId]);

  useEffect(() => {
    if (loaded && userId) void useStore.getState().refreshBody();
  }, [loaded, userId]);

  // The shared custom-exercise library is global, so it changes when anyone
  // adds to it, not just this account — hence a plain refresh on load rather
  // than anything routed through syncWithCloud's linked/unlinked branches.
  useEffect(() => {
    if (loaded && userId) void useStore.getState().refreshCustomExercises();
  }, [loaded, userId]);

  // Covers reactions on the user's OWN workouts, which are available from
  // Dexie immediately. Reactions on friends' workouts are fetched by
  // refreshFriendSessions itself once those sessions exist — a dependency
  // array here can't see that they've arrived.
  useEffect(() => {
    if (loaded && userId) void useStore.getState().refreshReactions();
  }, [loaded, userId]);

  // Opening the workout a reaction notification was about. Two routes in,
  // because the app may or may not already be running when it's tapped: a
  // service-worker message when it is, and a ?workout= param on the URL the
  // worker opened when it isn't. Both wait for `loaded`, since the sheet
  // needs its session to exist in the store first.
  useEffect(() => {
    if (!loaded) return;
    const openWorkout = (sessionId: string) => {
      const known = [...useStore.getState().sessions, ...useStore.getState().friendSessions].some((s) => s.id === sessionId);
      // A friend's brand-new workout may not have been fetched yet — pull
      // once, then open, rather than silently doing nothing.
      if (known) useStore.getState().openWorkoutSheet(sessionId);
      else void useStore.getState().refreshFriendSessions().then(() => useStore.getState().openWorkoutSheet(sessionId));
    };

    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('workout');
    if (fromUrl) {
      openWorkout(fromUrl);
      // Cleared so a refresh doesn't reopen the same sheet indefinitely.
      window.history.replaceState({}, '', window.location.pathname);
    }

    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; sessionId?: string } | undefined;
      if (data?.type === 'open-workout' && data.sessionId) openWorkout(data.sessionId);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [loaded]);

  // There's no realtime subscription for friends' workouts or for a routine
  // edited on another device, so without this both stay stale while the app
  // just sits open or gets reopened from a suspended background state (a
  // standalone PWA resuming isn't a fresh navigation, so the one-time
  // syncWithCloud effect above never re-fires on its own). Poll periodically,
  // and also refresh the instant the app regains focus.
  useEffect(() => {
    if (!loaded || !userId) return;
    const currentUserId = userId;
    const POLL_MS = 45_000;
    // Skips the network request while backgrounded — the interval itself
    // still ticks (negligible cost either way), but there's no need to keep
    // waking the radio for a screen nobody's looking at every 45s on top of
    // the focus-regain refresh below, which already catches it up the
    // moment the app comes back to the foreground.
    const id = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      void useStore.getState().refreshFriendSessions();
    }, POLL_MS);
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      throttleOnFocus('friend-sessions', 30_000, () => void useStore.getState().refreshFriendSessions());
      throttleOnFocus('cloud-sync', 30_000, () => void useStore.getState().syncWithCloud(currentUserId));
      // Picks up exercises other people added while this app sat backgrounded,
      // so a friend's feed card can name them instead of dropping the row.
      throttleOnFocus('custom-exercises', 60_000, () => void useStore.getState().refreshCustomExercises());
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loaded, userId]);

  // Arms a "workout still in progress" server-push nudge the moment the app
  // is backgrounded during an active session (only if the setting is on),
  // and disarms it the instant the app comes back — a locked phone can't
  // run a client-side timer reliably (iOS freezes the service worker), so
  // the schedule has to live server-side; this just tells it when to start
  // and stop.
  useEffect(() => {
    if (!loaded || !userId) return;
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        const { active: currentActive, settings } = useStore.getState();
        if (!settings.notifyActiveWorkout || !currentActive) return;
        const maxNudges = settings.notifyActiveWorkoutRepeat ? 2 : 1;
        void armNudge(currentActive.name || 'Workout', setsCountOf(currentActive.entries), maxNudges);
      } else if (document.visibilityState === 'visible') {
        void disarmNudge();
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [loaded, userId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      const { dialog, sheet, resolveDialog, closeSheet } = useStore.getState();
      if (dialog) resolveDialog(false);
      else if (sheet) closeSheet();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const hasMiniActive = !!active && mode === 'tabs';
  // During an active session the app-shell is pinned to a fixed viewport
  // height so the .screen inside it scrolls *internally* instead of the
  // whole document growing and scrolling. That's what makes the mint
  // session header's `position: sticky` actually pin to the top: sticky
  // resolves against the nearest scrollable ancestor (.screen, which has
  // overflow-y: auto), and if .screen never actually scrolls — which is
  // the case in the normal min-height layout where the document scrolls
  // instead — the header just scrolls away with the page. There's no
  // bottom nav during a session (BottomNav returns null in session/finish
  // mode), so nothing else depends on the document-scroll model here.
  const isSession = mode === 'session';

  if (!loaded) {
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="eyebrow">Loading FitFlow…</div>
      </div>
    );
  }

  return (
    <div className={`app-shell${hasMiniActive ? ' has-mini-active' : ''}${isSession ? ' is-session' : ''}`}>
      <CurrentScreen />
      <RestTimerWatcher />
      <MiniBar />
      <BottomNav />
      <SheetContainer />
      <ConfirmDialog />
      <Toast />
      <BadgeCelebration />
      <PrCelebration />
    </div>
  );
}

export default App;
