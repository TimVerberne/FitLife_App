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

// A user-authored exercise, added to one shared global library rather than
// to the author's own account — anyone signed in sees it in the picker and
// can log it. It deliberately extends `Exercise` (rather than sitting in a
// parallel type) so nothing downstream has to know the difference: records,
// PRs, badges, volume, routines and the crew feed all key off `id` and read
// the same fields. The extra fields below exist only for provenance and for
// deciding who may edit it.
export interface CustomExercise extends Exercise {
  // Supabase user id of whoever added it — or null once that account is
  // deleted. The exercise outlives its author on purpose: other people's
  // workout history references it, and a global library that loses entries
  // when someone leaves would silently break their past workouts.
  createdBy: string | null;
  createdAt: number;
  // Soft delete. Hidden from the picker and from search, but still
  // resolvable by id, so past workouts and PRs that reference it keep
  // rendering. Nothing ever hard-deletes a row from the shared library.
  archived: boolean;
}

// What the create/edit form collects. Media and secondary muscles aren't
// authorable — the picker and detail sheet fall back to a placeholder tile
// and simply omit the sections that have no content.
export type CustomExerciseDraft = Pick<Exercise, 'name' | 'body_part' | 'equipment' | 'target'> & {
  instruction_steps: string[];
};

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
  // Superset partner's exerciseId, set symmetrically on both sides of a
  // pair (see pairSuperset/unpairSuperset). Kept as an exerciseId, not an
  // entries-array index, for the same reason MenuState is — an index would
  // go stale the moment a drag-reorder or exercise removal shifts what's at
  // that position.
  supersetWith?: string;
}

export interface Routine {
  id: string;
  name: string;
  exerciseIds: string[];
  createdAt: number;
  // Drives the Train screen's display order (drag-to-reorder writes this).
  // Optional so routines synced before this field existed still sort
  // sensibly — falls back to createdAt wherever it's missing.
  sortOrder?: number;
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
// 'rate' — target is derived from goal + rateKgWeek (the original model).
// 'kcal' — target is manualKcalTarget directly; goal/rateKgWeek still exist
// but are ignored for the target itself, only used as the last known rate
// if the user switches back to 'rate' mode.
export type GoalMode = 'rate' | 'kcal';

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
  goalMode: GoalMode;
  manualKcalTarget: number | null;
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

// A single running daily total, same shape/semantics as WaterLogEntry — no
// meal names, no per-food macros, no food database.
export interface CalorieLogEntry {
  id: string;
  loggedOn: string;
  amountKcal: number;
  loggedAt: number;
}
