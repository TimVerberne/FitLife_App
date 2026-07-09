import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import type { Person, WorkoutSession } from '../lib/types';
import { MUSCLE_AXES, MUSCLE_GROUP, epley, isWorkingSet, newRecordsInWorkout, setsCountOf, volumeOf, weeklyStreak } from '../lib/records';
import { AVATAR_COLORS } from '../lib/seedData';
import { exerciseById } from '../lib/exercises';
import { formatWeight, toDisplayWeight } from '../lib/units';
import { Thumb } from '../components/Thumb';

type Period = 'week' | 'month' | 'all';
const PERIOD_DAYS: Record<Period, number | null> = { week: 7, month: 30, all: null };

function statsFor(sessions: WorkoutSession[], person: Person, periodDays: number | null, now: number) {
  const cutoff = periodDays ? now - periodDays * 86_400_000 : -Infinity;
  const mine = sessions.filter((h) => h.person === person && h.startedAt >= cutoff);
  return {
    person,
    workouts: mine.length,
    volume: mine.reduce((a, h) => a + volumeOf(h.entries), 0),
    sets: mine.reduce((a, h) => a + setsCountOf(h.entries), 0),
    totalMinutes: mine.reduce((a, h) => a + h.durationMin, 0),
    records: mine.reduce((a, h) => a + newRecordsInWorkout(sessions, h), 0),
    streak: weeklyStreak(sessions, person, now),
  };
}

function exerciseStatsFor(sessions: WorkoutSession[], person: Person, exerciseId: string, periodDays: number | null, now: number) {
  const cutoff = periodDays ? now - periodDays * 86_400_000 : -Infinity;
  let volume = 0;
  let timesPerformed = 0;
  let maxWeight = 0;
  let maxWeightReps = 0;
  let best1RM = 0;
  sessions
    .filter((h) => h.person === person && h.startedAt >= cutoff)
    .forEach((h) => {
      const entry = h.entries.find((e) => e.exerciseId === exerciseId);
      const doneSets = entry?.sets.filter(isWorkingSet) ?? [];
      if (doneSets.length === 0) return;
      timesPerformed += 1;
      doneSets.forEach((s) => {
        volume += s.weight * s.reps;
        if (s.weight > maxWeight || (s.weight === maxWeight && s.reps > maxWeightReps)) {
          maxWeight = s.weight;
          maxWeightReps = s.reps;
        }
        best1RM = Math.max(best1RM, epley(s.weight, s.reps));
      });
    });
  return { volume, timesPerformed, maxWeight, maxWeightReps, best1RM };
}

