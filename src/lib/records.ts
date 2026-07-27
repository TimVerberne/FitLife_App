import type { Routine, SessionEntry, SetEntry, WorkoutSession } from './types';
import type { WeekStart } from './settings';
import { exerciseById } from './exercises';

// Shared by TrainScreen (to render) and the store's reorderRoutines action
// (to build the index array a drag commits) — both need the exact same
// ordering or a drag would silently reorder the wrong pair of routines.
// Falls back to createdAt for any routine never manually reordered yet.
export function sortRoutines(routines: Routine[]): Routine[] {
  return [...routines].sort((a, b) => (a.sortOrder ?? a.createdAt) - (b.sortOrder ?? b.createdAt));
}

const DAY = 86_400_000;

export function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

// Warm-up sets don't count toward volume, reps, or records — only working sets
// do. A "done" set with 0 reps isn't a real lift either (e.g. a set marked
// done before typing in a rep count) — without this, epley(weight, 0) still
// returns the raw weight unchanged (same as a genuine 1-rep single), so a
// stray 0-rep set could register as a brand-new personal record.
export function isWorkingSet(s: SetEntry): boolean {
  return s.done && s.kind !== 'warmup' && s.reps > 0;
}

// Broader than isWorkingSet — also counts a completed cardio set (time
// and/or distance logged, no reps/weight involved). Used anywhere "how many
// sets did you do" is a plain completion count rather than a weight-training
// specific figure like volume or a rep-max PR, which stay isWorkingSet-gated
// so cardio (always 0 reps/weight) can never contribute to them.
export function isLoggedSet(s: SetEntry): boolean {
  if (!s.done || s.kind === 'warmup') return false;
  return s.reps > 0 || (s.durationSec ?? 0) > 0 || (s.distanceKm ?? 0) > 0;
}

export function volumeOf(entries: SessionEntry[]): number {
  return entries.reduce(
    (a, e) => a + e.sets.filter(isWorkingSet).reduce((b, s) => b + s.reps * s.weight, 0),
    0,
  );
}

export function setsCountOf(entries: SessionEntry[]): number {
  return entries.reduce((a, e) => a + e.sets.filter(isLoggedSet).length, 0);
}

// The "planned" side of a done/total ratio — must exclude warmups the same
// way isLoggedSet does, or the ratio (setsCountOf as the numerator) can
// never reach total/total since warmups can contribute to one side but not
// the other.
export function plannedSetsCountOf(entries: SessionEntry[]): number {
  return entries.reduce((a, e) => a + e.sets.filter((s) => s.kind !== 'warmup').length, 0);
}

export function repsOf(entries: SessionEntry[]): number {
  return entries.reduce((a, e) => a + e.sets.filter(isWorkingSet).reduce((b, s) => b + s.reps, 0), 0);
}

function startOfDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Counts calendar-day boundaries crossed, not raw elapsed hours — a workout
// logged at 1am and viewed 46 hours later (only one midnight crossed) reads
// "Yesterday", not "2 days ago"; one logged at 11pm and viewed 2 hours later
// (already past midnight) reads "Yesterday", not "Today".
export function relativeDate(ts: number, now = Date.now()): string {
  const d = Math.round((startOfDay(now) - startOfDay(ts)) / DAY);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
}

// "70 min" reads worse than "1 hour and 10 mins" once a workout (or a
// summed total) crosses an hour — used anywhere a duration in minutes is
// shown to the user.
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(m / 60);
  const mins = m % 60;
  if (hours === 0) return `${mins} min${mins === 1 ? '' : 's'}`;
  const hourPart = `${hours} hour${hours === 1 ? '' : 's'}`;
  return mins === 0 ? hourPart : `${hourPart} and ${mins} min${mins === 1 ? '' : 's'}`;
}

export interface PersonalRecord {
  exerciseId: string;
  maxWeight: number;
  maxWeightReps: number;
  estOneRepMax: number;
}

export function personalRecords(sessions: WorkoutSession[], person = 'You'): PersonalRecord[] {
  const map = new Map<string, PersonalRecord>();
  sessions
    .filter((h) => h.person === person)
    .forEach((h) =>
      h.entries.forEach((e) => {
        e.sets
          .filter(isWorkingSet)
          .forEach((s) => {
            const cur = map.get(e.exerciseId) ?? { exerciseId: e.exerciseId, maxWeight: 0, maxWeightReps: 0, estOneRepMax: 0 };
            if (s.weight > cur.maxWeight || (s.weight === cur.maxWeight && s.reps > cur.maxWeightReps)) {
              cur.maxWeight = s.weight;
              cur.maxWeightReps = s.reps;
            }
            cur.estOneRepMax = Math.max(cur.estOneRepMax, epley(s.weight, s.reps));
            map.set(e.exerciseId, cur);
          });
      }),
    );
  return Array.from(map.values()).sort((a, b) => b.estOneRepMax - a.estOneRepMax);
}

