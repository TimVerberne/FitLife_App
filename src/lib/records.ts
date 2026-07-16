import type { SessionEntry, SetEntry, WorkoutSession } from './types';
import type { WeekStart } from './settings';
import { exerciseById } from './exercises';

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

export function newRecordsInWorkout(sessions: WorkoutSession[], target: WorkoutSession): number {
  const priorSessions = sessions.filter((h) => h.person === target.person && h.startedAt < target.startedAt);
  const priorBest = new Map(personalRecords(priorSessions, target.person).map((r) => [r.exerciseId, r.estOneRepMax]));
  let count = 0;
  target.entries.forEach((entry) => {
    const bestInSession = entry.sets
      .filter((s) => isWorkingSet(s) && s.weight > 0)
      .reduce((max, s) => Math.max(max, epley(s.weight, s.reps)), 0);
    if (bestInSession > 0 && bestInSession > (priorBest.get(entry.exerciseId) ?? 0)) count++;
  });
  return count;
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

export function periodCutoff(period: StatPeriod, now = Date.now()): number {
  const days = STAT_PERIOD_DAYS[period];
  return days === null ? -Infinity : now - days * DAY;
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
  const cutoff = now - days * DAY;
  const prevCutoff = now - days * 2 * DAY;
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
  const currentWeekStart = startOfWeek(now, weekStart);
  let streak = 0;
  for (let i = 0; ; i++) {
    const start = currentWeekStart - i * 7 * DAY;
    const end = start + 7 * DAY;
    const hasSession = mine.some((h) => h.startedAt >= start && h.startedAt < end);
    if (!hasSession) break;
    streak += 1;
  }
  return streak;
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
