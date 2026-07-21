import { memo } from 'react';
import { epley, isWorkingSet } from '../../lib/records';
import { REST_PRESETS, formatRest } from '../../lib/rest';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../../lib/units';
import { exerciseById } from '../../lib/exercises';
import { Thumb } from '../../components/Thumb';
import { NumberField } from '../../components/NumberField';
import type { StoreState } from '../../store/useStore';
import type { Exercise, SessionEntry, SetEntry, SetKind } from '../../lib/types';

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

// Keyed by exerciseId, not entries-array index — an index would go stale
// (and silently point at the wrong exercise) the moment a drag-reorder or
// an exercise removal shifts what's at that index while this menu is open.
export interface MenuState {
  exerciseId: string;
  setIdx: number;
  step: 'options' | 'dropCount';
  dropCount: number;
}

export interface ExerciseCardProps {
  ei: number;
  entry: SessionEntry;
  ex: Exercise;
  cardio: boolean;
  startingBest: number;
  priorEntry: SessionEntry | undefined;
  restSeconds: number | null | undefined;
  units: 'kg' | 'lb';
  confirmRemoveExercise: boolean;
  compact: boolean;
  isDraggingThis: boolean;
  positionStyle: React.CSSProperties | undefined;
  menu: MenuState | null;
  restMenuOpen: boolean;
  supersetMenuOpen: boolean;
  allExercises: { exerciseId: string; name: string }[];
  setMenu: (m: MenuState | null | ((m: MenuState | null) => MenuState | null)) => void;
  setRestMenuFor: (id: string | null) => void;
  setSupersetMenuFor: (id: string | null) => void;
  setVal: StoreState['setVal'];
  toggleSet: StoreState['toggleSet'];
  addSet: StoreState['addSet'];
  removeSet: StoreState['removeSet'];
  setSetKind: StoreState['setSetKind'];
  applyDropSet: StoreState['applyDropSet'];
  removeExercise: StoreState['removeExercise'];
  setRestDuration: StoreState['setRestDuration'];
  pairSuperset: StoreState['pairSuperset'];
  unpairSuperset: StoreState['unpairSuperset'];
  openDetail: StoreState['openDetail'];
  confirm: StoreState['confirm'];
  startDrag: (e: React.PointerEvent, originalIndex: number) => void;
  startKeyboardReorder: (originalIndex: number) => void;
  moveKeyboardSlot: (delta: number) => void;
  confirmKeyboardReorder: () => void;
  cancelKeyboardReorder: () => void;
}

