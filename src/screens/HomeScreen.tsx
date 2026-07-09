import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { volumeOf, weeklyStreak } from '../lib/records';
import { WorkoutFeedCard } from '../components/WorkoutFeedCard';

export function HomeScreen() {
  const routines = useStore((s) => s.routines);
  const sessions = useStore((s) => s.sessions);
  const startSession = useStore((s) => s.startSession);
  const openWorkoutSheet = useStore((s) => s.openWorkoutSheet);
  const go = useStore((s) => s.go);

  const mySessions = useMemo(() => sessions.filter((s) => s.person === 'You'), [sessions]);
  const totalVolume = useMemo(() => mySessions.reduce((a, h) => a + volumeOf(h.entries), 0), [mySessions]);
  const streak = useMemo(() => weeklyStreak(sessions), [sessions]);

  const nextRoutine = useMemo(() => {
    if (routines.length === 0) return null;
    const lastTrainedAt = new Map<string, number>();
    mySessions.forEach((h) => {
      if (!h.routineId) return;
      const prev = lastTrainedAt.get(h.routineId) ?? 0;
      if (h.startedAt > prev) lastTrainedAt.set(h.routineId, h.startedAt);
    });
    return [...routines].sort((a, b) => (lastTrainedAt.get(a.id) ?? 0) - (lastTrainedAt.get(b.id) ?? 0))[0];
  }, [routines, mySessions]);

  const estMinutes = nextRoutine
    ? (() => {
        const matches = mySessions.filter((h) => h.routineId === nextRoutine.id);
        if (matches.length > 0) return Math.round(matches.reduce((a, h) => a + h.durationMin, 0) / matches.length);
        return nextRoutine.exerciseIds.length * 13;
      })()
    : 0;

  const crew = useMemo(
    () => [...sessions].filter((h) => h.person !== 'You').sort((a, b) => b.startedAt - a.startedAt).slice(0, 4),
    [sessions],
  );

  const now = new Date();
  const dateLabel = now.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: '2-digit' }).toUpperCase();
  const timeLabel = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

  return (
    <div className="screen">
      <div className="top">
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.1em', color: 'var(--accent)', textTransform: 'uppercase' }}>
          {dateLabel} — {timeLabel}
        </div>
        <div className="h1" style={{ fontSize: 42, lineHeight: 0.9, marginTop: 6 }}>
          Let's
          <br />
          get
          <br />
          <span style={{ color: 'var(--accent)' }}>to work.</span>
        </div>
      </div>

      {nextRoutine ? (
        <div style={{ marginTop: 4, background: 'var(--accent)', borderRadius: 16, padding: '16px 16px 14px', color: 'var(--accent-ink)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.14em', textTransform: 'uppercase' }}>
            Today's session
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 28, lineHeight: 0.95, textTransform: 'uppercase', marginTop: 3 }}>
            {nextRoutine.name}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700 }}>
              {nextRoutine.exerciseIds.length} EX · {estMinutes} MIN
            </div>
            <button
              onClick={() => startSession(nextRoutine.id)}
              style={{
                background: 'var(--accent-ink)',
                color: 'var(--accent)',
                fontFamily: 'var(--font-display)',
                fontWeight: 900,
                fontSize: 15,
                padding: '9px 18px',
                borderRadius: 9,
                textTransform: 'uppercase',
                letterSpacing: '.03em',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              Start ▶
            </button>
          </div>
        </div>
      ) : (
        <button className="new-routine-card" style={{ marginTop: 4 }} onClick={() => go('train')}>
          + Build your first routine
        </button>
      )}

      <div className="stat-grid" style={{ marginTop: 16 }}>
        <div className="stat-tile">
          <div className="n">{String(mySessions.length).padStart(2, '0')}</div>
          <div className="l">Workouts</div>
        </div>
        <div className="stat-tile">
          <div className="n" style={{ color: 'var(--accent)' }}>
            {totalVolume >= 1000 ? `${Math.round(totalVolume / 1000)}k` : Math.round(totalVolume)}
          </div>
          <div className="l">Volume</div>
        </div>
        <div className="stat-tile">
          <div className="n">{String(streak).padStart(2, '0')}</div>
          <div className="l">Streak</div>
        </div>
      </div>

      <div className="section-h" style={{ margin: '20px 2px 0' }}>
        The crew
      </div>
      {crew.length === 0 && <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>No activity from your crew yet.</p>}
      {crew.map((h) => (
        <WorkoutFeedCard key={h.id} session={h} allSessions={sessions} onOpen={() => openWorkoutSheet(h.id)} />
      ))}
    </div>
  );
}
