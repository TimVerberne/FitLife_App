import { supabase, getCurrentUserId, fetchAllPages } from './supabase';
import type { ExerciseNote } from './types';

// Sticky per-exercise notes, private to each user (see the Phase 17 table in
// schema.sql). One row per (user, exercise); clearing the text deletes the
// row rather than storing an empty one, so "has a note" is simply "a row
// exists".

interface ExerciseNoteRow {
  exercise_id: string;
  note: string;
  updated_at: string;
}

/** Hard cap matching the table's own check constraint. */
export const NOTE_MAX_LENGTH = 500;

export async function fetchExerciseNotes(): Promise<ExerciseNote[]> {
  const userId = getCurrentUserId();
  if (!userId) return [];
  const rows = await fetchAllPages<ExerciseNoteRow>((from, to) =>
    supabase
      .from('exercise_notes')
      .select('exercise_id, note, updated_at')
      .eq('user_id', userId)
      .order('exercise_id')
      .range(from, to),
  );
  return rows.map((row) => ({
    exerciseId: row.exercise_id,
    note: row.note,
    updatedAt: Date.parse(row.updated_at) || 0,
  }));
}

export async function pushExerciseNoteRemote(note: ExerciseNote): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase.from('exercise_notes').upsert({
    user_id: userId,
    exercise_id: note.exerciseId,
    note: note.note,
    updated_at: new Date(note.updatedAt || Date.now()).toISOString(),
  });
  if (error) throw error;
}

export async function deleteExerciseNoteRemote(exerciseId: string): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('exercise_notes')
    .delete()
    .eq('user_id', userId)
    .eq('exercise_id', exerciseId);
  if (error) throw error;
}
