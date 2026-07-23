import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { newRecordExerciseIdsInWorkout, previousComparableSession, setsCountOf, volumeOf } from '../lib/records';
import { toDisplayWeight } from '../lib/units';
import { exerciseById } from '../lib/exercises';

export function FinishScreen() {
  const result = useStore((s) => s.finishResult);
  const sessions = useStore((s) => s.sessions);
  const saveRoutineFromFinish = useStore((s) => s.saveRoutineFromFinish);
  const updateRoutineExercises = useStore((s) => s.updateRoutineExercises);
  const routineName = useStore((s) => s.routines.find((r) => r.id === result?.routineId)?.name);
  const go = useStore((s) => s.go);
  const units = useStore((s) => s.settings.units);
  const [routineChoiceMade, setRoutineChoiceMade] = useState(false);

  // finishSession() already pushed the finished session into `sessions`
  // before switching to this screen, so it's already there to check against
  // everything before it.
  const { records, prNames, delta } = useMemo(() => {
    if (!result) return { records: 0, prNames: [] as string[], delta: null as { volumePct: number | null; durationDeltaMin: number } | null };
    const session = sessions.find((s) => s.id === result.sessionId);
    if (!session) return { records: 0, prNames: [] as string[], delta: null };
    const prIds = newRecordExerciseIdsInWorkout(sessions, session);
    const prNames = prIds.map((id) => exerciseById(id)?.name).filter((n): n is string => !!n);
    const prev = previousComparableSession(sessions, session);
    const delta = prev
      ? {
          volumePct: volumeOf(prev.entries) > 0 ? ((volumeOf(session.entries) - volumeOf(prev.entries)) / volumeOf(prev.entries)) * 100 : null,
          durationDeltaMin: session.durationMin - prev.durationMin,
        }
      : null;
    return { records: prIds.length, prNames, delta };
  }, [sessions, result]);

  if (!result) return null;
  const volume = Math.round(toDisplayWeight(volumeOf(result.entries), units));
  const sets = setsCountOf(result.entries);

  return (
    <div className="screen">
      <div className="top">
        <div className="eyebrow">Done</div>
        <div className="h1" style={{ fontSize: 28 }}>{result.name} completed</div>
      </div>
      {records > 0 && (
        <div style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14, marginTop: 6 }}>
          {/* Named when there are few enough to read as a sentence; a long
              list reads better as just a count. */}
          {prNames.length > 0 && prNames.length <= 3
            ? `🏆 New record: ${prNames.join(', ')}`
            : `🏆 ${records} new record${records === 1 ? '' : 's'} this workout`}
        </div>
      )}
      {delta && (
        <div style={{ color: 'var(--faint)', fontSize: 13, marginTop: records > 0 ? 4 : 6 }}>
          {(() => {
            const parts: string[] = [];
            if (delta.volumePct != null && Math.abs(delta.volumePct) >= 1) {
              parts.push(`${delta.volumePct > 0 ? '▲' : '▼'} ${Math.abs(Math.round(delta.volumePct))}% volume`);
            }
            if (delta.durationDeltaMin !== 0) {
              parts.push(`${Math.abs(delta.durationDeltaMin)} min ${delta.durationDeltaMin > 0 ? 'longer' : 'shorter'}`);
            }
            return parts.length > 0 ? `${parts.join(' · ')} vs last time` : 'About the same as last time';
          })()}
        </div>
      )}
      <div className="summary">
        <div className="n">{volume.toLocaleString('en-US')}</div>
        <div style={{ color: '#9fe3c4', fontSize: 13, marginTop: 4 }}>{units} total volume</div>
      </div>
      <div className="stat-grid" style={{ marginTop: 14 }}>
        <div className="stat-tile">
          <div className="n">{sets}</div>
          <div className="l">Sets</div>
        </div>
        <div className="stat-tile">
          <div className="n">{result.durationMin}</div>
          <div className="l">Minutes</div>
        </div>
        <div className="stat-tile">
          <div className="n">{result.entries.length}</div>
          <div className="l">Exercises</div>
        </div>
      </div>
      {result.newRoutine && (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => saveRoutineFromFinish(result.name, result.exerciseIds)}>
          Save as routine
        </button>
      )}
      {result.routineChanged && result.routineId && !routineChoiceMade && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 10 }}>
            You changed the exercises in <b style={{ color: 'var(--ink)' }}>{routineName ?? 'this routine'}</b> this time.
            Keep the original routine as-is, or save these changes to it?
          </div>
          <button
            className="btn"
            onClick={() => {
              updateRoutineExercises(result.routineId!, result.exerciseIds);
              setRoutineChoiceMade(true);
            }}
          >
            Save changes to routine
          </button>
          <button className="btn sec" style={{ marginTop: 8 }} onClick={() => setRoutineChoiceMade(true)}>
            Keep original routine
          </button>
        </div>
      )}
      <button className="btn sec" style={{ marginTop: 10 }} onClick={() => go('home')}>
        Go to Home
      </button>
    </div>
  );
}
