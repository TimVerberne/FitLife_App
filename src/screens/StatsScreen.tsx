import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import type { Person, SessionEntry, WorkoutSession } from '../lib/types';
import {
  MUSCLE_AXES,
  MUSCLE_GROUP,
  exerciseHistory,
  exercisePR,
  isWorkingSet,
  periodCutoff,
  recordsPerSession,
  setsCountOf,
  volumeOf,
  weeklyStreak,
  type StatPeriod,
} from '../lib/records';
import type { WeekStart } from '../lib/settings';
import { colorForPerson } from '../lib/colors';
import { labelsForFriends } from '../lib/friends';
import { exerciseById } from '../lib/exercises';
import { formatTrainingVolume, formatWeight, toDisplayWeight } from '../lib/units';
import { Thumb } from '../components/Thumb';
import { BadgeStrip } from '../components/BadgeIcon';
import { BADGE_BY_ID } from '../lib/badges';
import { useShowcaseByPerson } from '../lib/useShowcase';

// Only 3 of records.ts's 4 StatPeriod values are offered here — 'week',
// 'month', 'all' are this screen's own picker, kept as a subset of the
// shared type instead of a separate near-duplicate Period/PERIOD_DAYS.
const PERIODS: StatPeriod[] = ['week', 'month', 'all'];

type LeaderboardSort = 'volume' | 'workouts' | 'sets' | 'streak';
const SORT_LABEL: Record<LeaderboardSort, string> = { volume: 'Volume', workouts: 'Workouts', sets: 'Sets', streak: 'Streak' };

function statsFor(
  sessions: WorkoutSession[],
  person: Person,
  cutoff: number,
  now: number,
  weekStart: WeekStart,
  recordsBySession: Map<string, number>,
) {
  const mine = sessions.filter((h) => h.person === person && h.startedAt >= cutoff);
  return {
    person,
    workouts: mine.length,
    volume: mine.reduce((a, h) => a + volumeOf(h.entries), 0),
    sets: mine.reduce((a, h) => a + setsCountOf(h.entries), 0),
    totalMinutes: mine.reduce((a, h) => a + h.durationMin, 0),
    records: mine.reduce((a, h) => a + (recordsBySession.get(h.id) ?? 0), 0),
    streak: weeklyStreak(sessions, person, now, weekStart),
  };
}

function exerciseStatsFor(sessions: WorkoutSession[], person: Person, exerciseId: string, cutoff: number) {
  const inWindow = sessions.filter((h) => h.person === person && h.startedAt >= cutoff);
  let volume = 0;
  let timesPerformed = 0;
  inWindow.forEach((h) => {
    const entry = h.entries.find((e) => e.exerciseId === exerciseId);
    const doneSets = entry?.sets.filter(isWorkingSet) ?? [];
    if (doneSets.length === 0) return;
    timesPerformed += 1;
    doneSets.forEach((s) => {
      volume += s.weight * s.reps;
    });
  });
  // Best-weight/1RM tracking reuses the same PR logic exerciseHistory/
  // exercisePR already implement for ExerciseDetailSheet, instead of
  // re-deriving the same max-tracking comparisons a second time here.
  const pr = exercisePR(exerciseHistory(inWindow, exerciseId, person));
  return { volume, timesPerformed, maxWeight: pr.maxWeight, maxWeightReps: pr.maxWeightReps, best1RM: pr.oneRM };
}

