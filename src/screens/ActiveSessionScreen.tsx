import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import { epley, isWorkingSet, personalRecords, setsCountOf, volumeOf } from '../lib/records';
import { useElapsedMinutes } from '../lib/useElapsedMinutes';
import { Thumb } from '../components/Thumb';
import { NumberField } from '../components/NumberField';
import { RestTimerBar } from '../components/RestTimerBar';
import type { SetEntry, SetKind } from '../lib/types';

const REST_PRESETS = [5, 10, 15, 30, 45, 60, 75, 90, 105, 120];

function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}

function prFlagsFor(sets: SetEntry[], startingBest: number): boolean[] {
  let best = startingBest;
  return sets.map((s) => {
    if (!isWorkingSet(s) || s.weight <= 0) return false;
    const oneRepMax = epley(s.weight, s.reps);
    if (oneRepMax > best) {
      best = oneRepMax;
      return true;
    }
    return false;
  });
}

function setLabelFor(sets: SetEntry[], index: number): { text: string; kind: SetKind } {
  const kind = sets[index].kind ?? 'normal';
  if (kind === 'warmup') return { text: 'W', kind };
  if (kind === 'failure') return { text: 'F', kind };
  if (kind === 'superset') return { text: 'S', kind };
  if (kind === 'dropset') {
    let start = index;
    while (start > 0 && (sets[start - 1].kind ?? 'normal') === 'dropset') start--;
    return { text: `D${index - start + 1}`, kind };
  }
  let n = 0;
  for (let i = 0; i <= index; i++) {
    if ((sets[i].kind ?? 'normal') === 'normal') n++;
  }
  return { text: String(n), kind: 'normal' };
}

interface MenuState {
  entryIdx: number;
  setIdx: number;
  step: 'options' | 'dropCount';
  dropCount: number;
}