function ExerciseCardImpl({
  ei,
  entry,
  ex,
  cardio,
  startingBest,
  priorEntry,
  restSeconds,
  units,
  confirmRemoveExercise,
  compact,
  isDraggingThis,
  positionStyle,
  menu,
  restMenuOpen,
  supersetMenuOpen,
  allExercises,
  setMenu,
  setRestMenuFor,
  setSupersetMenuFor,
  setVal,
  toggleSet,
  addSet,
  removeSet,
  setSetKind,
  applyDropSet,
  removeExercise,
  setRestDuration,
  pairSuperset,
  unpairSuperset,
  openDetail,
  confirm,
  startDrag,
  startKeyboardReorder,
  moveKeyboardSlot,
  confirmKeyboardReorder,
  cancelKeyboardReorder,
}: ExerciseCardProps) {
  const prFlags = cardio ? [] : prFlagsFor(entry.sets, startingBest);
  const partnerEx = entry.supersetWith ? exerciseById(entry.supersetWith) : undefined;
  const partnerOptions = allExercises.filter((o) => o.exerciseId !== entry.exerciseId);

  function prevPerformance(setIdx: number): string | null {
    const set = priorEntry?.sets[setIdx];
    if (!set) return null;
    if (cardio) return `${Math.round((set.durationSec ?? 0) / 60)}m · ${(set.distanceKm ?? 0).toFixed(1)}km`;
    return `${formatWeight(set.weight, units)}×${set.reps}`;
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
    setSetKind(ei, menu.setIdx, kind);
    closeMenu();
  }

  function confirmDropSet() {
    if (!menu) return;
    applyDropSet(ei, menu.setIdx, menu.dropCount);
    closeMenu();
  }

  return (
    <div className={`s-ex${compact ? ' compact' : ''}${isDraggingThis ? ' dragging' : ''}`} style={positionStyle}>
      <div className="s-top">
        <div
          className="s-info-btn"
          role="button"
          tabIndex={0}
          aria-label={`View ${ex.name} details`}
          onClick={() => openDetail(ex.id)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') openDetail(ex.id);
          }}
        >
          <Thumb className="ph" src={ex.image} alt={ex.name} />
          <div className="s-name">
            {ex.name}
            {!compact && <span className="sub">{ex.target} · {ex.equipment}</span>}
          </div>
        </div>
        {!compact && (
          <button
            className="s-del"
            aria-label={`Remove ${ex.name} from workout`}
            onClick={() => {
              if (confirmRemoveExercise) {
                confirm(`Remove ${ex.name} from this workout?`, 'Remove', () => removeExercise(ei), true);
              } else {
                removeExercise(ei);
              }
            }}
          >
            ✕
          </button>
        )}
        <button
          className="s-drag-handle"
          aria-label={`Reorder ${ex.name}. Press Enter to pick up, arrow keys to move, Enter again to drop.`}
          onPointerDown={(e) => startDrag(e, ei)}
          onKeyDown={(e) => {
            const isActive = isDraggingThis;
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              if (isActive) confirmKeyboardReorder();
              else startKeyboardReorder(ei);
            } else if (isActive && e.key === 'ArrowUp') {
              e.preventDefault();
              moveKeyboardSlot(-1);
            } else if (isActive && e.key === 'ArrowDown') {
              e.preventDefault();
              moveKeyboardSlot(1);
            } else if (isActive && e.key === 'Escape') {
              e.preventDefault();
              cancelKeyboardReorder();
            }
          }}
        >
          ⠿
        </button>
      </div>
      {!compact && (
        <>
          <div className="rest-toggle-wrap">
            <button className="rest-toggle" onClick={() => setRestMenuFor(restMenuOpen ? null : entry.exerciseId)}>
              ⏱ Rest timer: {restSeconds ? formatRest(restSeconds) : 'Off'}
            </button>
            {restMenuOpen && (
              <>
                <div className="set-menu-scrim" onClick={() => setRestMenuFor(null)} />
                <div className="rest-menu">
                  <div className="set-menu-title">Rest timer</div>
                  <div className="rest-menu-grid">
                    {REST_PRESETS.map((s) => (
                      <button
                        key={s}
                        className={`rest-chip${restSeconds === s ? ' on' : ''}`}
                        onClick={() => {
                          setRestDuration(entry.exerciseId, s);
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
                      setRestDuration(entry.exerciseId, null);
                      setRestMenuFor(null);
                    }}
                  >
                    Turn off
                  </button>
                </div>
              </>
            )}
          </div>
          {partnerOptions.length > 0 && (
            <div className="rest-toggle-wrap">
              <button className="rest-toggle" onClick={() => setSupersetMenuFor(supersetMenuOpen ? null : entry.exerciseId)}>
                ⛓ {partnerEx ? `Paired with ${partnerEx.name}` : 'Pair superset'}
              </button>
              {supersetMenuOpen && (
                <>
                  <div className="set-menu-scrim" onClick={() => setSupersetMenuFor(null)} />
                  <div className="rest-menu superset-menu">
                    <div className="set-menu-title">Superset partner</div>
                    {partnerOptions.map((o) => (
                      <button
                        key={o.exerciseId}
                        className="set-menu-item"
                        onClick={() => {
                          pairSuperset(entry.exerciseId, o.exerciseId);
                          setSupersetMenuFor(null);
                        }}
                      >
                        {entry.supersetWith === o.exerciseId ? '✓ ' : ''}
                        {o.name}
                      </button>
                    ))}
                    {partnerEx && (
                      <button
                        className="set-menu-item danger"
                        onClick={() => {
                          unpairSuperset(entry.exerciseId);
                          setSupersetMenuFor(null);
                        }}
                      >
                        Unpair
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
          {entry.sets.length > 0 && (
            <div className="set-head">
              <span>#</span>
              <span>Prev</span>
              <span>{cardio ? 'Min' : units === 'kg' ? 'Kg' : 'Lb'}</span>
              <span>{cardio ? 'Km' : 'Reps'}</span>
              <span></span>
            </div>
          )}
          {entry.sets.map((st, si) => {
            const prev = prevPerformance(si);
            const label = setLabelFor(entry.sets, si);
            const menuOpen = menu?.setIdx === si;
            return (
              <div key={si}>
                <div className={`set-row${st.done ? ' done' : ''}`}>
                  <div className="set-idx-wrap">
                    <button
                      className={`set-idx${label.kind !== 'normal' ? ` kind-${label.kind}` : ''}`}
                      aria-label={`Set ${si + 1} type: ${label.kind}. Tap to change.`}
                      onClick={() => setMenu(menuOpen ? null : { exerciseId: entry.exerciseId, setIdx: si, step: 'options', dropCount: 3 })}
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
                  {cardio ? (
                    <>
                      <div className="set-fld">
                        <NumberField
                          value={Math.round((st.durationSec ?? 0) / 60)}
                          inputMode="numeric"
                          ariaLabel={`Set ${si + 1} minutes`}
                          step={1}
                          onCommit={(n) => setVal(ei, si, 'durationSec', n * 60)}
                        />
                      </div>
                      <div className="set-fld">
                        <NumberField
                          value={st.distanceKm ?? 0}
                          inputMode="decimal"
                          ariaLabel={`Set ${si + 1} distance in kilometers`}
                          step={0.1}
                          onCommit={(n) => setVal(ei, si, 'distanceKm', n)}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="set-fld">
                        <NumberField
                          value={toDisplayWeight(st.weight, units)}
                          inputMode="decimal"
                          ariaLabel={`Set ${si + 1} weight in ${units}`}
                          step={units === 'lb' ? 5 : 2.5}
                          onCommit={(n) => setVal(ei, si, 'weight', fromDisplayWeight(n, units))}
                        />
                      </div>
                      <div className="set-fld">
                        <NumberField
                          value={st.reps}
                          inputMode="numeric"
                          ariaLabel={`Set ${si + 1} reps`}
                          step={1}
                          onCommit={(n) => setVal(ei, si, 'reps', n)}
                        />
                      </div>
                    </>
                  )}
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
        </>
      )}
    </div>
  );
}

export const ExerciseCard = memo(ExerciseCardImpl);
