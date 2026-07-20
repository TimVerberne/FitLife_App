import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import type { Exercise } from '../lib/types';
import { relativeDate, sortRoutines } from '../lib/records';
import { Thumb } from '../components/Thumb';

// Same fixed-height-during-drag technique as the exercise reorder in
// ActiveSessionScreen.tsx — a dragged card's target slot is plain
// arithmetic on the pointer's Y delta instead of re-measuring
// variable-height cards after every swap.
const COMPACT_CARD_HEIGHT = 60;
const COMPACT_GAP = 12;
const COMPACT_ROW_HEIGHT = COMPACT_CARD_HEIGHT + COMPACT_GAP;

interface DragState {
  order: number[]; // order[slot] = original sortedRoutines-index now occupying that slot
  draggingIndex: number; // the original sortedRoutines-index being dragged
  startSlot: number;
  startY: number;
  dy: number;
}

export function TrainScreen() {
  const routinesRaw = useStore((s) => s.routines);
  const sessions = useStore((s) => s.sessions);
  const startSession = useStore((s) => s.startSession);
  const openRoutineActions = useStore((s) => s.openRoutineActions);
  const reorderRoutines = useStore((s) => s.reorderRoutines);

  const routines = useMemo(() => sortRoutines(routinesRaw), [routinesRaw]);

  const lastTrained = useMemo(() => {
    const map = new Map<string, number>();
    sessions
      .filter((h) => h.person === 'You' && h.routineId)
      .forEach((h) => {
        const prev = map.get(h.routineId!) ?? 0;
        if (h.startedAt > prev) map.set(h.routineId!, h.startedAt);
      });
    return map;
  }, [sessions]);

  const [drag, setDrag] = useState<DragState | null>(null);
  // See ActiveSessionScreen.tsx for why the reorder commits off this ref
  // rather than off `drag` (React state) directly — same "setState during
  // render" pitfall applies here.
  const dragRef = useRef<DragState | null>(null);

  function startDrag(e: React.PointerEvent, originalIndex: number) {
    const d: DragState = {
      order: routines.map((_, i) => i),
      draggingIndex: originalIndex,
      startSlot: originalIndex,
      startY: e.clientY,
      dy: 0,
    };
    dragRef.current = d;
    setDrag(d);
  }

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
      if (d) reorderRoutines(d.order);
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

  return (
    <div className="screen">
      <div className="top top-row">
        <div className="h1" style={{ fontSize: 30 }}>Routines</div>
        <button
          onClick={() => startSession(null)}
          aria-label="Start a new routine"
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: 'var(--accent)',
            color: 'var(--accent-ink)',
            display: 'grid',
            placeItems: 'center',
            fontSize: 19,
            fontWeight: 800,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>

      {routines.length === 0 && (
        <div className="empty-state">
          <div className="h1">No routines yet</div>
          <p>Build one now, or finish a workout and save it as a routine afterwards.</p>
        </div>
      )}

      <div
        className={`routine-list${drag ? ' reordering' : ''}`}
        style={drag ? { position: 'relative', height: routines.length * COMPACT_ROW_HEIGHT } : undefined}
      >
      {(drag ? drag.order : routines.map((_, i) => i)).map((ri, slot) => {
        const r = routines[ri];
        const exercises = r.exerciseIds.map(exerciseById).filter((e): e is Exercise => e !== undefined);
        const bodyParts = Array.from(new Set(exercises.map((e) => e.target)));
        const last = lastTrained.get(r.id);
        const isDraggingThis = !!drag && ri === drag.draggingIndex;
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
          <div
            className={`routine-card${drag ? ' compact' : ''}${isDraggingThis ? ' dragging' : ''}`}
            key={r.id}
            role="button"
            tabIndex={0}
            style={positionStyle}
            onClick={() => !drag && startSession(r.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') startSession(r.id);
            }}
          >
            <div className="routine-top">
              <div style={{ minWidth: 0 }}>
                <div className="routine-name">{r.name}</div>
                {!drag && (
                  <div className="routine-meta">
                    {r.exerciseIds.length} EXERCISES{last ? ` · LAST ${relativeDate(last).toUpperCase()}` : ''}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {!drag && (
                  <button
                    className="info-btn"
                    aria-label={`${r.name} options`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openRoutineActions(r.id);
                    }}
                  >
                    ⋯
                  </button>
                )}
                <button
                  className="s-drag-handle"
                  aria-label={`Reorder ${r.name}`}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => startDrag(e, ri)}
                >
                  ⠿
                </button>
                {!drag && <span className="go-arrow">›</span>}
              </div>
            </div>
            {!drag && (
              <>
                <div style={{ display: 'flex', marginTop: 11 }}>
                  {exercises.slice(0, 5).map((e, i) => (
                    <Thumb
                      key={e.id}
                      className="pick-thumb"
                      src={e.image}
                      alt={e.name}
                      style={{ width: 34, height: 34, borderRadius: 8, marginLeft: i === 0 ? 0 : -6, border: '2px solid var(--surface)' }}
                    />
                  ))}
                </div>
                <div className="tag-row">
                  {bodyParts.slice(0, 2).map((bp, i) => (
                    <span key={bp} className={`tag${i === 0 ? ' on' : ''}`}>
                      {bp}
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        );
      })}
      </div>

      <button className="new-routine-card" onClick={() => startSession(null)}>
        + New routine
      </button>
    </div>
  );
}
