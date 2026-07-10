import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById, isCardioExercise } from '../lib/exercises';
import { epley, isWorkingSet, personalRecords, setsCountOf, volumeOf } from '../lib/records';
import { useElapsedMinutes } from '../lib/useElapsedMinutes';
import { REST_PRESETS, formatRest } from '../lib/rest';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../lib/units';
import { Thumb } from '../components/Thumb';
import { NumberField } from '../components/NumberField';
import { RestTimerBar } from '../components/RestTimerBar';
import type { SetEntry, SetKind } from '../lib/types';

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

// Reordering swaps every card to a fixed height (see .s-ex.compact) so a
// dragged card's target slot is plain arithmetic on the pointer's Y delta,
// instead of re-measuring variable-height cards (which is what full cards
// are, once sets/rest-timer content is showing) after every swap.
const COMPACT_CARD_HEIGHT = 60;
const COMPACT_GAP = 14;
const COMPACT_ROW_HEIGHT = COMPACT_CARD_HEIGHT + COMPACT_GAP;

interface DragState {
  order: number[]; // order[slot] = original entries-index now occupying that slot
  draggingIndex: number; // the original entries-index being dragged
  startSlot: number;
  startY: number;
  dy: number;
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
  const openDetail = useStore((s) => s.openDetail);
  const minimizeSession = useStore((s) => s.minimizeSession);
  const cancelSession = useStore((s) => s.cancelSession);
  const finishSession = useStore((s) => s.finishSession);
  const confirm = useStore((s) => s.confirm);
  const setRestDuration = useStore((s) => s.setRestDuration);
  const reorderEntries = useStore((s) => s.reorderEntries);
  const settings = useStore((s) => s.settings);

  const records = useMemo(() => personalRecords(sessions), [sessions]);
  const mins = useElapsedMinutes(active?.startedAt ?? Date.now());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [restMenuFor, setRestMenuFor] = useState<number | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  // The authoritative live value, updated synchronously inside the native
  // event handlers below — `drag` (React state) is a render snapshot of
  // this, always one tick behind. Committing the reorder off of `drag`
  // instead (e.g. reading it inside a setDrag() updater callback, which is
  // where this lived originally) hit a real bug: calling the reorderEntries
  // store action as a side effect of a setState updater tripped React's
  // "setState during render" detection (updaters can be invoked more than
  // once, e.g. under StrictMode), and the order actually committed ended up
  // one step behind the last position the drag visually showed.
  const dragRef = useRef<DragState | null>(null);

  function startDrag(e: React.PointerEvent, originalIndex: number) {
    if (!active) return;
    const d: DragState = {
      order: active.entries.map((_, i) => i),
      draggingIndex: originalIndex,
      startSlot: originalIndex,
      startY: e.clientY,
      dy: 0,
    };
    dragRef.current = d;
    setDrag(d);
  }