export function ActiveSessionScreen() {
  const active = useStore((s) => s.active);
  const sessions = useStore((s) => s.sessions);
  const setSessionName = useStore((s) => s.setSessionName);
  const setVal = useStore((s) => s.setVal);
  const toggleSet = useStore((s) => s.toggleSet);
  const addSet = useStore((s) => s.addSet);
  const removeSet = useStore((s) => s.removeSet);
  const setSetKind = useStore((s) => s.setSetKind);
  const applyDropSet = useStore((s) => s.applyDropSet);
  const removeExercise = useStore((s) => s.removeExercise);
  const openPicker = useStore((s) => s.openPicker);
  const minimizeSession = useStore((s) => s.minimizeSession);
  const cancelSession = useStore((s) => s.cancelSession);
  const finishSession = useStore((s) => s.finishSession);
  const confirm = useStore((s) => s.confirm);
  const setRestDuration = useStore((s) => s.setRestDuration);

  const records = useMemo(() => personalRecords(sessions), [sessions]);
  const mins = useElapsedMinutes(active?.startedAt ?? Date.now());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [restMenuFor, setRestMenuFor] = useState<number | null>(null);

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

  function closeMenu() {
    setMenu(null);
  }

  function pickKind(kind: SetKind) {
    if (!menu) return;
    if (kind === 'dropset') {
      setMenu({ ...menu, step: 'dropCount', dropCount: 3 });
      return;
    }
    setSetKind(menu.entryIdx, menu.setIdx, kind);
    closeMenu();
  }

  function confirmDropSet() {
    if (!menu) return;
    applyDropSet(menu.entryIdx, menu.setIdx, menu.dropCount);
    closeMenu();
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
              <button
                className="s-del"
                aria-label={`Remove ${ex.name} from workout`}
                onClick={() => confirm(`Remove ${ex.name} from this workout?`, 'Remove', () => removeExercise(ei), true)}
              >
                ✕
              </button>
            </div>
            <div className="rest-toggle-wrap">
              <button className="rest-toggle" onClick={() => setRestMenuFor(restMenuFor === ei ? null : ei)}>
                ⏱ Rest timer: {active.restTimers[en.exerciseId] ? formatRest(active.restTimers[en.exerciseId]) : 'Off'}
              </button>
              {restMenuFor === ei && (
                <>
                  <div className="set-menu-scrim" onClick={() => setRestMenuFor(null)} />
                  <div className="rest-menu">
                    <div className="set-menu-title">Rest timer</div>
                    <div className="rest-menu-grid">
                      {REST_PRESETS.map((s) => (
                        <button
                          key={s}
                          className={`rest-chip${active.restTimers[en.exerciseId] === s ? ' on' : ''}`}
                          onClick={() => {
                            setRestDuration(en.exerciseId, s);
                            setRestMenuFor(null);
                          }}
                        >
                          {formatRest(s)}
                        </button>
                      ))}
                    </div>
                    <button
                      className="set-menu-item danger"
                      onClick={() => {
                        setRestDuration(en.exerciseId, null);
                        setRestMenuFor(null);
                      }}
                    >
                      Turn off
                    </button>
                  </div>
                </>
              )}
            </div>
            {en.sets.length > 0 && (
              <div className="set-head">
                <span>#</span>
                <span>Prev</span>
                <span>Kg</span>
                <span>Reps</span>
                <span></span>
              </div>
            )}
            {en.sets.map((st, si) => {
              const prev = prevPerformance(en.exerciseId, si);
              const label = setLabelFor(en.sets, si);
              const menuOpen = menu?.entryIdx === ei && menu?.setIdx === si;
              return (
                <div key={si}>
                  <div className={`set-row${st.done ? ' done' : ''}`}>
                    <div className="set-idx-wrap">
                      <button
                        className={`set-idx${label.kind !== 'normal' ? ` kind-${label.kind}` : ''}`}
                        aria-label={`Set ${si + 1} type: ${label.kind}. Tap to change.`}
                        onClick={() => setMenu(menuOpen ? null : { entryIdx: ei, setIdx: si, step: 'options', dropCount: 3 })}
                      >
                        {label.text}
                      </button>
                      {menuOpen && (
                        <>
                          <div className="set-menu-scrim" onClick={closeMenu} />
                          <div className="set-menu">
                            {menu!.step === 'options' ? (
                              <>
                                <button className="set-menu-item" onClick={() => pickKind('warmup')}>
                                  <span className="set-menu-badge warmup">W</span> Warm up
                                </button>
                                <button className="set-menu-item" onClick={() => pickKind('normal')}>
                                  <span className="set-menu-badge">{si + 1}</span> Normal
                                </button>
                                <button className="set-menu-item" onClick={() => pickKind('failure')}>
                                  <span className="set-menu-badge failure">F</span> Failure
                                </button>
                                <button className="set-menu-item" onClick={() => pickKind('dropset')}>
                                  <span className="set-menu-badge dropset">D</span> Drop set
                                </button>
                                <button className="set-menu-item" onClick={() => pickKind('superset')}>
                                  <span className="set-menu-badge superset">S</span> Superset
                                </button>
                                <button className="set-menu-item danger" onClick={() => { removeSet(ei, si); closeMenu(); }}>
                                  <span className="set-menu-badge">✕</span> Remove set
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="set-menu-title">Drop set rounds</div>
                                <div className="set-menu-stepper">
                                  <button onClick={() => setMenu((m) => (m ? { ...m, dropCount: Math.max(2, m.dropCount - 1) } : m))}>
                                    −
                                  </button>
                                  <span className="count">{menu!.dropCount}</span>
                                  <button onClick={() => setMenu((m) => (m ? { ...m, dropCount: Math.min(6, m.dropCount + 1) } : m))}>
                                    +
                                  </button>
                                </div>
                                <button className="btn" style={{ marginTop: 4 }} onClick={confirmDropSet}>
                                  Add
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </div>
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
      <RestTimerBar />
    </div>
  );
}
