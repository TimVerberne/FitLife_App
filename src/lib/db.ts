import Dexie, { type EntityTable } from 'dexie';
import type { ActiveSession, BodyLogEntry, BodyProfile, CalorieLogEntry, Routine, WaterLogEntry, WorkoutSession } from './types';

export interface PendingSyncEntry {
  id?: number;
  table: 'routines' | 'sessions' | 'settings' | 'bodyProfile' | 'bodyLog' | 'waterLog' | 'calorieLog';
  rowId: string;
  op: 'upsert' | 'delete';
}

// A single-row table (always keyed 'current') mirroring the store's `active`
// field to disk as it changes, not just at finishSession() time — so an
// in-progress workout survives the OS fully evicting a backgrounded PWA
// (iOS does this aggressively) instead of only surviving a suspend/resume.
export interface ActiveSessionRecord extends ActiveSession {
  id: 'current';
}

// Single-row-per-account, same 'current' key convention as ActiveSessionRecord.
export interface BodyProfileRecord extends BodyProfile {
  id: 'current';
}

export const DEFAULT_BODY_PROFILE: BodyProfile = {
  heightCm: null,
  birthYear: null,
  sexAtBirth: null,
  activity: 'moderate',
  goal: 'maintain',
  rateKgWeek: 0.5,
  climate: 'temperate',
  sweatRateMlH: null,
  updatedAt: 0,
};

export const db = new Dexie('fitflow') as Dexie & {
  routines: EntityTable<Routine, 'id'>;
  sessions: EntityTable<WorkoutSession, 'id'>;
  pendingSync: EntityTable<PendingSyncEntry, 'id'>;
  activeSession: EntityTable<ActiveSessionRecord, 'id'>;
  bodyProfile: EntityTable<BodyProfileRecord, 'id'>;
  bodyLog: EntityTable<BodyLogEntry, 'loggedOn'>;
  waterLog: EntityTable<WaterLogEntry, 'id'>;
  calorieLog: EntityTable<CalorieLogEntry, 'id'>;
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

db.version(3).stores({
  routines: 'id, createdAt',
  sessions: 'id, person, startedAt',
  pendingSync: '++id, table',
  activeSession: 'id',
});

db.version(4).stores({
  routines: 'id, createdAt',
  sessions: 'id, person, startedAt',
  pendingSync: '++id, table',
  activeSession: 'id',
  bodyProfile: 'id',
  bodyLog: 'loggedOn',
  waterLog: 'id, loggedOn',
});

db.version(5).stores({
  routines: 'id, createdAt',
  sessions: 'id, person, startedAt',
  pendingSync: '++id, table',
  activeSession: 'id',
  bodyProfile: 'id',
  bodyLog: 'loggedOn',
  waterLog: 'id, loggedOn',
  calorieLog: 'id, loggedOn',
});

// The Dexie cache is per-browser, not per-account. Without this, signing out
// of one account and into another would let the first account's local cache
// get treated as "this device's existing history" and uploaded straight into
// the second account's Supabase tables. Called on every SIGNED_OUT event
// (see cloudSync.ts) so no local data survives a sign-out.
export async function wipeLocalData(): Promise<void> {
  await Promise.all([
    db.routines.clear(),
    db.sessions.clear(),
    db.pendingSync.clear(),
    db.activeSession.clear(),
    db.bodyProfile.clear(),
    db.bodyLog.clear(),
    db.waterLog.clear(),
    db.calorieLog.clear(),
  ]);
}

// One-time cleanup for installs that predate the real friends system:
// existing local Dexie caches may still have the old Sanne/Joost demo rows
// cached from before they were retired. Hardcoded to these two
// exact legacy names (not a generic "anything not You" purge) so it can
// never touch a real friend's data — friend sessions never reach Dexie in
// the first place, so there's nothing else here to worry about.
export async function purgeDemoFriendRows(): Promise<void> {
  await db.sessions.where('person').anyOf(['Sanne', 'Joost']).delete();
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
