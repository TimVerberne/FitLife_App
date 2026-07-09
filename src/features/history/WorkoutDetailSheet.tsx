import { useStore } from '../../store/useStore';
import { exerciseById } from '../../lib/exercises';
import { relativeDate, setsCountOf, volumeOf } from '../../lib/records';
import { AVATAR_COLORS } from '../../lib/seedData';
import { Thumb } from '../../components/Thumb';

export function WorkoutDetailSheet() {
  const viewingSessionId = useStore((s) => s.viewingSessionId);
  const session = useStore((s) => s.sessions.find((x) => x.id === viewingSessionId));
  const copyWorkoutToRoutines = useStore((s) => s.copyWorkoutToRoutines);
  const repeatWorkout = useStore((s) => s.repeatWorkout);

  if (!session) return null;
  const colors = AVATAR_COLORS[session.person];
  const initials = session.person === 'You' ? 'Y' : session.person.slice(0, 1);

  return (
    <div className="sheet-in">
      <div className="wo-head" style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '2px 0 14px' }}>
        <div className="av round" style={{ width: 48, height: 48, fontSize: 19, background: colors.bg, color: colors.ink }}>
          {initials}
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 19 }}>
            {session.person === 'You' ? 'Your workout' : session.person}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            {session.name} · {relativeDate(session.startedAt)}
          </div>
        </div>
      </div>
      <div className="stat-grid" style={{ marginBottom: 6 }}>
        <div className="stat-tile">
          <div className="n">{Math.round(volumeOf(session.entries)).toLocaleString('en-US')}</div>
          <div className="l">kg volume</div>
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
        return (
          <div className="s-ex" key={i}>
            <div className="s-top">
              <Thumb className="ph" src={ex.image} alt={ex.name} />
              <div className="s-name" style={{ fontWeight: 700 }}>{ex.name}</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {entry.sets.map((s, si) => (
                <span className="tag" key={si} style={{ color: 'var(--ink)', background: 'var(--surface-2)' }}>
                  {s.weight > 0 ? `${s.weight}kg` : 'bodyweight'} × {s.reps}
                </span>
              ))}
            </div>
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
