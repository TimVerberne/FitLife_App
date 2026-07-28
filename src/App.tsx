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
import { completeLink, consumeOAuthRedirect } from './lib/strava';

// A Strava authorization code is single-use, and StrictMode invokes effects
// twice in development — without a module-level latch the second run would
// exchange an already-spent code and report a spurious failure.
let stravaExchangeStarted = false;

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
      if (document.visibilityState === 'visible') void useStore.getState().refreshFriendSessions();
    }, POLL_MS);
    function onVisibilityChange() {
      if (document.visibilityState !== 'visible') return;
      throttleOnFocus('friend-sessions', 30_000, () => void useStore.getState().refreshFriendSessions());
      throttleOnFocus('cloud-sync', 30_000, () => void useStore.getState().syncWithCloud(currentUserId));
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

  // Strava sends the browser back here with ?code=... after the user approves
  // the link. Handled at app level rather than in the Settings sheet, because
  // the redirect lands on a cold app load with no sheet open. Gated on being
  // signed in, since the exchange is attributed to the Supabase user.
  useEffect(() => {
    if (!loaded || !userId || stravaExchangeStarted) return;
    const { code, denied } = consumeOAuthRedirect();
    if (denied) {
      useStore.getState().showToast('Strava link cancelled');
      return;
    }
    if (!code) return;
    stravaExchangeStarted = true;
    completeLink(code)
      .then((s) => useStore.getState().showToast(s.athleteName ? `Strava linked — ${s.athleteName}` : 'Strava linked'))
      .catch(() => useStore.getState().showToast("Couldn't finish linking Strava — try again"));
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
