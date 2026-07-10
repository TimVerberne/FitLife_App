import Dexie, { type EntityTable } from 'dexie';
import type { Routine, WorkoutSession } from './types';
import { SEED_ROUTINES, SEED_SESSIONS } from './seedData';

export interface PendingSyncEntry {
  id?: number;
  table: 'routines' | 'sessions' | 'settings';
  rowId: string;
  op: 'upsert' | 'delete';
}

export const db = new Dexie('fitflow') as Dexie & {
  routines: EntityTable<Routine, 'id'>;
  sessions: EntityTable<WorkoutSession, 'id'>;
  pendingSync: EntityTable<PendingSyncEntry, 'id'>;
};

db.version(1).stores({
  routines: 'id, createdAt',
  sessions: 'id, person, startedAt',
});

db.version(2).stores({
  routines: 'id, createdAt',
  sessions: 'id, person, startedAt',
  pendingSync: '++id, table',
});

// The Dexie cache is per-browser, not per-account. Without this, signing out
// of one account and into another would let the first account's local cache
// get treated as "this device's existing history" and uploaded straight into
// the second account's Supabase tables. Called on every SIGNED_OUT event
// (see cloudSync.ts) so no local data survives a sign-out.
export async function wipeLocalData(): Promise<void> {
  await Promise.all([db.routines.clear(), db.sessions.clear(), db.pendingSync.clear()]);
}

// One-time cleanup for installs that predate the real friends system: the
// old Sanne/Joost demo rows are gone from seedData.ts, but existing local
// Dexie caches still have them cached from before. Hardcoded to these two
// exact legacy names (not a generic "anything not You" purge) so it can
// never touch a real friend's data — friend sessions never reach Dexie in
// the first place, so there's nothing else here to worry about.
export async function purgeDemoFriendRows(): Promise<void> {
  await db.sessions.where('person').anyOf(['Sanne', 'Joost']).delete();
}

export async function seedIfEmpty(): Promise<void> {
  const [routineCount, sessionCount] = await Promise.all([db.routines.count(), db.sessions.count()]);
  // Seed IDs are fixed/deterministic, so bulkPut (upsert) keeps this safe if
  // called concurrently (e.g. React StrictMode double-invoking effects in dev).
  if (routineCount === 0) {
    await db.routines.bulkPut(SEED_ROUTINES);
  }
  if (sessionCount === 0) {
    await db.sessions.bulkPut(SEED_SESSIONS);
  }
}

// Legacy local ids (e.g. `r1`, `seed-5`, or the old `s-${Date.now()}-...` /
// `r-${Date.now()}-...` client ids) aren't valid Postgres UUIDs. Rewrite
// routines and the user's own ('You') sessions to fresh UUIDs before they
// ever leave the device, so the id-rewrite is a pure local operation that
// can be retried safely (a failed upload retries the *same* already-
// rewritten rows). Any non-'You' session keeps its own id (never synced to
// Supabase) but still gets its routineId reference fixed up, since the
// routine it points at may have just been given a new id.
export function remapLegacyIdsToUuid(
  routines: Routine[],
  sessions: WorkoutSession[],
): { routines: Routine[]; sessions: WorkoutSession[] } {
  const idMap = new Map<string, string>();
  const newRoutines = routines.map((r) => {
    const id = crypto.randomUUID();
    idMap.set(r.id, id);
    return { ...r, id };
  });
  const newSessions = sessions.map((s) => ({
    ...s,
    id: s.person === 'You' ? crypto.randomUUID() : s.id,
    routineId: s.routineId ? (idMap.get(s.routineId) ?? null) : null,
  }));
  return { routines: newRoutines, sessions: newSessions };
}
