import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { exerciseById, isCardioExercise } from '../../lib/exercises';
import { recordSetIndexesInWorkout, relativeDate, setsCountOf, volumeOf } from '../../lib/records';
import { colorForPerson } from '../../lib/colors';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../../lib/units';
import { Thumb } from '../../components/Thumb';
import { NumberField } from '../../components/NumberField';

export function WorkoutDetailSheet() {
  const viewingSessionId = useStore((s) => s.viewingSessionId);
  const ownSessions = useStore((s) => s.sessions);
  const friendSessions = useStore((s) => s.friendSessions);
  const session = useMemo(
    () => [...ownSessions, ...friendSessions].find((x) => x.id === viewingSessionId),
    [ownSessions, friendSessions, viewingSessionId],
  );
  const copyWorkoutToRoutines = useStore((s) => s.copyWorkoutToRoutines);
  const repeatWorkout = useStore((s) => s.repeatWorkout);
  const updateHistorySet = useStore((s) => s.updateHistorySet);
  const addHistorySet = useStore((s) => s.addHistorySet);
  const removeHistorySet = useStore((s) => s.removeHistorySet);
  const removeHistoryExercise = useStore((s) => s.removeHistoryExercise);
  const openPickerForHistory = useStore((s) => s.openPickerForHistory);
  const deleteSession = useStore((s) => s.deleteSession);
  const confirm = useStore((s) => s.confirm);
  const units = useStore((s) => s.settings.units);
  // In the store, not local state — adding an exercise mid-edit replaces
  // this sheet with the picker and back (only one sheet renders at a
  // time), which would otherwise silently reset editing to false on remount.
  const editing = useStore((s) => s.historyEditing);
  const setEditing = useStore((s) => s.setHistoryEditing);

  // Which set in each exercise earned a record — same derivation the feed's
  // 🏆 count uses, so the marked sets always add up to the number shown there.
  const recordSets = useMemo(
    () => (session ? recordSetIndexesInWorkout([...ownSessions, ...friendSessions], session) : new Map<string, number>()),
    [ownSessions, friendSessions, session],
  );

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
            onClick={() => setEditing(!editing)}
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
        const recordSetIdx = recordSets.get(entry.exerciseId);
        return (
          <div className="s-ex" key={i}>
            <div className="s-top">
              <Thumb className="ph" src={ex.image} alt={ex.name} />
              <div className="s-name" style={{ fontWeight: 700, flex: 1 }}>
                {ex.name}
                {recordSetIdx !== undefined && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: '.06em',
                      color: 'var(--gold)',
                      marginLeft: 6,
                      textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    🏆 New PR
                  </span>
                )}
              </div>
              {editing && (
                <button
                  className="s-del"
                  aria-label={`Remove ${ex.name} from this workout`}
                  onClick={() =>
                    confirm(`Remove ${ex.name} and all its logged sets from this workout?`, 'Remove', () => removeHistoryExercise(session.id, i), true)
                  }
                >
                  ✕
                </button>
              )}
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
                          ariaLabel={`Set ${si + 1} minutes`}
                          onCommit={(n) => updateHistorySet(session.id, i, si, 'durationSec', n * 60)}
                        />
                      </div>
                      <span className="hist-edit-x">min ·</span>
                      <div className="set-fld">
                        <NumberField
                          value={s.distanceKm ?? 0}
                          inputMode="decimal"
                          ariaLabel={`Set ${si + 1} distance in kilometers`}
                          onCommit={(n) => updateHistorySet(session.id, i, si, 'distanceKm', n)}
                        />
                      </div>
                      <span className="hist-edit-x">km</span>
                      <button className="s-del" aria-label={`Remove set ${si + 1}`} onClick={() => removeHistorySet(session.id, i, si)}>
                        ✕
                      </button>
                    </div>
                  ) : (
                    <div className="hist-edit-row" key={si}>
                      <div className="set-fld">
                        <NumberField
                          value={toDisplayWeight(s.weight, units)}
                          inputMode="decimal"
                          ariaLabel={`Set ${si + 1} weight in ${units}`}
                          onCommit={(n) => updateHistorySet(session.id, i, si, 'weight', fromDisplayWeight(n, units))}
                        />
                      </div>
                      <span className="hist-edit-x">{units} ×</span>
                      <div className="set-fld">
                        <NumberField
                          value={s.reps}
                          inputMode="numeric"
                          ariaLabel={`Set ${si + 1} reps`}
                          onCommit={(n) => updateHistorySet(session.id, i, si, 'reps', n)}
                        />
                      </div>
                      <button className="s-del" aria-label={`Remove set ${si + 1}`} onClick={() => removeHistorySet(session.id, i, si)}>
                        ✕
                      </button>
                    </div>
                  ),
                )}
                <button className="add-set" onClick={() => addHistorySet(session.id, i)}>
                  + Add set
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {entry.sets.map((s, si) => {
                  const isRecordSet = si === recordSetIdx;
                  return (
                    <span
                      className="tag"
                      key={si}
                      title={isRecordSet ? 'This set set a new personal record' : undefined}
                      style={
                        isRecordSet
                          ? {
                              color: 'var(--gold)',
                              background: 'rgba(242, 201, 76, 0.12)',
                              border: '1px solid var(--gold)',
                              fontWeight: 700,
                            }
                          : { color: 'var(--ink)', background: 'var(--surface-2)' }
                      }
                    >
                      {isRecordSet && '🏆 '}
                      {cardio
                        ? `${Math.round((s.durationSec ?? 0) / 60)}min · ${(s.distanceKm ?? 0).toFixed(1)}km`
                        : `${s.weight > 0 ? `${formatWeight(s.weight, units)}${units}` : 'bodyweight'} × ${s.reps}`}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {editing && (
        <button className="add-ex" onClick={() => openPickerForHistory(session.id)}>
          + Add exercise
        </button>
      )}
      {session.person !== 'You' ? (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => copyWorkoutToRoutines(session.id)}>
          Copy to my routines
        </button>
      ) : (
        <>
          <button className="btn sec" style={{ marginTop: 16 }} onClick={() => repeatWorkout(session.id)}>
            Do again
          </button>
          <button className="btn danger" style={{ marginTop: 10 }} onClick={() => deleteSession(session.id)}>
            Delete workout
          </button>
        </>
      )}
    </div>
  );
}
