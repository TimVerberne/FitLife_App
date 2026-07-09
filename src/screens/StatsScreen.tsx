import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import type { Person, WorkoutSession } from '../lib/types';
import { epley, newRecordsInWorkout, setsCountOf, volumeOf, weeklyStreak } from '../lib/records';
import { AVATAR_COLORS } from '../lib/seedData';
import { exerciseById } from '../lib/exercises';
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
      const doneSets = entry?.sets.filter((s) => s.done) ?? [];
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

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const exerciseId = sharedExercises.some((e) => e.id === selectedExerciseId) ? selectedExerciseId! : sharedExercises[0]?.id;
  const exercise = exerciseId ? exerciseById(exerciseId) : undefined;

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
        return (
          <div
            key={row.person}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              background: isTop ? 'rgba(116,224,174,.1)' : 'var(--surface)',
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
              {row.volume >= 1000 ? `${(row.volume / 1000).toFixed(1)}` : Math.round(row.volume)}
              {row.volume >= 1000 && <span style={{ fontSize: 10, color: 'var(--faint)' }}>k</span>}
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
          <div className="card">
            <HeadToHeadRow label="Workouts" youVal={you.workouts} rivalVal={rival.workouts} format={(v) => String(v)} />
            <HeadToHeadRow
              label="Volume"
              youVal={you.volume}
              rivalVal={rival.volume}
              format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K kg` : `${Math.round(v)} kg`)}
            />
            <HeadToHeadRow label="Sets" youVal={you.sets} rivalVal={rival.sets} format={(v) => String(v)} />
            <HeadToHeadRow label="Time trained" youVal={you.totalMinutes} rivalVal={rival.totalMinutes} format={(v) => `${v}min`} />
            <HeadToHeadRow label="Records set" youVal={you.records} rivalVal={rival.records} format={(v) => String(v)} />
            <HeadToHeadRow label="Streak" youVal={you.streak} rivalVal={rival.streak} format={(v) => String(v)} last />
          </div>

          <div className="section-h">Exercise head to head</div>
          {sharedExercises.length === 0 ? (
            <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 4 }}>
              Neither of you has logged an exercise yet.
            </p>
          ) : (
            <>
              <select
                value={exerciseId}
                onChange={(e) => setSelectedExerciseId(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  borderRadius: 11,
                  padding: '10px 12px',
                  color: 'var(--ink)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  marginBottom: 10,
                }}
              >
                {sharedExercises.map((ex) => (
                  <option key={ex.id} value={ex.id} style={{ textTransform: 'capitalize' }}>
                    {ex.name}
                  </option>
                ))}
              </select>
              {exercise && youExStats && rivalExStats && (
                <div className="card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
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
                  <HeadToHeadRow
                    label="Heaviest set"
                    youVal={youExStats.maxWeight}
                    rivalVal={rivalExStats.maxWeight}
                    format={(v) => `${v}kg`}
                    youDisplay={youExStats.maxWeight > 0 ? `${youExStats.maxWeight}×${youExStats.maxWeightReps}` : '—'}
                    rivalDisplay={rivalExStats.maxWeight > 0 ? `${rivalExStats.maxWeight}×${rivalExStats.maxWeightReps}` : '—'}
                  />
                  <HeadToHeadRow
                    label="Est. 1RM"
                    youVal={youExStats.best1RM}
                    rivalVal={rivalExStats.best1RM}
                    format={(v) => (v > 0 ? `${Math.round(v)}kg` : '—')}
                  />
                  <HeadToHeadRow
                    label="Total volume"
                    youVal={youExStats.volume}
                    rivalVal={rivalExStats.volume}
                    format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K kg` : `${Math.round(v)} kg`)}
                  />
                  <HeadToHeadRow
                    label="Times performed"
                    youVal={youExStats.timesPerformed}
                    rivalVal={rivalExStats.timesPerformed}
                    format={(v) => String(v)}
                    last
                  />
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function HeadToHeadRow({
  label,
  youVal,
  rivalVal,
  format,
  youDisplay,
  rivalDisplay,
  last,
}: {
  label: string;
  youVal: number;
  rivalVal: number;
  format: (v: number) => string;
  youDisplay?: string;
  rivalDisplay?: string;
  last?: boolean;
}) {
  const total = youVal + rivalVal;
  const youPct = total > 0 ? (youVal / total) * 100 : 50;
  return (
    <div style={{ marginBottom: last ? 0 : 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', letterSpacing: '.05em', marginBottom: 5 }}>
        <span>{label.toUpperCase()}</span>
        <span>{youDisplay ?? format(youVal)} · {rivalDisplay ?? format(rivalVal)}</span>
      </div>
      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
        <div style={{ width: `${youPct}%`, background: 'var(--accent)' }} />
        <div style={{ width: 1, background: '#000' }} />
        <div style={{ flex: 1, background: '#3a3d38' }} />
      </div>
    </div>
  );
}
