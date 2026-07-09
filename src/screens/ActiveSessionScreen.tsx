import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import { epley, personalRecords, setsCountOf, volumeOf } from '../lib/records';
import { useElapsedMinutes } from '../lib/useElapsedMinutes';
import { Thumb } from '../components/Thumb';
import { NumberField } from '../components/NumberField';
import type { SetEntry } from '../lib/types';

function prFlagsFor(sets: SetEntry[], startingBest: number): boolean[] {
  let best = startingBest;
  return sets.map((s) => {
    if (!s.done || s.weight <= 0) return false;
    const oneRepMax = epley(s.weight, s.reps);
    if (oneRepMax > best) {
      best = oneRepMax;
      return true;
    }
    return false;
  });
}

export function ActiveSessionScreen() {
  const active = useStore((s) => s.active);
  const sessions = useStore((s) => s.sessions);
  const setSessionName = useStore((s) => s.setSessionName);
  const setVal = useStore((s) => s.setVal);
  const toggleSet = useStore((s) => s.toggleSet);
  const addSet = useStore((s) => s.addSet);
  const removeExercise = useStore((s) => s.removeExercise);
  const openPicker = useStore((s) => s.openPicker);
  const minimizeSession = useStore((s) => s.minimizeSession);
  const cancelSession = useStore((s) => s.cancelSession);
  const finishSession = useStore((s) => s.finishSession);

  const records = useMemo(() => personalRecords(sessions), [sessions]);
  const mins = useElapsedMinutes(active?.startedAt ?? Date.now());

  if (!active) return null;

  const done = setsCountOf(active.entries);
  const total = active.entries.reduce((a, e) => a + e.sets.length, 0);
  const liveVolume = Math.round(volumeOf(active.entries));

  function prevPerformance(exerciseId: string, setIdx: number): string | null {
    const prior = sessions
      .filter((h) => h.person === 'You' && h.entries.some((e) => e.exerciseId === exerciseId))
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!prior) return null;
    const entry = prior.entries.find((e) => e.exerciseId === exerciseId);
    const set = entry?.sets[setIdx];
    if (!set) return null;
    return `${set.weight}×${set.reps}`;
  }

  return (
    <div className="screen" style={{ padding: '0 18px 24px' }}>
      <div className="sess-bar">
        <div className="sess-top">
          <span className="sess-live">Recording · live</span>
          <button className="sess-end" onClick={cancelSession}>
            ✕ END
          </button>
        </div>
        <div className="sess-stats">
          <div className="sess-clock">{mins}m</div>
          <div className="sess-vol">
            <div className="n">{liveVolume.toLocaleString('en-US')}</div>
            <div className="l">KG VOLUME</div>
          </div>
        </div>
        <input
          value={active.name}
          onChange={(e) => setSessionName(e.target.value)}
          placeholder="Routine name"
          style={{
            marginTop: 10,
            width: '100%',
            background: 'rgba(0,0,0,.15)',
            border: 'none',
            borderRadius: 8,
            padding: '8px 10px',
            outline: 'none',
            color: 'inherit',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 15,
          }}
        />
      </div>

      <button
        onClick={minimizeSession}
        style={{
          marginTop: 12,
          background: 'none',
          border: 'none',
          color: 'var(--faint)',
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: 13,
          letterSpacing: '.04em',
          textTransform: 'uppercase',
          cursor: 'pointer',
          padding: '4px 2px',
        }}
      >
        ▾ Minimize
      </button>

      {active.entries.map((en, ei) => {
        const ex = exerciseById(en.exerciseId);
        if (!ex) return null;
        const rec = records.find((r) => r.exerciseId === ex.id);
        const prFlags = prFlagsFor(en.sets, rec?.estOneRepMax ?? 0);
        return (
          <div className="s-ex" key={ei}>
            <div className="s-top">
              <Thumb className="ph" src={ex.image} alt={ex.name} />
              <div className="s-name">
                {ex.name}
                <span className="sub">{ex.target} · {ex.equipment}</span>
              </div>
              <button className="s-del" aria-label={`Remove ${ex.name} from workout`} onClick={() => removeExercise(ei)}>
                ✕
              </button>
            </div>
            <div className="set-head">
              <span>#</span>
              <span>Prev</span>
              <span>Kg</span>
              <span>Reps</span>
              <span></span>
            </div>
            {en.sets.map((st, si) => {
              const prev = prevPerformance(en.exerciseId, si);
              return (
                <div key={si}>
                  <div className={`set-row${st.done ? ' done' : ''}`}>
                    <div className="set-idx">{si + 1}</div>
                    <div className="set-prev">{prev ?? '—'}</div>
                    <div className="set-fld">
                      <NumberField value={st.weight} inputMode="decimal" onCommit={(n) => setVal(ei, si, 'weight', n)} />
                    </div>
                    <div className="set-fld">
                      <NumberField value={st.reps} inputMode="numeric" onCommit={(n) => setVal(ei, si, 'reps', n)} />
                    </div>
                    <button
                      className="set-check"
                      aria-label={st.done ? `Mark set ${si + 1} not done` : `Mark set ${si + 1} done`}
                      aria-pressed={st.done}
                      onClick={() => toggleSet(ei, si)}
                    >
                      {st.done ? '✓' : ''}
                    </button>
                  </div>
                  {prFlags[si] && (
                    <div style={{ textAlign: 'right', marginTop: -4, marginBottom: 6 }}>
                      <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11 }}>
                        🏆 new record
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
            <button className="add-set" onClick={() => addSet(ei)}>
              + Add set
            </button>
          </div>
        );
      })}

      <button className="add-ex" onClick={openPicker}>
        + Add exercise
      </button>

      <button
        className="btn light"
        style={{ marginTop: 16 }}
        disabled={done === 0}
        onClick={finishSession}
      >
        Finish & save {done < total ? `(${done}/${total})` : '▶'}
      </button>
      <button className="discard" onClick={cancelSession}>
        Discard workout
      </button>
    </div>
  );
}
