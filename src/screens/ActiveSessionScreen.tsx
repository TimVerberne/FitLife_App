import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById, isCardioExercise } from '../lib/exercises';
import { personalRecords, plannedSetsCountOf, setsCountOf, volumeOf } from '../lib/records';
import { useElapsedMinutes } from '../lib/useElapsedMinutes';
import { useDragReorder } from '../lib/useDragReorder';
import { toDisplayWeight } from '../lib/units';
import { RestTimerBar } from '../components/RestTimerBar';
import { ExerciseCard, type MenuState } from '../features/session/ExerciseCard';
import type { SessionEntry } from '../lib/types';

// Reordering swaps every card to a fixed height (see .s-ex.compact) so a
// dragged card's target slot is plain arithmetic on the pointer's Y delta,
// instead of re-measuring variable-height cards (which is what full cards
// are, once sets/rest-timer content is showing) after every swap. Drag
// mechanics themselves live in the shared useDragReorder hook (also used by
// TrainScreen's routine reorder).
const COMPACT_CARD_HEIGHT = 60;
const COMPACT_GAP = 14;
const COMPACT_ROW_HEIGHT = COMPACT_CARD_HEIGHT + COMPACT_GAP;

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
  const pairSuperset = useStore((s) => s.pairSuperset);
  const unpairSuperset = useStore((s) => s.unpairSuperset);
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
  // Built once per render (not once per set row) — the most recent prior
  // session's entry for each exercise currently in this workout, so
  // prevPerformance() below is a plain map lookup instead of re-scanning
  // the full session history for every single set displayed.
  const exerciseIdsKey = active ? active.entries.map((e) => e.exerciseId).join(',') : '';
  const priorEntryByExerciseId = useMemo(() => {
    const map = new Map<string, SessionEntry>();
    if (!exerciseIdsKey) return map;
    const exerciseIds = exerciseIdsKey.split(',');
    const mySessions = sessions.filter((h) => h.person === 'You').sort((a, b) => b.startedAt - a.startedAt);
    exerciseIds.forEach((id) => {
      for (const h of mySessions) {
        const entry = h.entries.find((e) => e.exerciseId === id);
        if (entry) {
          map.set(id, entry);
          break;
        }
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, exerciseIdsKey]);
  // One stable array shared by every card (rather than each card filtering
  // `active.entries` itself into a fresh array every render) — recomputed
  // only when the set of exercises actually changes, not on every keystroke,
  // so it doesn't defeat ExerciseCard's memoization for unrelated cards.
  const allExercises = useMemo(
    () => (exerciseIdsKey ? exerciseIdsKey.split(',').map((id) => ({ exerciseId: id, name: exerciseById(id)?.name ?? '?' })) : []),
    [exerciseIdsKey],
  );
  const mins = useElapsedMinutes(active?.startedAt ?? Date.now());
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [restMenuFor, setRestMenuFor] = useState<string | null>(null);
  const [supersetMenuFor, setSupersetMenuFor] = useState<string | null>(null);
  const { drag, startDrag, startKeyboardReorder, moveKeyboardSlot, confirmKeyboardReorder, cancelKeyboardReorder } = useDragReorder(
    active?.entries.length ?? 0,
    COMPACT_ROW_HEIGHT,
    reorderEntries,
  );
  const [headerHidden, setHeaderHidden] = useState(false);
  const lastScrollTop = useRef(0);
  const screenRef = useRef<HTMLDivElement>(null);

  // Hides the sticky mint header on any downward scroll and slides it back
  // on any upward scroll, however small — no dead zone, since real
  // touch/momentum scrolling fires many small 'scroll' events (often just a
  // few px each) rather than one big jump. An earlier version required a
  // single event's delta to exceed a few px before reacting, which made the
  // "hide" direction fire fine (a fast downward flick easily clears it in
  // one frame) but the "reveal" direction rarely did for a small deliberate
  // upward correction, so the header only ever came back once you scrolled
  // all the way back to the very top. Comparing sign only, every event,
  // fixes that without needing a magnitude threshold at all.
  //
  // Listens on the .screen element itself, which during a session is a real
  // internal scroll container (the .app-shell.is-session rule pins the shell
  // to the viewport height so .screen's overflow-y: auto actually engages —
  // see App.tsx). This is also what makes the header's `position: sticky`
  // pin correctly: sticky resolves against .screen, so .screen has to be the
  // thing that scrolls, not the document.
  useEffect(() => {
    const el = screenRef.current;
    if (!el) return;
    function onScroll() {
      const top = el!.scrollTop;
      const delta = top - lastScrollTop.current;
      if (top <= 0) setHeaderHidden(false);
      else if (delta > 0) setHeaderHidden(true);
      else if (delta < 0) setHeaderHidden(false);
      lastScrollTop.current = top;
    }
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

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
  const total = plannedSetsCountOf(active.entries);
  const liveVolume = Math.round(toDisplayWeight(volumeOf(active.entries), settings.units));

  return (
    <div className="screen" ref={screenRef} style={{ padding: '0 18px 24px' }}>
      <div className={`sess-bar${headerHidden ? ' hidden' : ''}`}>
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
            fontSize: 16,
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
          <ExerciseCard
            key={en.exerciseId}
            ei={ei}
            entry={en}
            ex={ex}
            cardio={cardio}
            startingBest={rec?.estOneRepMax ?? 0}
            priorEntry={priorEntryByExerciseId.get(en.exerciseId)}
            restSeconds={active.restTimers[en.exerciseId]}
            units={settings.units}
            confirmRemoveExercise={settings.confirmRemoveExercise}
            compact={!!drag}
            isDraggingThis={isDraggingThis}
            positionStyle={positionStyle}
            menu={menu?.exerciseId === en.exerciseId ? menu : null}
            restMenuOpen={restMenuFor === en.exerciseId}
            supersetMenuOpen={supersetMenuFor === en.exerciseId}
            allExercises={allExercises}
            setMenu={setMenu}
            setRestMenuFor={setRestMenuFor}
            setSupersetMenuFor={setSupersetMenuFor}
            setVal={setVal}
            toggleSet={toggleSet}
            addSet={addSet}
            removeSet={removeSet}
            setSetKind={setSetKind}
            applyDropSet={applyDropSet}
            removeExercise={removeExercise}
            setRestDuration={setRestDuration}
            pairSuperset={pairSuperset}
            unpairSuperset={unpairSuperset}
            openDetail={openDetail}
            confirm={confirm}
            startDrag={startDrag}
            startKeyboardReorder={startKeyboardReorder}
            moveKeyboardSlot={moveKeyboardSlot}
            confirmKeyboardReorder={confirmKeyboardReorder}
            cancelKeyboardReorder={cancelKeyboardReorder}
          />
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
