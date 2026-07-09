import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import type { Exercise } from '../lib/types';
import { relativeDate } from '../lib/records';
import { Thumb } from '../components/Thumb';

export function TrainScreen() {
  const routines = useStore((s) => s.routines);
  const sessions = useStore((s) => s.sessions);
  const startSession = useStore((s) => s.startSession);
  const openRoutineActions = useStore((s) => s.openRoutineActions);

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

      {routines.map((r) => {
        const exercises = r.exerciseIds.map(exerciseById).filter((e): e is Exercise => e !== undefined);
        const bodyParts = Array.from(new Set(exercises.map((e) => e.target)));
        const last = lastTrained.get(r.id);
        return (
          <div
            className="routine-card"
            key={r.id}
            role="button"
            tabIndex={0}
            onClick={() => startSession(r.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') startSession(r.id);
            }}
          >
            <div className="routine-top">
              <div style={{ minWidth: 0 }}>
                <div className="routine-name">{r.name}</div>
                <div className="routine-meta">
                  {r.exerciseIds.length} EXERCISES{last ? ` · LAST ${relativeDate(last).toUpperCase()}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                <span className="go-arrow">›</span>
              </div>
            </div>
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
          </div>
        );
      })}

      <button className="new-routine-card" onClick={() => startSession(null)}>
        + New routine
      </button>
    </div>
  );
}