export interface ExercisePoint {
  ts: number;
  maxWeight: number;
  maxWeightReps: number;
  oneRM: number;
  bestSetWeight: number;
  bestSetReps: number;
  bestSetVolume: number;
}

// One point per session that actually logged a working set for this
// exercise — sessions where it was added but never logged (or only
// warmups) are skipped so the chart doesn't show a false dip to zero.
export function exerciseHistory(sessions: WorkoutSession[], exerciseId: string, person = 'You'): ExercisePoint[] {
  return sessions
    .filter((h) => h.person === person)
    .map((h): ExercisePoint | null => {
      const entry = h.entries.find((e) => e.exerciseId === exerciseId);
      if (!entry) return null;
      const working = entry.sets.filter(isWorkingSet);
      if (working.length === 0) return null;
      const point: ExercisePoint = {
        ts: h.startedAt,
        maxWeight: 0,
        maxWeightReps: 0,
        oneRM: 0,
        bestSetWeight: 0,
        bestSetReps: 0,
        bestSetVolume: 0,
      };
      working.forEach((s) => {
        if (s.weight > point.maxWeight || (s.weight === point.maxWeight && s.reps > point.maxWeightReps)) {
          point.maxWeight = s.weight;
          point.maxWeightReps = s.reps;
        }
        point.oneRM = Math.max(point.oneRM, epley(s.weight, s.reps));
        const setVolume = s.weight * s.reps;
        if (setVolume > point.bestSetVolume) {
          point.bestSetVolume = setVolume;
          point.bestSetWeight = s.weight;
          point.bestSetReps = s.reps;
        }
      });
      return point;
    })
    .filter((p): p is ExercisePoint => p !== null)
    .sort((a, b) => a.ts - b.ts);
}

export interface ExercisePR {
  maxWeight: number;
  maxWeightReps: number;
  oneRM: number;
  bestSetWeight: number;
  bestSetReps: number;
  bestSetVolume: number;
}

export function exercisePR(history: ExercisePoint[]): ExercisePR {
  return history.reduce<ExercisePR>(
    (acc, p) => {
      if (p.maxWeight > acc.maxWeight || (p.maxWeight === acc.maxWeight && p.maxWeightReps > acc.maxWeightReps)) {
        acc.maxWeight = p.maxWeight;
        acc.maxWeightReps = p.maxWeightReps;
      }
      acc.oneRM = Math.max(acc.oneRM, p.oneRM);
      if (p.bestSetVolume > acc.bestSetVolume) {
        acc.bestSetVolume = p.bestSetVolume;
        acc.bestSetWeight = p.bestSetWeight;
        acc.bestSetReps = p.bestSetReps;
      }
      return acc;
    },
    { maxWeight: 0, maxWeightReps: 0, oneRM: 0, bestSetWeight: 0, bestSetReps: 0, bestSetVolume: 0 },
  );
}

