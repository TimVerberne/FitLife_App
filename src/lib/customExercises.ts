import { supabase, fetchAllPages } from './supabase';
import type { CustomExercise } from './types';

// The shared, global exercise library. Unlike every other synced table in
// this app, `custom_exercises` is not partitioned by user: RLS lets any
// authenticated user SELECT every row, so adding an exercise adds it for
// everyone. Only the row's author may edit or archive it (enforced server
// side too), and nothing ever hard-deletes — see archiveCustomExercise.

interface CustomExerciseRow {
  id: string;
  created_by: string | null;
  name: string;
  body_part: string;
  equipment: string;
  target: string;
  secondary_muscles: string[] | null;
  instruction_steps: string[] | null;
  archived: boolean;
  created_at: number;
}

// Postgres unique_violation. Raised by the unique index on lower(name), i.e.
// somebody else added this exact exercise first — worth a specific message
// rather than a generic failure, since it's the one error a user can act on.
export const DUPLICATE_NAME_CODE = '23505';

function toRow(ex: CustomExercise): CustomExerciseRow {
  return {
    id: ex.id,
    created_by: ex.createdBy,
    name: ex.name,
    body_part: ex.body_part,
    equipment: ex.equipment,
    target: ex.target,
    secondary_muscles: ex.secondary_muscles,
    instruction_steps: ex.instruction_steps,
    archived: ex.archived,
    created_at: ex.createdAt,
  };
}

function fromRow(row: CustomExerciseRow): CustomExercise {
  return {
    id: row.id,
    name: row.name,
    body_part: row.body_part,
    equipment: row.equipment,
    target: row.target,
    secondary_muscles: row.secondary_muscles ?? [],
    instruction_steps: row.instruction_steps ?? [],
    // No media for user-authored exercises. Empty strings (rather than
    // optional fields) keep the type identical to a bundled Exercise;
    // Thumb renders its placeholder tile for a falsy src.
    image: '',
    gif_url: '',
    attribution: '',
    createdBy: row.created_by,
    createdAt: row.created_at,
    archived: row.archived,
  };
}

export async function fetchCustomExercises(): Promise<CustomExercise[]> {
  // Archived rows are fetched too, not filtered out server-side: they still
  // have to resolve by id so an old workout that used one keeps showing its
  // name. The picker filters them out instead (see setCustomExercises).
  //
  // Paged, because this is the one table that grows with every user rather
  // than just this one — and a truncated read means exercises that silently
  // stop resolving in other people's feed cards and history.
  const rows = await fetchAllPages<CustomExerciseRow>((from, to) =>
    supabase.from('custom_exercises').select('*').order('id').range(from, to),
  );
  return rows.map(fromRow);
}

// Upsert, so this doubles as both "publish a new exercise" and "save an edit
// / archive". The server's RLS lets the author update their own row, and an
// app_admins member archive anyone's.
export async function pushCustomExerciseRemote(ex: CustomExercise): Promise<void> {
  const { error } = await supabase.from('custom_exercises').upsert(toRow(ex));
  if (error) throw error;
}

// Whether the signed-in user can archive exercises they didn't write. Reads
// the admin allowlist rather than trusting anything client-side; the server
// enforces it regardless, so this only decides whether to offer the action.
// Any failure (table missing because Phase 13 hasn't been run, offline) is
// treated as "not an admin" — the safe direction.
export async function fetchIsAdmin(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    return !!data;
  } catch {
    return false;
  }
}
