import type { SessionEntry, SetEntry, WorkoutSession } from './types';
import { exerciseById } from './exercises';

const DAY = 86_400_000;

export function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

// Warm-up sets don't count toward volume, reps, or records — only working sets do.
export function isWorkingSet(s: SetEntry): boolean {
  return s.done && s.kind !== 'warmup';
}

export function volumeOf(entries: SessionEntry[]): number {
  return entries.reduce(
    (a, e) => a + e.sets.filter(isWorkingSet).reduce((b, s) => b + s.reps * s.weight, 0),
    0,
  );
}

export function setsCountOf(entries: SessionEntry[]): number {
  return entries.reduce((a, e) => a + e.sets.filter(isWorkingSet).length, 0);
}

export function repsOf(entries: SessionEntry[]): number {
  return entries.reduce((a, e) => a + e.sets.filter(isWorkingSet).reduce((b, s) => b + s.reps, 0), 0);
}

export function relativeDate(ts: number, now = Date.now()): string {
  const d = Math.round((now - ts) / DAY);
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

export interface HeatmapDay {
  date: number;
  volume: number;
}

export function trainingHeatmap(sessions: WorkoutSession[], weeks: number, person = 'You', now = Date.now()): HeatmapDay[][] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const dayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
  const weekEnd = today.getTime() + (6 - dayOfWeek) * DAY;
  const totalDays = weeks * 7;
  const start = weekEnd - (totalDays - 1) * DAY;

  const volByDay = new Map<number, number>();
  sessions
    .filter((h) => h.person === person)
    .forEach((h) => {
      const d = new Date(h.startedAt);
      d.setHours(0, 0, 0, 0);
      const key = d.getTime();
      volByDay.set(key, (volByDay.get(key) ?? 0) + volumeOf(h.entries));
    });

  const cols: HeatmapDay[][] = [];
  for (let w = 0; w < weeks; w++) {
    const col: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const date = start + (w * 7 + d) * DAY;
      col.push({ date, volume: volByDay.get(date) ?? 0 });
    }
    cols.push(col);
  }
  return cols;
}

export function weeklyStreak(sessions: WorkoutSession[], person = 'You', now = Date.now()): number {
  const mine = sessions.filter((h) => h.person === person);
  let streak = 0;
  for (let i = 0; ; i++) {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const hasSession = mine.some((h) => h.startedAt > start && h.startedAt <= end);
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
  cardio: 'Core',
};

export function muscleSplit(sessions: WorkoutSession[], person = 'You'): number[] {
  const counts = new Map(MUSCLE_AXES.map((a) => [a, 0]));
  sessions
    .filter((h) => h.person === person)
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
