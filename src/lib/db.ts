import Dexie, { type EntityTable } from 'dexie';
import type { Routine, WorkoutSession } from './types';
import { SEED_ROUTINES, SEED_SESSIONS } from './seedData';

export const db = new Dexie('fitflow') as Dexie & {
  routines: EntityTable<Routine, 'id'>;
  sessions: EntityTable<WorkoutSession, 'id'>;
};

db.version(1).stores({
  routines: 'id, createdAt',
  sessions: 'id, person, startedAt',
});

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
