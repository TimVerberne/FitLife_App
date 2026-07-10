import type { Routine, SessionEntry, WorkoutSession } from './types';

const DAY = 86_400_000;
const NOW = Date.now();

export const SEED_ROUTINES: Routine[] = [
  { id: 'r1', name: 'Chest & Triceps', exerciseIds: ['0025', '0047', '1269', '0060'], createdAt: NOW - 60 * DAY },
  { id: 'r2', name: 'Push Day', exerciseIds: ['0025', '0047', '0091', '0334', '0060'], createdAt: NOW - 55 * DAY },
  { id: 'r3', name: 'Legs', exerciseIds: ['0043', '0032', '0300', '0336', '0585', '1372'], createdAt: NOW - 50 * DAY },
];

function entry(exerciseId: string, sets: [number, number][]): SessionEntry {
  return { exerciseId, sets: sets.map(([weight, reps]) => ({ weight, reps, done: true })) };
}

let n = 0;
function session(
  person: WorkoutSession['person'],
  name: string,
  routineId: string | null,
  daysAgo: number,
  entries: SessionEntry[],
  durationMin: number,
): WorkoutSession {
  n += 1;
  return { id: `seed-${n}`, person, name, routineId, startedAt: NOW - daysAgo * DAY, durationMin, entries };
}

export const SEED_SESSIONS: WorkoutSession[] = [
  session('You', 'Legs', 'r3', 3, [
    entry('0043', [[85, 8], [85, 8], [87.5, 6]]),
    entry('0032', [[110, 4], [110, 4]]),
    entry('0300', [[32.5, 12], [32.5, 11]]),
  ], 61),
  session('You', 'Chest & Triceps', 'r1', 6, [
    entry('0025', [[67.5, 9], [67.5, 8], [65, 9]]),
    entry('0060', [[30, 10], [30, 10]]),
    entry('0091', [[45, 8], [45, 7]]),
    entry('0500', [[0, 30]]),
  ], 54),
  session('You', 'Legs', 'r3', 10, [
    entry('0043', [[82.5, 8], [82.5, 8], [85, 6]]),
    entry('0032', [[105, 5], [107.5, 4]]),
  ], 57),
  session('You', 'Chest & Triceps', 'r1', 13, [
    entry('0025', [[65, 10], [65, 9], [65, 8]]),
    entry('0060', [[27.5, 11], [27.5, 10]]),
    entry('0091', [[42.5, 8], [42.5, 8]]),
  ], 50),
  session('You', 'Legs', 'r3', 17, [
    entry('0043', [[80, 8], [80, 8]]),
    entry('0032', [[102.5, 5], [102.5, 5]]),
    entry('0300', [[30, 12]]),
  ], 53),
  session('You', 'Chest & Triceps', 'r1', 20, [
    entry('0025', [[62.5, 10], [62.5, 9], [65, 7]]),
    entry('0060', [[27.5, 10]]),
    entry('0091', [[42.5, 7]]),
  ], 48),
  session('You', 'Full Body', null, 24, [
    entry('0043', [[77.5, 8]]),
    entry('0025', [[60, 10]]),
    entry('0007', [[55, 10]]),
  ], 46),
  session('You', 'Legs', 'r3', 28, [
    entry('0043', [[77.5, 8], [77.5, 8]]),
    entry('0032', [[100, 5]]),
  ], 51),
  session('You', 'Chest & Triceps', 'r1', 31, [
    entry('0025', [[60, 9], [60, 8]]),
    entry('0060', [[25, 12]]),
    entry('0091', [[40, 8]]),
  ], 47),
  session('You', 'Legs', 'r3', 38, [
    entry('0043', [[75, 8], [75, 8]]),
    entry('0032', [[95, 5]]),
  ], 49),
  session('You', 'Chest & Triceps', 'r1', 45, [
    entry('0025', [[57.5, 9]]),
    entry('0091', [[40, 7]]),
  ], 44),
  session('You', 'Legs', 'r3', 52, [
    entry('0043', [[72.5, 8]]),
    entry('0032', [[90, 5]]),
  ], 42),
];
