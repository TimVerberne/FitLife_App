import { useStore } from '../store/useStore';
import { setsCountOf, volumeOf } from '../lib/records';
import { toDisplayWeight } from '../lib/units';

export function FinishScreen() {
  const result = useStore((s) => s.finishResult);
  const saveRoutineFromFinish = useStore((s) => s.saveRoutineFromFinish);
  const go = useStore((s) => s.go);
  const units = useStore((s) => s.settings.units);

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
      <button className="btn sec" style={{ marginTop: 10 }} onClick={() => go('home')}>
        Go to Home
      </button>
    </div>
  );
}
