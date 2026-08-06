import { supabase, getCurrentUserId, onSignedOut, fetchAllPages } from './supabase';
import { db, wipeLocalData, type PendingSyncEntry } from './db';
import type { CustomExercise, Routine, SessionEntry, WorkoutSession } from './types';
import { loadSettings, type Settings } from './settings';
import { flushBodyPendingSync } from './bodySync';
import { pushCustomExerciseRemote } from './customExercises';

function requireUserId(): string {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  return userId;
}

interface RoutineRow {
  id: string;
  name: string;
  exercise_ids: string[];
  created_at: number;
  sort_order: number | null;
}

interface SessionRow {
  id: string;
  name: string;
  routine_id: string | null;
  started_at: number;
  duration_min: number;
  entries: SessionEntry[];
}

function routineRow(routine: Routine, userId: string) {
  return {
    id: routine.id,
    user_id: userId,
    name: routine.name,
    exercise_ids: routine.exerciseIds,
    created_at: routine.createdAt,
    sort_order: routine.sortOrder ?? null,
  };
}

function sessionRow(session: WorkoutSession, userId: string) {
  return {
    id: session.id,
    user_id: userId,
    person: 'You' as const,
    name: session.name,
    routine_id: session.routineId,
    started_at: session.startedAt,
    duration_min: session.durationMin,
    entries: session.entries,
  };
}

async function enqueuePendingSync(entry: Omit<PendingSyncEntry, 'id'>) {
  await db.pendingSync.add(entry);
}

export async function pushRoutine(routine: Routine): Promise<void> {
  try {
    const userId = requireUserId();
    const { error } = await supabase.from('routines').upsert(routineRow(routine, userId));
    if (error) throw error;
  } catch {
    await enqueuePendingSync({ table: 'routines', rowId: routine.id, op: 'upsert' });
  }
}

export async function deleteRoutineRemote(id: string): Promise<void> {
  try {
    requireUserId();
    const { error } = await supabase.from('routines').delete().eq('id', id);
    if (error) throw error;
  } catch {
    await enqueuePendingSync({ table: 'routines', rowId: id, op: 'delete' });
  }
}

export async function pushSession(session: WorkoutSession): Promise<void> {
  if (session.person !== 'You') return; // never push someone else's session under your own account
  try {
    const userId = requireUserId();
    const { error } = await supabase.from('sessions').upsert(sessionRow(session, userId));
    if (error) throw error;
  } catch {
    await enqueuePendingSync({ table: 'sessions', rowId: session.id, op: 'upsert' });
  }
}

export async function deleteSessionRemote(id: string): Promise<void> {
  try {
    requireUserId();
    const { error } = await supabase.from('sessions').delete().eq('id', id);
    if (error) throw error;
  } catch {
    await enqueuePendingSync({ table: 'sessions', rowId: id, op: 'delete' });
  }
}

// Publishing to the shared library is rejected permanently, not temporarily,
// when the name is already taken (someone else added it first) or when RLS
// refuses the write (trying to edit an exercise you didn't author). Unlike
// the other tables here — where every realistic failure is "offline, try
// later" — re-queueing these would retry a doomed row on every single flush,
// forever.
const PERMANENT_PUSH_CODES = new Set([
  '23505', // unique_violation — that exercise name already exists
  '42501', // insufficient_privilege — RLS rejected the write
]);

function isPermanentRejection(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === 'string' && PERMANENT_PUSH_CODES.has(code);
}

// Same offline-tolerant pattern as pushRoutine: the exercise is already
// written to Dexie by the caller and usable immediately, so a publish that
// fails offline just queues and retries rather than blocking the user from
// logging the exercise they just made. Archiving goes through here too — it
// writes `archived: true` on the same row, never a delete.
export async function pushCustomExercise(exercise: CustomExercise): Promise<void> {
  try {
    requireUserId();
    await pushCustomExerciseRemote(exercise);
  } catch (err) {
    if (isPermanentRejection(err)) {
      // Give up rather than retry forever. The exercise stays usable on this
      // device and keeps working in this user's own history — it just never
      // becomes part of the shared library.
      console.error(`Could not publish "${exercise.name}" to the shared library`, err);
      return;
    }
    await enqueuePendingSync({ table: 'customExercises', rowId: exercise.id, op: 'upsert' });
  }
}

export async function pushSettings(settings: Settings): Promise<void> {
  try {
    const userId = requireUserId();
    const { error } = await supabase.from('settings').upsert({ user_id: userId, data: settings, updated_at: new Date().toISOString() });
    if (error) throw error;
  } catch {
    // Settings has no natural per-row id (it's one row per user) — the
    // pending entry's rowId is unused for this table, just a placeholder.
    await enqueuePendingSync({ table: 'settings', rowId: getCurrentUserId() ?? 'unknown', op: 'upsert' });
  }
}

// Deletes the auth.users row itself (via the delete_own_account Postgres
// function) — not just this account's data. Cascades through profiles,
// routines, sessions, settings, and friendships on the database side.
export async function deleteOwnAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_own_account');
  if (error) throw error;
}