// Which exercises in `target` set a new estimated-1RM PR compared to
// everything logged before it, and *which set* did it — the single set with
// the highest est-1RM in that entry, i.e. the one the record is actually for.
// Keyed by exerciseId → index into that entry's `sets`.
//
// This is the one source of truth for "what counted as a record in this
// workout": newRecordExerciseIdsInWorkout (and so the Finish screen's names
// and the feed's 🏆 count) is derived from it, so a set marked as the record
// in the workout detail can never disagree with the count shown next to it.
// Keyed by *entry index*, not exerciseId: an exercise can legitimately appear
// in two entries of one session, and an exerciseId key would both collide
// (silently dropping one) and make the caller mark the same set row in both
// entries. The index is unambiguous. A record is still counted once per
// exercise — if a duplicated exercise beats its prior best in two entries,
// the better entry wins, matching recordsPerSession.
export function recordSetIndexesInWorkout(sessions: WorkoutSession[], target: WorkoutSession): Map<number, number> {
  const priorSessions = sessions.filter((h) => h.person === target.person && h.startedAt < target.startedAt);
  const priorBest = new Map(personalRecords(priorSessions, target.person).map((r) => [r.exerciseId, r.estOneRepMax]));

  interface Candidate {
    entryIdx: number;
    exerciseId: string;
    setIdx: number;
    oneRm: number;
  }
  const candidates: Candidate[] = [];
  target.entries.forEach((entry, entryIdx) => {
    let best = 0;
    let bestIdx = -1;
    entry.sets.forEach((s, si) => {
      if (!isWorkingSet(s) || s.weight <= 0) return;
      const oneRm = epley(s.weight, s.reps);
      if (oneRm > best) {
        best = oneRm;
        bestIdx = si;
      }
    });
    if (best > 0 && bestIdx >= 0) candidates.push({ entryIdx, exerciseId: entry.exerciseId, setIdx: bestIdx, oneRm: best });
  });

  // One candidate per exercise — the strongest entry represents it.
  const bestPerExercise = new Map<string, Candidate>();
  for (const c of candidates) {
    const held = bestPerExercise.get(c.exerciseId);
    if (!held || c.oneRm > held.oneRm) bestPerExercise.set(c.exerciseId, c);
  }

  const result = new Map<number, number>();
  bestPerExercise.forEach((c) => {
    if (c.oneRm > (priorBest.get(c.exerciseId) ?? 0)) result.set(c.entryIdx, c.setIdx);
  });
  return result;
}

export function newRecordExerciseIdsInWorkout(sessions: WorkoutSession[], target: WorkoutSession): string[] {
  return [...recordSetIndexesInWorkout(sessions, target).keys()].map((entryIdx) => target.entries[entryIdx].exerciseId);
}

export function newRecordsInWorkout(sessions: WorkoutSession[], target: WorkoutSession): number {
  return newRecordExerciseIdsInWorkout(sessions, target).length;
}

// Everything the in-session "new personal record" celebration needs about
// the set that just beat the record.
export interface LiveRecord {
  exerciseId: string;
  weight: number;
  reps: number;
  oneRm: number;
  // The set that previously held the record (null on a first-ever PR).
  prevWeight: number | null;
  prevReps: number | null;
  prevOneRm: number;
}

// Does the just-completed set at [entryIdx][setIdx] of the in-progress
// workout beat this person's all-time best est-1RM for that exercise?
// `history` is every finished session; `liveEntries` is the active workout,
// whose own earlier completed sets also count as prior — so a ramp-up only
// celebrates a set that genuinely raises the bar again, not every set above
// the old record.
export function liveRecordForSet(
  history: WorkoutSession[],
  liveEntries: SessionEntry[],
  entryIdx: number,
  setIdx: number,
  person = 'You',
): LiveRecord | null {
  const entry = liveEntries[entryIdx];
  const set = entry?.sets[setIdx];
  if (!entry || !set || !isWorkingSet(set) || set.weight <= 0) return null;
  const oneRm = epley(set.weight, set.reps);

  // Best from finished history.
  let prevOneRm = 0;
  let prevWeight: number | null = null;
  let prevReps: number | null = null;
  const consider = (w: number, r: number) => {
    const e = epley(w, r);
    if (e > prevOneRm) {
      prevOneRm = e;
      prevWeight = w;
      prevReps = r;
    }
  };
  history
    .filter((h) => h.person === person)
    .forEach((h) =>
      h.entries
        .filter((e) => e.exerciseId === entry.exerciseId)
        .forEach((e) => e.sets.filter((s) => isWorkingSet(s) && s.weight > 0).forEach((s) => consider(s.weight, s.reps))),
    );
  // Plus earlier completed sets of this same exercise in the live workout.
  liveEntries
    .filter((e) => e.exerciseId === entry.exerciseId)
    .forEach((e) =>
      e.sets.forEach((s, si) => {
        if (e === entry && si === setIdx) return; // the set being judged
        if (isWorkingSet(s) && s.weight > 0) consider(s.weight, s.reps);
      }),
    );

  if (oneRm <= prevOneRm) return null;
  return { exerciseId: entry.exerciseId, weight: set.weight, reps: set.reps, oneRm, prevWeight, prevReps, prevOneRm };
}

// The most recent earlier session that's a fair "last time" comparison for
// the Finish screen — same routine if `target` came from one, otherwise the
// most recent same-named freeform session. Falls back to null (nothing to
// compare against) rather than picking an unrelated workout.
export function previousComparableSession(sessions: WorkoutSession[], target: WorkoutSession): WorkoutSession | null {
  const candidates = sessions.filter((h) => h.person === target.person && h.startedAt < target.startedAt && h.id !== target.id);
  const matches = target.routineId
    ? candidates.filter((h) => h.routineId === target.routineId)
    : candidates.filter((h) => h.name.trim().toLowerCase() === target.name.trim().toLowerCase());
  if (matches.length === 0) return null;
  return matches.reduce((latest, h) => (h.startedAt > latest.startedAt ? h : latest));
}

