import { useEffect } from 'react';
import { useStore } from './store/useStore';
import { HomeScreen } from './screens/HomeScreen';
import { TrainScreen } from './screens/TrainScreen';
import { StatsScreen } from './screens/StatsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ActiveSessionScreen } from './screens/ActiveSessionScreen';
import { FinishScreen } from './screens/FinishScreen';
import { BottomNav } from './components/BottomNav';
import { MiniBar } from './components/MiniBar';
import { RestTimerWatcher } from './components/RestTimerWatcher';
import { SheetContainer } from './components/SheetContainer';
import { ConfirmDialog } from './components/ConfirmDialog';
import { Toast } from './components/Toast';
import { AuthGate } from './features/auth/AuthGate';
import { useAuthState } from './lib/auth';

function CurrentScreen() {
  const mode = useStore((s) => s.mode);
  const tab = useStore((s) => s.tab);

  if (mode === 'session') return <ActiveSessionScreen />;
  if (mode === 'finish') return <FinishScreen />;
  if (tab === 'train') return <TrainScreen />;
  if (tab === 'stats') return <StatsScreen />;
  if (tab === 'you') return <ProfileScreen />;
  return <HomeScreen />;
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

  // There's no realtime subscription for friends' workouts, so without this
  // a session someone else logs while you're just sitting on Home stays
  // invisible until you background/reopen the app or bounce off the tab.
  // Poll periodically, and also refresh the instant the app regains focus —
  // mobile OSes throttle/suspend timers while backgrounded, so the interval
  // alone could otherwise sit stale for a while after resuming.
  useEffect(() => {
    if (!loaded || !userId) return;
    const POLL_MS = 45_000;
    const id = setInterval(() => void useStore.getState().refreshFriendSessions(), POLL_MS);
    function onVisibilityChange() {
      if (document.visibilityState === 'visible') void useStore.getState().refreshFriendSessions();
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
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

  if (!loaded) {
    return (
      <div className="app-shell" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="eyebrow">Loading FitFlow…</div>
      </div>
    );
  }

  return (
    <div className={`app-shell${hasMiniActive ? ' has-mini-active' : ''}`}>
      <CurrentScreen />
      <RestTimerWatcher />
      <MiniBar />
      <BottomNav />
      <SheetContainer />
      <ConfirmDialog />
      <Toast />
    </div>
  );
}

export default App;
