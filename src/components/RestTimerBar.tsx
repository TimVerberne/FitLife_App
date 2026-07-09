import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { playBeep } from '../lib/beep';

export function RestTimerBar() {
  const restTimer = useStore((s) => s.restTimer);
  const adjustRestTimer = useStore((s) => s.adjustRestTimer);
  const skipRestTimer = useStore((s) => s.skipRestTimer);
  const soundEnabled = useStore((s) => s.settings.restTimerSound);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!restTimer) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [restTimer]);

  useEffect(() => {
    if (restTimer && restTimer.endsAt <= now) {
      if (soundEnabled) playBeep();
      skipRestTimer();
    }
  }, [restTimer, now, soundEnabled, skipRestTimer]);

  if (!restTimer) return null;

  const remaining = Math.max(0, Math.ceil((restTimer.endsAt - now) / 1000));
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');
  const pct = restTimer.total > 0 ? Math.max(0, Math.min(1, remaining / restTimer.total)) : 0;

  return (
    <div className="rest-bar">
      <div className="rest-bar-track">
        <div className="rest-bar-fill" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="rest-bar-time">
        {mm}:{ss}
      </div>
      <div className="rest-bar-actions">
        <button className="rest-bar-btn" onClick={() => adjustRestTimer(-5)}>
          −5s
        </button>
        <button className="rest-bar-btn" onClick={() => adjustRestTimer(5)}>
          +5s
        </button>
        <button className="rest-bar-btn skip" onClick={skipRestTimer}>
          Skip
        </button>
      </div>
    </div>
  );
}