// Same "new record" definition as newRecordsInWorkout, but for every session
// across every person present in `sessions` in one pass — calling
// newRecordsInWorkout per session instead re-derives that person's full
// personalRecords() from scratch for every session before it, which is
// quadratic over a person's history. Grouping by person and walking each
// person's sessions oldest-first, carrying the running best forward, gets
// the same per-session counts in a single linear pass per person.
export function recordsPerSession(sessions: WorkoutSession[]): Map<string, number> {
  const byPerson = new Map<string, WorkoutSession[]>();
  sessions.forEach((h) => {
    const list = byPerson.get(h.person);
    if (list) list.push(h);
    else byPerson.set(h.person, [h]);
  });
  const result = new Map<string, number>();
  byPerson.forEach((theirs) => {
    const best = new Map<string, number>();
    [...theirs]
      .sort((a, b) => a.startedAt - b.startedAt)
      .forEach((h) => {
        // Collapsed per exercise before comparing: the same exercise can
        // appear in two entries of one session, and counting each entry
        // separately would report two records for what is one exercise —
        // disagreeing with the per-set marks in the workout detail.
        const bestByExercise = new Map<string, number>();
        h.entries.forEach((entry) => {
          const bestInSession = entry.sets
            .filter((s) => isWorkingSet(s) && s.weight > 0)
            .reduce((max, s) => Math.max(max, epley(s.weight, s.reps)), 0);
          if (bestInSession === 0) return;
          if (bestInSession > (bestByExercise.get(entry.exerciseId) ?? 0)) bestByExercise.set(entry.exerciseId, bestInSession);
        });
        let count = 0;
        bestByExercise.forEach((bestInSession, exerciseId) => {
          const prior = best.get(exerciseId) ?? 0;
          if (bestInSession > prior) {
            count++;
            best.set(exerciseId, bestInSession);
          }
        });
        result.set(h.id, count);
      });
  });
  return result;
}

export interface WeekBucket {
  label: string;
  value: number;
}

export type WeeklyMetric = 'volume' | 'duration' | 'reps';

export function weeklyMetric(
  sessions: WorkoutSession[],
  nWeeks: number,
  metric: WeeklyMetric,
  person = 'You',
  now = Date.now(),
): WeekBucket[] {
  const mine = sessions.filter((h) => h.person === person);
  const weeks: WeekBucket[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const inWeek = mine.filter((h) => h.startedAt > start && h.startedAt <= end);
    let value = 0;
    if (metric === 'volume') value = inWeek.reduce((a, h) => a + volumeOf(h.entries), 0);
    else if (metric === 'duration') value = inWeek.reduce((a, h) => a + h.durationMin, 0);
    else value = inWeek.reduce((a, h) => a + repsOf(h.entries), 0);
    weeks.push({ value, label: new Date(end).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) });
  }
  return weeks;
}

