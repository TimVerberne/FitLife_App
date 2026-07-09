import type { SessionEntry, WorkoutSession } from './types';
import { exerciseById } from './exercises';

const DAY = 86_400_000;

export function epley(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30);
}

export function volumeOf(entries: SessionEntry[]): number {
  return entries.reduce(
    (a, e) => a + e.sets.filter((s) => s.done).reduce((b, s) => b + s.reps * s.weight, 0),
    0,
  );
}

export function setsCountOf(entries: SessionEntry[]): number {
  return entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);
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
          .filter((s) => s.done)
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
      .filter((s) => s.done && s.weight > 0)
      .reduce((max, s) => Math.max(max, epley(s.weight, s.reps)), 0);
    if (bestInSession > 0 && bestInSession > (priorBest.get(entry.exerciseId) ?? 0)) count++;
  });
  return count;
}

export interface WeekBucket {
  label: string;
  volume: number;
}

export function weeklyVolume(sessions: WorkoutSession[], nWeeks: number, person = 'You', now = Date.now()): WeekBucket[] {
  const mine = sessions.filter((h) => h.person === person);
  const weeks: WeekBucket[] = [];
  for (let i = nWeeks - 1; i >= 0; i--) {
    const end = now - i * 7 * DAY;
    const start = end - 7 * DAY;
    const volume = mine.filter((h) => h.startedAt > start && h.startedAt <= end).reduce((a, h) => a + volumeOf(h.entries), 0);
    weeks.push({ volume, label: new Date(end).toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) });
  }
  return weeks;
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

const MUSCLE_GROUP: Record<string, string> = {
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
          counts.set(axis, (counts.get(axis) ?? 0) + e.sets.filter((s) => s.done).length);
        }
      }),
    );
  return MUSCLE_AXES.map((a) => counts.get(a) ?? 0);
}