export function StatsScreen() {
  const sessions = useStore((s) => s.sessions);
  const units = useStore((s) => s.settings.units);
  const [period, setPeriod] = useState<Period>('week');
  const [selectedRival, setSelectedRival] = useState<Person | null>(null);
  const now = Date.now();

  const board = useMemo(() => {
    const people: Person[] = ['You', 'Sanne', 'Joost'];
    return people
      .map((p) => statsFor(sessions, p, PERIOD_DAYS[period], now))
      .sort((a, b) => b.volume - a.volume);
  }, [sessions, period, now]);

  const you = board.find((b) => b.person === 'You')!;
  const friends = board.filter((b) => b.person !== 'You');
  const rival = friends.find((f) => f.person === selectedRival) ?? friends[0];

  const sharedExercises = useMemo(() => {
    if (!rival) return [];
    const ids = new Set<string>();
    sessions
      .filter((h) => h.person === 'You' || h.person === rival.person)
      .forEach((h) => h.entries.forEach((e) => ids.add(e.exerciseId)));
    return Array.from(ids)
      .map(exerciseById)
      .filter((e): e is NonNullable<typeof e> => e !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, rival]);

  const muscleGroups = useMemo(() => {
    const set = new Set<string>();
    sharedExercises.forEach((ex) => {
      const axis = MUSCLE_GROUP[ex.body_part];
      if (axis) set.add(axis);
    });
    return MUSCLE_AXES.filter((a) => set.has(a));
  }, [sharedExercises]);

  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null);
  const [showAllExercises, setShowAllExercises] = useState(false);
  const muscle = muscleGroups.includes(selectedMuscle ?? '') ? selectedMuscle! : muscleGroups[0];

  const rankedExercises = useMemo(() => {
    if (!muscle || !rival) return [];
    return sharedExercises
      .filter((ex) => MUSCLE_GROUP[ex.body_part] === muscle)
      .map((ex) => {
        const y = exerciseStatsFor(sessions, 'You', ex.id, PERIOD_DAYS[period], now);
        const r = exerciseStatsFor(sessions, rival.person, ex.id, PERIOD_DAYS[period], now);
        return { ex, combined: y.volume + r.volume };
      })
      .sort((a, b) => b.combined - a.combined)
      .map((x) => x.ex);
  }, [sharedExercises, muscle, rival, sessions, period, now]);

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const exerciseId = rankedExercises.some((e) => e.id === selectedExerciseId) ? selectedExerciseId! : rankedExercises[0]?.id;
  const exercise = exerciseId ? exerciseById(exerciseId) : undefined;
  const visibleExercises = showAllExercises ? rankedExercises : rankedExercises.slice(0, 5);
  const hiddenCount = rankedExercises.length - visibleExercises.length;

  const youExStats = exercise ? exerciseStatsFor(sessions, 'You', exercise.id, PERIOD_DAYS[period], now) : null;
  const rivalExStats = exercise && rival ? exerciseStatsFor(sessions, rival.person, exercise.id, PERIOD_DAYS[period], now) : null;

  return (
    <div className="screen">
      <div className="top top-row">
        <div className="h1" style={{ fontSize: 30 }}>Stats</div>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 9, padding: 3 }}>
          {(['week', 'month', 'all'] as Period[]).map((p) => (
            <span
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: period === p ? 800 : 700,
                fontSize: 11,
                background: period === p ? 'var(--accent)' : 'transparent',
                color: period === p ? 'var(--accent-ink)' : 'var(--faint)',
                padding: '5px 9px',
                borderRadius: 6,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="section-h" style={{ marginTop: 4 }}>Leaderboard · volume</div>
      {board.map((row, i) => {
        const colors = AVATAR_COLORS[row.person];
        const isTop = i === 0;
        const displayVolume = toDisplayWeight(row.volume, units);
        return (
          <div
            key={row.person}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              background: isTop ? 'var(--accent-soft)' : 'var(--surface)',
              border: `1px solid ${isTop ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: 13,
              padding: '11px 12px',
              marginBottom: 8,
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: isTop ? 'var(--accent)' : 'var(--faint-2)', width: 16 }}>
              {i + 1}
            </div>
            <div className="av" style={{ width: 34, height: 34, fontSize: 15, background: colors.bg, color: colors.ink }}>
              {row.person.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crew-name" style={{ fontSize: 16 }}>{row.person}</div>
              <div className="crew-meta">{row.workouts} WORKOUTS</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 19, color: isTop ? 'var(--accent)' : 'var(--ink)', lineHeight: 1 }}>
              {displayVolume >= 1000 ? `${(displayVolume / 1000).toFixed(1)}` : Math.round(displayVolume)}
              {displayVolume >= 1000 && <span style={{ fontSize: 10, color: 'var(--faint)' }}>k</span>}
            </div>
          </div>
        );
      })}

      {rival && (
        <>
          <div className="section-h">Head to head</div>
          {friends.length > 1 && (
            <div className="chips" style={{ marginBottom: 6 }}>
              {friends.map((f) => (
                <button
                  key={f.person}
                  className={`chip${rival.person === f.person ? ' on' : ''}`}
                  onClick={() => setSelectedRival(f.person)}
                >
                  vs {f.person}
                </button>
              ))}
            </div>
          )}
          <HeadToHeadLegend rivalName={rival.person} rivalColor={AVATAR_COLORS[rival.person].bg} />
          <div className="h2h-grid">
            <HeadToHeadTile label="Workouts" youVal={you.workouts} rivalVal={rival.workouts} format={(v) => String(v)} rivalColor={AVATAR_COLORS[rival.person].bg} />
            <HeadToHeadTile
              label="Volume"
              youVal={toDisplayWeight(you.volume, units)}
              rivalVal={toDisplayWeight(rival.volume, units)}
              format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K ${units}` : `${Math.round(v)} ${units}`)}
              rivalColor={AVATAR_COLORS[rival.person].bg}
            />
            <HeadToHeadTile label="Sets" youVal={you.sets} rivalVal={rival.sets} format={(v) => String(v)} rivalColor={AVATAR_COLORS[rival.person].bg} />
            <HeadToHeadTile label="Time trained" youVal={you.totalMinutes} rivalVal={rival.totalMinutes} format={(v) => `${v}min`} rivalColor={AVATAR_COLORS[rival.person].bg} />
            <HeadToHeadTile label="Records set" youVal={you.records} rivalVal={rival.records} format={(v) => String(v)} rivalColor={AVATAR_COLORS[rival.person].bg} />
            <HeadToHeadTile label="Streak" youVal={you.streak} rivalVal={rival.streak} format={(v) => String(v)} rivalColor={AVATAR_COLORS[rival.person].bg} />
          </div>

          <div className="section-h">Exercise head to head</div>
          {sharedExercises.length === 0 ? (
            <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 4 }}>
              Neither of you has logged an exercise yet.
            </p>
          ) : (
            <>
              <div className="chips" style={{ marginBottom: 10 }}>
                {muscleGroups.map((g) => (
                  <button
                    key={g}
                    className={`chip${muscle === g ? ' on' : ''}`}
                    onClick={() => {
                      setSelectedMuscle(g);
                      setSelectedExerciseId(null);
                      setShowAllExercises(false);
                    }}
                  >
                    {g}
                  </button>
                ))}
              </div>

              {visibleExercises.map((ex, i) => {
                const active = ex.id === exerciseId;
                return (
                  <button
                    key={ex.id}
                    className={`ex-lead-row${active ? ' on' : ''}`}
                    onClick={() => setSelectedExerciseId(ex.id)}
                  >
                    <span className="ex-lead-rank">{i + 1}</span>
                    <Thumb className="ph" src={ex.image} alt={ex.name} style={{ width: 34, height: 34, borderRadius: 8, objectFit: 'cover' }} />
                    <span className="ex-lead-name">{ex.name}</span>
                  </button>
                );
              })}
              {rankedExercises.length > 5 && (
                <button className="feed-more" onClick={() => setShowAllExercises((v) => !v)}>
                  {hiddenCount > 0 ? `Show ${hiddenCount} more` : 'Show less'}
                </button>
              )}

              {exercise && youExStats && rivalExStats && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 2px 10px' }}>
                    <Thumb
                      className="ph"
                      src={exercise.image}
                      alt={exercise.name}
                      style={{ width: 44, height: 44, borderRadius: 9, objectFit: 'cover' }}
                    />
                    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, textTransform: 'capitalize' }}>
                      {exercise.name}
                    </div>
                  </div>
                  <div className="h2h-grid">
                    <HeadToHeadTile
                      label="Heaviest set"
                      youVal={toDisplayWeight(youExStats.maxWeight, units)}
                      rivalVal={toDisplayWeight(rivalExStats.maxWeight, units)}
                      format={(v) => `${Math.round(v)}${units}`}
                      youDisplay={youExStats.maxWeight > 0 ? `${formatWeight(youExStats.maxWeight, units)}×${youExStats.maxWeightReps}` : '—'}
                      rivalDisplay={rivalExStats.maxWeight > 0 ? `${formatWeight(rivalExStats.maxWeight, units)}×${rivalExStats.maxWeightReps}` : '—'}
                      rivalColor={AVATAR_COLORS[rival.person].bg}
                    />
                    <HeadToHeadTile
                      label="Est. 1RM"
                      youVal={toDisplayWeight(youExStats.best1RM, units)}
                      rivalVal={toDisplayWeight(rivalExStats.best1RM, units)}
                      format={(v) => (v > 0 ? `${Math.round(v)}${units}` : '—')}
                      rivalColor={AVATAR_COLORS[rival.person].bg}
                    />
                    <HeadToHeadTile
                      label="Total volume"
                      youVal={toDisplayWeight(youExStats.volume, units)}
                      rivalVal={toDisplayWeight(rivalExStats.volume, units)}
                      format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K ${units}` : `${Math.round(v)} ${units}`)}
                      rivalColor={AVATAR_COLORS[rival.person].bg}
                    />
                    <HeadToHeadTile
                      label="Times performed"
                      youVal={youExStats.timesPerformed}
                      rivalVal={rivalExStats.timesPerformed}
                      format={(v) => String(v)}
                      rivalColor={AVATAR_COLORS[rival.person].bg}
                    />
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function HeadToHeadLegend({ rivalName, rivalColor }: { rivalName: string; rivalColor: string }) {
  return (
    <div className="h2h-legend">
      <span className="h2h-legend-item"><i style={{ background: 'var(--accent)' }} /> You</span>
      <span className="h2h-legend-item"><i style={{ background: rivalColor }} /> {rivalName}</span>
    </div>
  );
}

function HeadToHeadTile({
  label,
  youVal,
  rivalVal,
  format,
  youDisplay,
  rivalDisplay,
  rivalColor,
}: {
  label: string;
  youVal: number;
  rivalVal: number;
  format: (v: number) => string;
  youDisplay?: string;
  rivalDisplay?: string;
  rivalColor: string;
}) {
  const max = Math.max(youVal, rivalVal, 1);
  const youPct = (youVal / max) * 100;
  const rivalPct = (rivalVal / max) * 100;
  const youWins = youVal > rivalVal;
  const rivalWins = rivalVal > youVal;
  return (
    <div className="h2h-tile">
      <div className="h2h-tile-label">{label}</div>
      <div className="h2h-bar">
        <div className="h2h-track">
          <div className="h2h-fill" style={{ width: `${youPct}%`, background: 'var(--accent)' }} />
        </div>
        <span className={`h2h-bar-val${youWins ? ' win' : ''}`}>{youDisplay ?? format(youVal)}</span>
      </div>
      <div className="h2h-bar">
        <div className="h2h-track">
          <div className="h2h-fill" style={{ width: `${rivalPct}%`, background: rivalColor }} />
        </div>
        <span className={`h2h-bar-val${rivalWins ? ' win' : ''}`}>{rivalDisplay ?? format(rivalVal)}</span>
      </div>
    </div>
  );
}