// Bucket granularity follows the selected period, same convention as most
// fitness apps: a week of daily bars, a month/3-months of weekly bars, all
// time of monthly bars (capped at 24 so a multi-year history doesn't render
// an unreadably wide chart). Without this, the bar chart always showed a
// fixed 12-week window no matter which period was selected.
export function barBucketsForPeriod(
  sessions: WorkoutSession[],
  period: StatPeriod,
  metric: WeeklyMetric,
  person = 'You',
  now = Date.now(),
): WeekBucket[] {
  if (period === 'week') {
    const mine = sessions.filter((h) => h.person === person);
    const metricOf = (list: WorkoutSession[]) => {
      if (metric === 'volume') return list.reduce((a, h) => a + volumeOf(h.entries), 0);
      if (metric === 'duration') return list.reduce((a, h) => a + h.durationMin, 0);
      return list.reduce((a, h) => a + repsOf(h.entries), 0);
    };
    const buckets: WeekBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const end = now - i * DAY;
      const start = end - DAY;
      const inBucket = mine.filter((h) => h.startedAt > start && h.startedAt <= end);
      buckets.push({ value: metricOf(inBucket), label: new Date(end).toLocaleDateString('en-US', { weekday: 'short' }) });
    }
    return buckets;
  }

  if (period === 'month') return weeklyMetric(sessions, 5, metric, person, now);
  if (period === '3months') return weeklyMetric(sessions, 13, metric, person, now);

  // 'all' — one bucket per calendar month, from the oldest session through now.
  const mine = sessions.filter((h) => h.person === person);
  const metricOf = (list: WorkoutSession[]) => {
    if (metric === 'volume') return list.reduce((a, h) => a + volumeOf(h.entries), 0);
    if (metric === 'duration') return list.reduce((a, h) => a + h.durationMin, 0);
    return list.reduce((a, h) => a + repsOf(h.entries), 0);
  };
  const nowDate = new Date(now);
  const oldest = mine.length > 0 ? Math.min(...mine.map((h) => h.startedAt)) : now;
  const oldestDate = new Date(oldest);
  const monthSpan = (nowDate.getFullYear() - oldestDate.getFullYear()) * 12 + (nowDate.getMonth() - oldestDate.getMonth()) + 1;
  const months = Math.min(Math.max(monthSpan, 1), 24);
  const buckets: WeekBucket[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const bucketStart = new Date(nowDate.getFullYear(), nowDate.getMonth() - i, 1).getTime();
    const bucketEnd = new Date(nowDate.getFullYear(), nowDate.getMonth() - i + 1, 1).getTime();
    const inBucket = mine.filter((h) => h.startedAt >= bucketStart && h.startedAt < bucketEnd);
    buckets.push({ value: metricOf(inBucket), label: new Date(bucketStart).toLocaleDateString('en-US', { month: 'short' }) });
  }
  return buckets;
}

export type StatPeriod = 'week' | 'month' | '3months' | 'all';

export const STAT_PERIOD_DAYS: Record<StatPeriod, number | null> = {
  week: 7,
  month: 30,
  '3months': 90,
  all: null,
};

export const STAT_PERIOD_LABEL: Record<StatPeriod, string> = {
  week: 'This week',
  month: 'This month',
  '3months': 'Past 3 months',
  all: 'All time',
};

// Aligned to the start of the local day so the window is a whole number of
// calendar days (today + N-1 prior), not a rolling exact-N×24h span. Without
// this the same "This week" chip would drop or keep a session ~7 days ago
// purely based on the current time of day.
export function periodCutoff(period: StatPeriod, now = Date.now()): number {
  const days = STAT_PERIOD_DAYS[period];
  return days === null ? -Infinity : startOfDay(now) - (days - 1) * DAY;
}

export function periodTotal(
  sessions: WorkoutSession[],
  period: StatPeriod,
  metric: WeeklyMetric,
  person = 'You',
  now = Date.now(),
): { current: number; previous: number | null } {
  const mine = sessions.filter((h) => h.person === person);
  const metricOf = (list: WorkoutSession[]) => {
    if (metric === 'volume') return list.reduce((a, h) => a + volumeOf(h.entries), 0);
    if (metric === 'duration') return list.reduce((a, h) => a + h.durationMin, 0);
    return list.reduce((a, h) => a + repsOf(h.entries), 0);
  };
  const days = STAT_PERIOD_DAYS[period];
  if (days === null) {
    return { current: metricOf(mine), previous: null };
  }
  const cutoff = startOfDay(now) - (days - 1) * DAY;
  const prevCutoff = cutoff - days * DAY;
  return {
    current: metricOf(mine.filter((h) => h.startedAt >= cutoff)),
    previous: metricOf(mine.filter((h) => h.startedAt >= prevCutoff && h.startedAt < cutoff)),
  };
}

export function sessionsByDay(sessions: WorkoutSession[], person = 'You'): Map<number, WorkoutSession[]> {
  const map = new Map<number, WorkoutSession[]>();
  sessions
    .filter((h) => h.person === person)
    .forEach((h) => {
      const d = new Date(h.startedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      const list = map.get(key) ?? [];
      list.push(h);
      map.set(key, list);
    });
  return map;
}

export function daysSinceLastWorkout(sessions: WorkoutSession[], person = 'You', now = Date.now()): number {
  const mine = sessions.filter((h) => h.person === person);
  if (mine.length === 0) return 0;
  const lastStartedAt = Math.max(...mine.map((h) => h.startedAt));
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const lastDay = new Date(lastStartedAt);
  lastDay.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today.getTime() - lastDay.getTime()) / DAY));
}

