import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import type { Exercise } from '../lib/types';
import { relativeDate, sortRoutines } from '../lib/records';
import { useDragReorder } from '../lib/useDragReorder';
import { Thumb } from '../components/Thumb';

// Same fixed-height-during-drag technique as the exercise reorder in
// ActiveSessionScreen.tsx (both go through the shared useDragReorder hook)
// — a dragged card's target slot is plain arithmetic on the pointer's Y
// delta instead of re-measuring variable-height cards after every swap.
const COMPACT_CARD_HEIGHT = 60;
const COMPACT_GAP = 12;
const COMPACT_ROW_HEIGHT = COMPACT_CARD_HEIGHT + COMPACT_GAP;

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

  const { drag, startDrag, startKeyboardReorder, moveKeyboardSlot, confirmKeyboardReorder, cancelKeyboardReorder } = useDragReorder(
    routines.length,
    COMPACT_ROW_HEIGHT,
    reorderRoutines,
  );

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
        // Skipped entirely while dragging — the compact drag view (`!drag &&`
        // below) never renders this, so mapping every routine's
        // exerciseIds through exerciseById and rebuilding a body-part Set on
        // every pointermove-driven re-render was pure wasted work.
        const exercises = drag ? [] : r.exerciseIds.map(exerciseById).filter((e): e is Exercise => e !== undefined);
        const bodyParts = drag ? [] : Array.from(new Set(exercises.map((e) => e.target)));
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
                  aria-label={`Reorder ${r.name}. Press Enter to pick up, arrow keys to move, Enter again to drop.`}
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => startDrag(e, ri)}
                  onKeyDown={(e) => {
                    const isActive = drag?.draggingIndex === ri;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (isActive) confirmKeyboardReorder();
                      else startKeyboardReorder(ri);
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
                  {exercises.length > 5 && (
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        marginLeft: -6,
                        border: '2px solid var(--surface)',
                        background: 'var(--surface-2)',
                        color: 'var(--faint)',
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 11,
                        fontWeight: 700,
                        fontFamily: 'var(--font-display)',
                      }}
                    >
                      +{exercises.length - 5}
                    </div>
                  )}
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
