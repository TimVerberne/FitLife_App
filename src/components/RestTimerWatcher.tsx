import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { playBeep } from '../lib/beep';

// RestTimerBar only renders on ActiveSessionScreen, so minimizing the
// session (or just switching tabs) unmounts it — and with it, the beep/
// auto-skip logic, since restTimer itself lives in the global store and
// keeps its absolute endsAt regardless. Without something watching
// independently of that screen, a rest timer that expires while minimized
// fires no beep/vibration at all, and shows up as already-expired the next
// time you reopen the session. This component has no UI — it exists purely
// to keep that watch running for as long as the app is open, matching
// MiniBar's "always mounted while signed in" lifetime.
export function RestTimerWatcher() {
  const restTimer = useStore((s) => s.restTimer);
  const skipRestTimer = useStore((s) => s.skipRestTimer);
  const soundEnabled = useStore((s) => s.settings.restTimerSound);
  const hapticsEnabled = useStore((s) => s.settings.hapticsOnRestEnd);

  useEffect(() => {
    if (!restTimer) return;
    const msLeft = restTimer.endsAt - Date.now();
    const fire = () => {
      if (soundEnabled) playBeep();
      // A short-short-long pattern is noticeably different from the single
      // 15ms tap on checking off a set — meant to be felt through a pocket,
      // not just glanced at.
      if (hapticsEnabled && 'vibrate' in navigator) navigator.vibrate([120, 80, 120, 80, 240]);
      skipRestTimer();
    };
    if (msLeft <= 0) {
      fire();
      return;
    }
    const id = setTimeout(fire, msLeft);
    return () => clearTimeout(id);
  }, [restTimer, soundEnabled, hapticsEnabled, skipRestTimer]);

  return null;
}
