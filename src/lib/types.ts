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
