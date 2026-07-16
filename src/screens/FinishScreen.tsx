import { useState } from 'react';
import { useStore } from '../store/useStore';
import { setsCountOf, volumeOf } from '../lib/records';
import { toDisplayWeight } from '../lib/units';

export function FinishScreen() {
  const result = useStore((s) => s.finishResult);
  const saveRoutineFromFinish = useStore((s) => s.saveRoutineFromFinish);
  const updateRoutineExercises = useStore((s) => s.updateRoutineExercises);
  const routineName = useStore((s) => s.routines.find((r) => r.id === result?.routineId)?.name);
  const go = useStore((s) => s.go);
  const units = useStore((s) => s.settings.units);
  const [routineChoiceMade, setRoutineChoiceMade] = useState(false);

  if (!result) return null;
  const volume = Math.round(toDisplayWeight(volumeOf(result.entries), units));
  const sets = setsCountOf(result.entries);

  return (
    <div className="screen">
      <div className="top">
        <div className="eyebrow">Done</div>
        <div className="h1" style={{ fontSize: 28 }}>{result.name} completed</div>
      </div>
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