function startOfWeek(ts: number, weekStart: WeekStart): number {
  const d = new Date(startOfDay(ts));
  const day = d.getDay(); // 0=Sun..6=Sat
  const diff = weekStart === 'mon' ? (day + 6) % 7 : day;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

// Aligned to the same calendar-week boundary the training calendar grid
// uses (per the weekStart setting) — a rolling "any 7-day window" streak
// would silently disagree with the week grid rendered right next to it.
export function weeklyStreak(sessions: WorkoutSession[], person = 'You', now = Date.now(), weekStart: WeekStart = 'sun'): number {
  const mine = sessions.filter((h) => h.person === person);
  if (mine.length === 0) return 0;
  const currentWeekStart = startOfWeek(now, weekStart);
  // Each week window is derived with calendar-day arithmetic (setDate),
  // not a fixed i*7*DAY subtraction, so a DST transition inside the range
  // can't shift a boundary by ±1h and mis-bucket a late-night session.
  const hasSessionInWeek = (weekStartTs: number) => {
    const end = new Date(weekStartTs);
    end.setDate(end.getDate() + 7);
    return mine.some((h) => h.startedAt >= weekStartTs && h.startedAt < end.getTime());
  };
  // The current, in-progress week having no session *yet* must not reset the
  // streak — you still have the rest of the week to train. So if this week is
  // empty, start counting from last week; otherwise a long-standing streak
  // would read 0 every Monday until the first workout of the week.
  let i = hasSessionInWeek(currentWeekStart) ? 0 : 1;
  let streak = 0;
  for (; ; i++) {
    const wd = new Date(currentWeekStart);
    wd.setDate(wd.getDate() - i * 7);
    if (!hasSessionInWeek(wd.getTime())) break;
    streak += 1;
  }
  return streak;
}

// Oldest-to-newest "did you train this week" flags for the last `weeks`
// calendar weeks, ending at the current (in-progress) week — the data
// behind a streak-dots widget. Same week-boundary math as weeklyStreak so
// the two never disagree about where a week starts.
export function recentWeeksTrained(
  sessions: WorkoutSession[],
  person = 'You',
  now = Date.now(),
  weekStart: WeekStart = 'sun',
  weeks = 6,
): boolean[] {
  const mine = sessions.filter((h) => h.person === person);
  const currentWeekStart = startOfWeek(now, weekStart);
  const hasSessionInWeek = (weekStartTs: number) => {
    const end = new Date(weekStartTs);
    end.setDate(end.getDate() + 7);
    return mine.some((h) => h.startedAt >= weekStartTs && h.startedAt < end.getTime());
  };
  const flags: boolean[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const wd = new Date(currentWeekStart);
    wd.setDate(wd.getDate() - i * 7);
    flags.push(hasSessionInWeek(wd.getTime()));
  }
  return flags;
}

export const MUSCLE_AXES = ['Chest', 'Back', 'Legs', 'Shoulders', 'Arms', 'Core'];

export const MUSCLE_GROUP: Record<string, string> = {
  chest: 'Chest',
  back: 'Back',
  'upper legs': 'Legs',
  'lower legs': 'Legs',
  shoulders: 'Shoulders',
  'upper arms': 'Arms',
  'lower arms': 'Arms',
  waist: 'Core',
  neck: 'Core',
};

export function primaryMuscleGroup(exerciseIds: string[]): string | null {
  const counts = new Map<string, number>();
  exerciseIds.forEach((id) => {
    const ex = exerciseById(id);
    if (!ex) return;
    const axis = MUSCLE_GROUP[ex.body_part];
    if (!axis) return;
    counts.set(axis, (counts.get(axis) ?? 0) + 1);
  });
  let best: string | null = null;
  let bestCount = 0;
  counts.forEach((count, axis) => {
    if (count > bestCount) {
      best = axis;
      bestCount = count;
    }
  });
  return best;
}

export function muscleSplit(sessions: WorkoutSession[], person = 'You', since = -Infinity): number[] {
  const counts = new Map(MUSCLE_AXES.map((a) => [a, 0]));
  sessions
    .filter((h) => h.person === person && h.startedAt >= since)
    .forEach((h) =>
      h.entries.forEach((e) => {
        const ex = exerciseById(e.exerciseId);
        if (!ex) return;
        const axis = MUSCLE_GROUP[ex.body_part];
        if (axis && counts.has(axis)) {
          counts.set(axis, (counts.get(axis) ?? 0) + e.sets.filter(isWorkingSet).length);
        }
      }),
    );
  return MUSCLE_AXES.map((a) => counts.get(a) ?? 0);
}