  // Deliberately window-level rather than setPointerCapture on the handle
  // button: capture is tied to that specific DOM node, and once the first
  // live swap moves it to a new position in the keyed list, capture doesn't
  // reliably survive the reorder — pointer events silently stop reaching it
  // (confirmed: the dragged card would freeze after exactly one swap). A
  // window listener has no such dependency on one element's identity.
  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      const rawSlot = d.startSlot + dy / COMPACT_ROW_HEIGHT;
      const targetSlot = Math.max(0, Math.min(d.order.length - 1, Math.round(rawSlot)));
      const currentSlot = d.order.indexOf(d.draggingIndex);
      let next = d;
      if (targetSlot !== currentSlot) {
        const order = [...d.order];
        order.splice(currentSlot, 1);
        order.splice(targetSlot, 0, d.draggingIndex);
        next = { ...d, order, dy };
      } else {
        next = { ...d, dy };
      }
      dragRef.current = next;
      setDrag(next);
    }
    function onUp() {
      const d = dragRef.current;
      if (d) reorderEntries(d.order);
      dragRef.current = null;
      setDrag(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  useEffect(() => {
    if (!settings.keepScreenAwake) return;
    type WakeLockSentinelLike = EventTarget & { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };
    if (!nav.wakeLock) return;
    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;
    let acquiring = false;

    function acquire() {
      // Guards against two overlapping request() calls if visibility flaps
      // (hidden→visible→hidden) faster than the first request resolves.
      if (acquiring || sentinel) return;
      acquiring = true;
      nav.wakeLock!
        .request('screen')
        .then((s) => {
          acquiring = false;
          if (cancelled) {
            void s.release();
            return;
          }
          sentinel = s;
          // Fires both when we explicitly release it AND when the browser
          // auto-releases it on tab-hide. Without clearing `sentinel` here,
          // it stays a stale truthy reference forever, so the
          // visibilitychange handler below would never detect "no lock
          // held" and would never call acquire() again after the very
          // first background/foreground cycle.
          s.addEventListener('release', () => {
            if (sentinel === s) sentinel = null;
          });
        })
        .catch(() => {
          acquiring = false;
        });
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') acquire();
    }

    acquire();
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinel?.release();
    };
  }, [settings.keepScreenAwake]);

  if (!active) return null;

  const done = setsCountOf(active.entries);
  const total = active.entries.reduce((a, e) => a + e.sets.length, 0);
  const liveVolume = Math.round(toDisplayWeight(volumeOf(active.entries), settings.units));

  function prevPerformance(exerciseId: string, setIdx: number, cardio: boolean): string | null {
    const prior = sessions
      .filter((h) => h.person === 'You' && h.entries.some((e) => e.exerciseId === exerciseId))
      .sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!prior) return null;
    const entry = prior.entries.find((e) => e.exerciseId === exerciseId);
    const set = entry?.sets[setIdx];
    if (!set) return null;
    if (cardio) return `${Math.round((set.durationSec ?? 0) / 60)}m · ${(set.distanceKm ?? 0).toFixed(1)}km`;
    return `${formatWeight(set.weight, settings.units)}×${set.reps}`;
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
            <div className="l">{settings.units.toUpperCase()} VOLUME</div>
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

      <div
        className={`s-ex-list${drag ? ' reordering' : ''}`}
        style={drag ? { height: active.entries.length * COMPACT_ROW_HEIGHT } : undefined}
      >
      {(drag ? drag.order : active.entries.map((_, i) => i)).map((ei, slot) => {
        const en = active.entries[ei];
        const ex = exerciseById(en.exerciseId);
        if (!ex) return null;
        const cardio = isCardioExercise(ex);
        const rec = records.find((r) => r.exerciseId === ex.id);
        const prFlags = cardio ? [] : prFlagsFor(en.sets, rec?.estOneRepMax ?? 0);
        const isDraggingThis = !!drag && ei === drag.draggingIndex;
        const positionStyle: React.CSSProperties | undefined = drag
          ? {
              position: 'absolute',
              left: 0,
              right: 0,
              top: isDraggingThis ? drag.startSlot * COMPACT_ROW_HEIGHT + drag.dy : slot * COMPACT_ROW_HEIGHT,
              transition: isDraggingThis ? 'none' : 'top 0.18s ease',
              zIndex: isDraggingThis ? 20 : 1,
            }
          : undefined;
        return (
          <div className={`s-ex${drag ? ' compact' : ''}${isDraggingThis ? ' dragging' : ''}`} key={en.exerciseId} style={positionStyle}>
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
                  {!drag && <span className="sub">{ex.target} · {ex.equipment}</span>}
                </div>
              </div>
              {!drag && (
                <button
                  className="s-del"
                  aria-label={`Remove ${ex.name} from workout`}
                  onClick={() => {
                    if (settings.confirmRemoveExercise) {
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
                aria-label={`Reorder ${ex.name}`}
                onPointerDown={(e) => startDrag(e, ei)}
              >
                ⠿
              </button>
            </div>
            {!drag && (
            <>
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
                <span>{cardio ? 'Min' : settings.units === 'kg' ? 'Kg' : 'Lb'}</span>
                <span>{cardio ? 'Km' : 'Reps'}</span>
                <span></span>
              </div>
            )}
            {en.sets.map((st, si) => {
              const prev = prevPerformance(en.exerciseId, si, cardio);
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
                    {cardio ? (
                      <>
                        <div className="set-fld">
                          <NumberField
                            value={Math.round((st.durationSec ?? 0) / 60)}
                            inputMode="numeric"
                            onCommit={(n) => setVal(ei, si, 'durationSec', n * 60)}
                          />
                        </div>
                        <div className="set-fld">
                          <NumberField
                            value={st.distanceKm ?? 0}
                            inputMode="decimal"
                            onCommit={(n) => setVal(ei, si, 'distanceKm', n)}
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="set-fld">
                          <NumberField
                            value={toDisplayWeight(st.weight, settings.units)}
                            inputMode="decimal"
                            onCommit={(n) => setVal(ei, si, 'weight', fromDisplayWeight(n, settings.units))}
                          />
                        </div>
                        <div className="set-fld">
                          <NumberField value={st.reps} inputMode="numeric" onCommit={(n) => setVal(ei, si, 'reps', n)} />
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
      })}
      </div>

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