export async function remoteCounts(): Promise<{ routines: number; sessions: number }> {
  const userId = requireUserId();
  const [routines, sessions] = await Promise.all([
    supabase.from('routines').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('sessions').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  // A transient query error must not be silently read as "0 rows" — that's
  // indistinguishable from a genuinely empty account and would make
  // syncWithCloud wrongly take the "brand new account" branch for an
  // existing account, permanently marking this device linked without ever
  // having pulled its real history down.
  if (routines.error) throw routines.error;
  if (sessions.error) throw sessions.error;
  return { routines: routines.count ?? 0, sessions: sessions.count ?? 0 };
}

export async function fetchSettings(): Promise<Settings | null> {
  const userId = requireUserId();
  const { data, error } = await supabase.from('settings').select('data').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return (data?.data as Settings | undefined) ?? null;
}

export async function fetchAllRemote(): Promise<{ routines: Routine[]; sessions: WorkoutSession[] }> {
  const userId = requireUserId();
  // Paged: a truncated read here is worse than a truncated display, because
  // reconcileNewFromCloud treats "not present remotely" as "deleted on
  // another device" and would delete the missing rows locally.
  const [routineRows, sessionRows] = await Promise.all([
    fetchAllPages<RoutineRow>((from, to) =>
      supabase.from('routines').select('*').eq('user_id', userId).order('id').range(from, to),
    ),
    fetchAllPages<SessionRow>((from, to) =>
      supabase.from('sessions').select('*').eq('user_id', userId).order('id').range(from, to),
    ),
  ]);
  const routines: Routine[] = routineRows.map((r) => ({
    id: r.id,
    name: r.name,
    exerciseIds: r.exercise_ids,
    createdAt: r.created_at,
    sortOrder: r.sort_order ?? undefined,
  }));
  const sessions: WorkoutSession[] = sessionRows.map((s) => ({
    id: s.id,
    person: 'You',
    name: s.name,
    routineId: s.routine_id,
    startedAt: s.started_at,
    durationMin: s.duration_min,
    entries: s.entries,
  }));
  return { routines, sessions };
}

export async function uploadLocalDataOnFirstLogin(routines: Routine[], sessions: WorkoutSession[]): Promise<void> {
  const userId = requireUserId();
  const mine = sessions.filter((s) => s.person === 'You');
  if (routines.length > 0) {
    const { error } = await supabase.from('routines').upsert(routines.map((r) => routineRow(r, userId)));
    if (error) throw error;
  }
  if (mine.length > 0) {
    const { error } = await supabase.from('sessions').upsert(mine.map((s) => sessionRow(s, userId)));
    if (error) throw error;
  }
}

function routineContentDiffers(a: Routine, b: Routine): boolean {
  return (
    a.name !== b.name ||
    a.exerciseIds.length !== b.exerciseIds.length ||
    a.exerciseIds.some((id, i) => id !== b.exerciseIds[i])
  );
}

// Reconcile for a device that's already linked to its account. Routines can
// be renamed or have their exercise list edited after creation, and both
// routines and sessions can now be deleted after creation (delete a routine;
// delete a workout from history) — so a device already holding a local copy
// needs to pick up remote content changes AND remote deletions, not just
// brand-new rows created on another device. Without the "gone" side of this,
// deleting something on one device would never remove it from another
// already-linked device; it'd sit there indefinitely since nothing ever
// re-checks an id that already exists locally against whether it still
// exists remotely. flushPendingSync() runs before this (see syncWithCloud),
// so this device's own not-yet-synced edits/deletes are already pushed up by
// the time remote is fetched here — cloud winning for an existing id isn't
// clobbering unsynced local work in the normal (online) case.
export async function reconcileNewFromCloud(
  localRoutines: Routine[],
  localSessions: WorkoutSession[],
): Promise<{
  newRoutines: Routine[];
  updatedRoutines: Routine[];
  goneRoutineIds: string[];
  newSessions: WorkoutSession[];
  goneSessionIds: string[];
}> {
  const remote = await fetchAllRemote();
  const localRoutineById = new Map(localRoutines.map((r) => [r.id, r]));
  const localSessionIds = new Set(localSessions.map((s) => s.id));
  const remoteRoutineIds = new Set(remote.routines.map((r) => r.id));
  const remoteSessionIds = new Set(remote.sessions.map((s) => s.id));

  const newRoutines: Routine[] = [];
  const updatedRoutines: Routine[] = [];
  for (const remoteRoutine of remote.routines) {
    const local = localRoutineById.get(remoteRoutine.id);
    if (!local) newRoutines.push(remoteRoutine);
    else if (routineContentDiffers(local, remoteRoutine)) updatedRoutines.push(remoteRoutine);
  }

  return {
    newRoutines,
    updatedRoutines,
    goneRoutineIds: localRoutines.filter((r) => !remoteRoutineIds.has(r.id)).map((r) => r.id),
    newSessions: remote.sessions.filter((s) => !localSessionIds.has(s.id)),
    goneSessionIds: localSessions.filter((s) => !remoteSessionIds.has(s.id)).map((s) => s.id),
  };
}

export async function flushPendingSync(): Promise<void> {
  if (!getCurrentUserId()) return;
  const entries = await db.pendingSync.toArray();
  for (const entry of entries) {
    try {
      if (entry.op === 'delete') {
        if (entry.table === 'routines') await deleteRoutineRemote(entry.rowId);
        else if (entry.table === 'sessions') await deleteSessionRemote(entry.rowId);
        else await flushBodyPendingSync(entry);
      } else if (entry.table === 'routines') {
        const routine = await db.routines.get(entry.rowId);
        if (routine) await pushRoutine(routine);
      } else if (entry.table === 'sessions') {
        const session = await db.sessions.get(entry.rowId);
        if (session) await pushSession(session);
      } else if (entry.table === 'customExercises') {
        const exercise = await db.customExercises.get(entry.rowId);
        if (exercise) await pushCustomExercise(exercise);
      } else if (entry.table === 'settings') {
        await pushSettings(loadSettings());
      } else {
        await flushBodyPendingSync(entry);
      }
      if (entry.id !== undefined) await db.pendingSync.delete(entry.id);
    } catch {
      // Still offline/unreachable — leave queued, try again next flush.
    }
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flushPendingSync());
}

onSignedOut(() => void wipeLocalData());
