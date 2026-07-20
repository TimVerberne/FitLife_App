export interface Exercise {
  id: string;
  name: string;
  body_part: string;
  equipment: string;
  target: string;
  secondary_muscles: string[];
  instruction_steps: string[];
  image: string;
  gif_url: string;
  attribution: string;
}

export type SetKind = 'normal' | 'warmup' | 'failure' | 'dropset' | 'superset';

export interface SetEntry {
  reps: number;
  weight: number;
  done: boolean;
  kind?: SetKind;
  // Cardio exercises (body_part === 'cardio') log these instead of
  // reps/weight — both stay 0 for a cardio set, same as a fresh row for any
  // other exercise, so nothing downstream needs to special-case "missing"
  // fields.
  durationSec?: number;
  distanceKm?: number;
}

export interface SessionEntry {
  exerciseId: string;
  sets: SetEntry[];
}

export interface Routine {
  id: string;
  name: string;
  exerciseIds: string[];
  createdAt: number;
}

// 'You' is always the signed-in user; anything else is a friend's display
// label (their own account, fetched read-only via Supabase RLS).
export type Person = 'You' | (string & {});

export interface WorkoutSession {
  id: string;
  person: Person;
  name: string;
  routineId: string | null;
  startedAt: number;
  durationMin: number;
  entries: SessionEntry[];
}

export interface ActiveSession {
  routineId: string | null;
  name: string;
  startedAt: number;
  entries: SessionEntry[];
  restTimers: Record<string, number>;
}

export interface RestTimerState {
  exerciseId: string;
  endsAt: number;
  total: number;
}

export type Activity = 'sedentary' | 'light' | 'moderate' | 'very' | 'extra';
export type NutritionGoal = 'lose' | 'maintain' | 'gain';
export type Climate = 'temperate' | 'hot';
export type SexAtBirth = 'male' | 'female';

// One row per user. Every field is optional except the ones with defaults —
// calorie/macro estimates are skipped entirely (not guessed) until
// height/birthYear/sexAtBirth are all filled in, see nutrition.ts.
export interface BodyProfile {
  heightCm: number | null;
  birthYear: number | null;
  sexAtBirth: SexAtBirth | null;
  activity: Activity;
  goal: NutritionGoal;
  rateKgWeek: number;
  climate: Climate;
  sweatRateMlH: number | null;
  updatedAt: number;
}

// One row per calendar day (YYYY-MM-DD), matching the server's
// unique(user_id, logged_on) constraint — logging again the same day edits
// the same entry rather than creating a new one.
export interface BodyLogEntry {
  loggedOn: string;
  weightKg: number | null;
  bodyFatPct: number | null;
  waistCm: number | null;
  chestCm: number | null;
  armCm: number | null;
  thighCm: number | null;
  hipCm: number | null;
  neckCm: number | null;
  sleepHours: number | null;
  restingHr: number | null;
  energy: number | null;
  note: string | null;
}

// Append-only — multiple entries per day, unlike BodyLogEntry.
export interface WaterLogEntry {
  id: string;
  loggedOn: string;
  amountMl: number;
  loggedAt: number;
}
