import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { exerciseById, isCardioExercise } from '../../lib/exercises';
import { relativeDate, setsCountOf, volumeOf } from '../../lib/records';
import { colorForPerson } from '../../lib/colors';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../../lib/units';
import { Thumb } from '../../components/Thumb';
import { NumberField } from '../../components/NumberField';

export function WorkoutDetailSheet() {
  const viewingSessionId = useStore((s) => s.viewingSessionId);
  const session = useStore((s) => [...s.sessions, ...s.friendSessions].find((x) => x.id === viewingSessionId));
  const copyWorkoutToRoutines = useStore((s) => s.copyWorkoutToRoutines);
  const repeatWorkout = useStore((s) => s.repeatWorkout);
  const updateHistorySet = useStore((s) => s.updateHistorySet);
  const units = useStore((s) => s.settings.units);
  const [editing, setEditing] = useState(false);

  if (!session) return null;
  const colors = colorForPerson(session.person);
  const initials = session.person === 'You' ? 'Y' : session.person.slice(0, 1);
  const canEdit = session.person === 'You';

  return (
    <div className="sheet-in">
      <div className="wo-head" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 14px' }}>
        <div className="av round" style={{ width: 48, height: 48, fontSize: 19, background: colors.bg, color: colors.ink }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19 }}>
            {session.person === 'You' ? 'Your workout' : session.person}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {session.name} · {relativeDate(session.startedAt)}
          </div>
        </div>
        {canEdit && (
          <button
            className="info-btn"
            aria-label={editing ? 'Done editing' : 'Edit logged sets'}
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? '✓' : '✎'}
          </button>
        )}
      </div>
      <div className="stat-grid" style={{ marginBottom: 6 }}>
        <div className="stat-tile">
          <div className="n">{Math.round(toDisplayWeight(volumeOf(session.entries), units)).toLocaleString('en-US')}</div>
          <div className="l">{units} volume</div>
        </div>
        <div className="stat-tile">
          <div className="n">{setsCountOf(session.entries)}</div>
          <div className="l">sets</div>
        </div>
        <div className="stat-tile">
          <div className="n">{session.durationMin}</div>
          <div className="l">minutes</div>
        </div>
      </div>
      {session.entries.map((entry, i) => {
        const ex = exerciseById(entry.exerciseId);
        if (!ex) return null;
        const cardio = isCardioExercise(ex);
        return (
          <div className="s-ex" key={i}>
            <div className="s-top">
              <Thumb className="ph" src={ex.image} alt={ex.name} />
              <div className="s-name" style={{ fontWeight: 700 }}>{ex.name}</div>
            </div>
            {editing ? (
              <div>
                {entry.sets.map((s, si) =>
                  cardio ? (
                    <div className="hist-edit-row" key={si}>
                      <div className="set-fld">
                        <NumberField
                          value={Math.round((s.durationSec ?? 0) / 60)}
                          inputMode="numeric"
                          onCommit={(n) => updateHistorySet(session.id, i, si, 'durationSec', n * 60)}
                        />
                      </div>
                      <span className="hist-edit-x">min ·</span>
                      <div className="set-fld">
                        <NumberField
                          value={s.distanceKm ?? 0}
                          inputMode="decimal"
                          onCommit={(n) => updateHistorySet(session.id, i, si, 'distanceKm', n)}
                        />
                      </div>
                      <span className="hist-edit-x">km</span>
                    </div>
                  ) : (
                    <div className="hist-edit-row" key={si}>
                      <div className="set-fld">
                        <NumberField
                          value={toDisplayWeight(s.weight, units)}
                          inputMode="decimal"
                          onCommit={(n) => updateHistorySet(session.id, i, si, 'weight', fromDisplayWeight(n, units))}
                        />
                      </div>
                      <span className="hist-edit-x">{units} ×</span>
                      <div className="set-fld">
                        <NumberField value={s.reps} inputMode="numeric" onCommit={(n) => updateHistorySet(session.id, i, si, 'reps', n)} />
                      </div>
                    </div>
                  ),
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entry.sets.map((s, si) => (
                  <span className="tag" key={si} style={{ color: 'var(--ink)', background: 'var(--surface-2)' }}>
                    {cardio
                      ? `${Math.round((s.durationSec ?? 0) / 60)}min · ${(s.distanceKm ?? 0).toFixed(1)}km`
                      : `${s.weight > 0 ? `${formatWeight(s.weight, units)}${units}` : 'bodyweight'} × ${s.reps}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {session.person !== 'You' ? (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => copyWorkoutToRoutines(session.id)}>
          Copy to my routines
        </button>
      ) : (
        <button className="btn sec" style={{ marginTop: 16 }} onClick={() => repeatWorkout(session.id)}>
          Do again
        </button>
      )}
    </div>
  );
}
