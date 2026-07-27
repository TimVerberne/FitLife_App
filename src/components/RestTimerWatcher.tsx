import { useEffect } from 'react';
import { useStore } from '../store/useStore';
import { playBeep } from '../lib/beep';
import { REST_END_PATTERN, vibrate } from '../lib/haptics';

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
      if (hapticsEnabled) vibrate(REST_END_PATTERN);
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