export function StatsScreen() {
  const ownSessions = useStore((s) => s.sessions);
  const friendSessionsRaw = useStore((s) => s.friendSessions);
  const acceptedFriends = useStore((s) => s.friends);
  const openFriends = useStore((s) => s.openFriends);
  const openBadges = useStore((s) => s.openBadges);
  const markFirstComparison = useStore((s) => s.markFirstComparison);
  const showcaseByPerson = useShowcaseByPerson();
  const sessions = useMemo(() => [...ownSessions, ...friendSessionsRaw], [ownSessions, friendSessionsRaw]);
  const units = useStore((s) => s.settings.units);
  const weekStart = useStore((s) => s.settings.weekStart);
  const [period, setPeriod] = useState<StatPeriod>('week');
  const [selectedRival, setSelectedRival] = useState<Person | null>(null);
  const [sortBy, setSortBy] = useState<LeaderboardSort>('volume');
  // Frozen at mount rather than read fresh every render — this screen fully
  // unmounts/remounts on every tab switch (see App.tsx's CurrentScreen), so
  // that already keeps it fresh across visits without needing a live tick,
  // while avoiding the previous bug where reading Date.now() directly in the
  // render body made every useMemo below depend on a value that's never
  // equal between renders, defeating their memoization entirely.
  const [now] = useState(() => Date.now());
  const cutoff = useMemo(() => periodCutoff(period, now), [period, now]);

  // Computed once for every session across every person, rather than the
  // previous per-session newRecordsInWorkout() call (which itself re-derives
  // that person's full record history from scratch each time) — see
  // recordsPerSession's doc comment in records.ts.
  const recordsBySession = useMemo(() => recordsPerSession(sessions), [sessions]);

  const board = useMemo(() => {
    // Derived from the actual friend list, not from friendSessionsRaw — a
    // friend who hasn't logged any workouts yet would otherwise have no
    // entry in friendSessionsRaw at all and silently disappear from the
    // leaderboard/head-to-head instead of showing up with zeroes.
    const friendLabels = labelsForFriends(acceptedFriends);
    const people: Person[] = ['You', ...new Set(friendLabels.values())];
    return people
      .map((p) => statsFor(sessions, p, cutoff, now, weekStart, recordsBySession))
      .sort((a, b) => b[sortBy] - a[sortBy]);
  }, [sessions, acceptedFriends, cutoff, now, weekStart, recordsBySession, sortBy]);

  const you = board.find((b) => b.person === 'You')!;
  const friends = board.filter((b) => b.person !== 'You');
  const rival = friends.find((f) => f.person === selectedRival) ?? friends[0];

  // Seeing the head-to-head section (which requires a friend) is "running a
  // comparison" — credits the Rivalry one-off the first time it happens.
  useEffect(() => {
    if (rival) markFirstComparison();
  }, [rival, markFirstComparison]);

  const sharedExercises = useMemo(() => {
    if (!rival) return [];
    // Intersection, not union — comparing an exercise only one of you has
    // ever logged isn't a real head-to-head, it's just "0 vs your numbers".
    // Also respects the period filter, same as exerciseStatsFor below —
    // otherwise an exercise trained outside the selected window would still
    // show up in this list, just always reading "0"/"—" once selected.
    const mineIds = new Set<string>();
    const rivalIds = new Set<string>();
    // Only count an exercise as "trained" if it has at least one logged
    // working set — an exercise merely added to a session (or warmup-only)
    // otherwise shows up in the head-to-head list with every tile reading
    // "—"/0, which isn't a real comparison.
    const trained = (e: SessionEntry) => e.sets.some(isWorkingSet);
    sessions
      .filter((h) => h.startedAt >= cutoff)
      .forEach((h) => {
        if (h.person === 'You') h.entries.forEach((e) => trained(e) && mineIds.add(e.exerciseId));
        else if (h.person === rival.person) h.entries.forEach((e) => trained(e) && rivalIds.add(e.exerciseId));
      });
    return Array.from(mineIds)
      .filter((id) => rivalIds.has(id))
      .map(exerciseById)
      .filter((e): e is NonNullable<typeof e> => e !== undefined)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [sessions, rival, cutoff]);

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

  // Keyed by exercise id so the selected exercise's you/rival stats (used
  // below) are looked up from this same pass instead of being recomputed a
  // third time from scratch.
  const exerciseStatsById = useMemo(() => {
    const map = new Map<string, { you: ReturnType<typeof exerciseStatsFor>; rival: ReturnType<typeof exerciseStatsFor> }>();
    if (!muscle || !rival) return map;
    // Filter each person's in-window sessions ONCE up front rather than
    // re-scanning the full combined session list inside exerciseStatsFor for
    // every shared exercise (which also runs exerciseHistory — a second
    // scan+sort each). Passing the pre-narrowed lists keeps the same result
    // with far less repeated work as history and shared-lift counts grow.
    const youWindow = sessions.filter((h) => h.person === 'You' && h.startedAt >= cutoff);
    const rivalWindow = sessions.filter((h) => h.person === rival.person && h.startedAt >= cutoff);
    sharedExercises
      .filter((ex) => MUSCLE_GROUP[ex.body_part] === muscle)
      .forEach((ex) => {
        map.set(ex.id, {
          you: exerciseStatsFor(youWindow, 'You', ex.id, cutoff),
          rival: exerciseStatsFor(rivalWindow, rival.person, ex.id, cutoff),
        });
      });
    return map;
  }, [sharedExercises, muscle, rival, sessions, cutoff]);

  const rankedExercises = useMemo(() => {
    if (!muscle || !rival) return [];
    return sharedExercises
      .filter((ex) => MUSCLE_GROUP[ex.body_part] === muscle)
      .map((ex) => {
        const stats = exerciseStatsById.get(ex.id);
        const combined = stats ? stats.you.volume + stats.rival.volume : 0;
        return { ex, combined };
      })
      .sort((a, b) => b.combined - a.combined)
      .map((x) => x.ex);
  }, [sharedExercises, muscle, rival, exerciseStatsById]);

  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const exerciseId = rankedExercises.some((e) => e.id === selectedExerciseId) ? selectedExerciseId! : rankedExercises[0]?.id;
  const exercise = exerciseId ? exerciseById(exerciseId) : undefined;
  const visibleExercises = showAllExercises ? rankedExercises : rankedExercises.slice(0, 5);
  const hiddenCount = rankedExercises.length - visibleExercises.length;

  const selectedStats = exerciseId ? exerciseStatsById.get(exerciseId) : undefined;
  const youExStats = selectedStats?.you ?? null;
  const rivalExStats = selectedStats?.rival ?? null;

  // Same abbreviation everywhere a "volume" head-to-head tile needs a unit
  // appended, instead of each tile inlining its own (previously
  // inconsistent — one used uppercase "K", the leaderboard used lowercase).
  function formatVolumeTile(v: number): string {
    const { main, suffix } = formatTrainingVolume(v);
    return `${main}${suffix} ${units}`;
  }

  return (
    <div className="screen">
      <div className="top top-row">
        <div className="h1" style={{ fontSize: 30 }}>Stats</div>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 9, padding: 3 }}>
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: period === p ? 800 : 700,
                fontSize: 11,
                background: period === p ? 'var(--accent)' : 'transparent',
                color: period === p ? 'var(--accent-ink)' : 'var(--faint)',
                padding: '5px 9px',
                border: 'none',
                borderRadius: 6,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <div className="section-h" style={{ margin: 0 }}>Leaderboard · {SORT_LABEL[sortBy].toLowerCase()}</div>
        <div className="chips">
          {(Object.keys(SORT_LABEL) as LeaderboardSort[]).map((s) => (
            <button key={s} className={`chip${sortBy === s ? ' on' : ''}`} aria-pressed={sortBy === s} onClick={() => setSortBy(s)}>
              {SORT_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      {board.map((row, i) => {
        const colors = colorForPerson(row.person);
        const isTop = i === 0;
        const metricParts =
          sortBy === 'volume' ? formatTrainingVolume(toDisplayWeight(row.volume, units)) : { main: String(row[sortBy]), suffix: '' as const };
        return (
          <div
            key={row.person}
            role="button"
            tabIndex={0}
            onClick={() => openBadges(row.person)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') openBadges(row.person);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              background: isTop ? 'var(--accent-soft)' : 'var(--surface)',
              border: `1px solid ${isTop ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: 13,
              padding: '11px 12px',
              marginBottom: 8,
              cursor: 'pointer',
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: isTop ? 'var(--accent)' : 'var(--faint-2)', width: 16 }}>
              {i + 1}
            </div>
            <div className="av" style={{ width: 34, height: 34, fontSize: 15, background: colors.bg, color: colors.ink }}>
              {row.person.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crew-name" style={{ fontSize: 16, display: 'flex', alignItems: 'center', gap: 5 }}>
                {row.person}
                <BadgeStrip ids={showcaseByPerson.get(row.person) ?? []} byId={BADGE_BY_ID} size={16} />
              </div>
              <div className="crew-meta">{row.workouts} WORKOUTS</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 19, color: isTop ? 'var(--accent)' : 'var(--ink)', lineHeight: 1 }}>
              {metricParts.main}
              {metricParts.suffix && <span style={{ fontSize: 10, color: 'var(--faint)' }}>{metricParts.suffix}</span>}
            </div>
          </div>
        );
      })}

      {acceptedFriends.length === 0 ? (
        <div className="empty-state" style={{ marginTop: 18 }}>
          <div className="h1">No friends yet</div>
          <p>Add a friend to unlock head-to-head stats and see how you stack up.</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={openFriends}>
            Add a friend
          </button>
        </div>
      ) : rival && (
        <>
          <div className="section-h">Head to head</div>
          {friends.length > 1 && (
            <div className="chips" style={{ marginBottom: 6 }}>
              {friends.map((f) => (
                <button
                  key={f.person}
                  className={`chip${rival.person === f.person ? ' on' : ''}`}
                  aria-pressed={rival.person === f.person}
                  onClick={() => setSelectedRival(f.person)}
                >
                  vs {f.person}
                </button>
              ))}
            </div>
          )}
          <HeadToHeadLegend rivalName={rival.person} rivalColor={colorForPerson(rival.person).bg} />
          <div className="h2h-grid">
            <HeadToHeadTile label="Workouts" youVal={you.workouts} rivalVal={rival.workouts} format={(v) => String(v)} rivalColor={colorForPerson(rival.person).bg} rivalName={rival.person} />
            <HeadToHeadTile
              label="Volume"
              youVal={toDisplayWeight(you.volume, units)}
              rivalVal={toDisplayWeight(rival.volume, units)}
              format={formatVolumeTile}
              rivalColor={colorForPerson(rival.person).bg}
              rivalName={rival.person}
            />
            <HeadToHeadTile label="Sets" youVal={you.sets} rivalVal={rival.sets} format={(v) => String(v)} rivalColor={colorForPerson(rival.person).bg} rivalName={rival.person} />
            <HeadToHeadTile label="Time trained" youVal={you.totalMinutes} rivalVal={rival.totalMinutes} format={(v) => `${v}min`} rivalColor={colorForPerson(rival.person).bg} rivalName={rival.person} />
            <HeadToHeadTile label="Records set" youVal={you.records} rivalVal={rival.records} format={(v) => String(v)} rivalColor={colorForPerson(rival.person).bg} rivalName={rival.person} />
            <HeadToHeadTile label="Streak" youVal={you.streak} rivalVal={rival.streak} format={(v) => String(v)} rivalColor={colorForPerson(rival.person).bg} rivalName={rival.person} />
          </div>

          <div className="section-h">Exercise head to head</div>
          {sharedExercises.length === 0 ? (
            <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 4 }}>
              No shared exercises yet — log the same exercise as each other to see a head-to-head.
            </p>
          ) : (
            <>
              <div className="chips" style={{ marginBottom: 10 }}>
                {muscleGroups.map((g) => (
                  <button
                    key={g}
                    className={`chip${muscle === g ? ' on' : ''}`}
                    aria-pressed={muscle === g}
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
                    aria-pressed={active}
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
                      rivalColor={colorForPerson(rival.person).bg}
                      rivalName={rival.person}
                    />
                    <HeadToHeadTile
                      label="Est. 1RM"
                      youVal={toDisplayWeight(youExStats.best1RM, units)}
                      rivalVal={toDisplayWeight(rivalExStats.best1RM, units)}
                      format={(v) => (v > 0 ? `${Math.round(v)}${units}` : '—')}
                      rivalColor={colorForPerson(rival.person).bg}
                      rivalName={rival.person}
                    />
                    <HeadToHeadTile
                      label="Total volume"
                      youVal={toDisplayWeight(youExStats.volume, units)}
                      rivalVal={toDisplayWeight(rivalExStats.volume, units)}
                      format={formatVolumeTile}
                      rivalColor={colorForPerson(rival.person).bg}
                      rivalName={rival.person}
                    />
                    <HeadToHeadTile
                      label="Times performed"
                      youVal={youExStats.timesPerformed}
                      rivalVal={rivalExStats.timesPerformed}
                      format={(v) => String(v)}
                      rivalColor={colorForPerson(rival.person).bg}
                      rivalName={rival.person}
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
  rivalName,
}: {
  label: string;
  youVal: number;
  rivalVal: number;
  format: (v: number) => string;
  youDisplay?: string;
  rivalDisplay?: string;
  rivalColor: string;
  rivalName: string;
}) {
  const max = Math.max(youVal, rivalVal, 1);
  const youPct = (youVal / max) * 100;
  const rivalPct = (rivalVal / max) * 100;
  const youWins = youVal > rivalVal;
  const rivalWins = rivalVal > youVal;
  const youText = youDisplay ?? format(youVal);
  const rivalText = rivalDisplay ?? format(rivalVal);
  return (
    <div className="h2h-tile">
      <div className="h2h-tile-label">{label}</div>
      {/* aria-labels name the owner (bars are distinguished only by colour
          and stack order visually, via the legend above) and call the
          winner, which the `.win` class conveys with colour alone. */}
      <div className="h2h-bar">
        <div className="h2h-track">
          <div className="h2h-fill" style={{ width: `${youPct}%`, background: 'var(--accent)' }} />
        </div>
        <span className={`h2h-bar-val${youWins ? ' win' : ''}`} aria-label={`You: ${youText}${youWins ? ' (winning)' : ''}`}>
          {youText}
        </span>
      </div>
      <div className="h2h-bar">
        <div className="h2h-track">
          <div className="h2h-fill" style={{ width: `${rivalPct}%`, background: rivalColor }} />
        </div>
        <span className={`h2h-bar-val${rivalWins ? ' win' : ''}`} aria-label={`${rivalName}: ${rivalText}${rivalWins ? ' (winning)' : ''}`}>
          {rivalText}
        </span>
      </div>
    </div>
  );
}
