import { supabase, getCurrentUserId, fetchAllPages } from './supabase';
import { db, DEFAULT_BODY_PROFILE, type BodyProfileRecord } from './db';
import type { BodyProfile, BodyLogEntry, CalorieLogEntry, WaterLogEntry } from './types';

function requireUserId(): string {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  return userId;
}

async function enqueuePendingSync(table: 'bodyProfile' | 'bodyLog' | 'waterLog' | 'calorieLog', rowId: string, op: 'upsert' | 'delete') {
  await db.pendingSync.add({ table, rowId, op });
}

function bodyProfileRow(profile: BodyProfile, userId: string) {
  return {
    user_id: userId,
    height_cm: profile.heightCm,
    birth_year: profile.birthYear,
    sex_at_birth: profile.sexAtBirth,
    activity: profile.activity,
    goal: profile.goal,
    rate_kg_week: profile.rateKgWeek,
    goal_mode: profile.goalMode,
    manual_kcal_target: profile.manualKcalTarget,
    climate: profile.climate,
    sweat_rate_ml_h: profile.sweatRateMlH,
    updated_at: new Date(profile.updatedAt || Date.now()).toISOString(),
  };
}

function rowToBodyProfile(r: Record<string, unknown>): BodyProfile {
  return {
    heightCm: (r.height_cm as number | null) ?? null,
    birthYear: (r.birth_year as number | null) ?? null,
    sexAtBirth: (r.sex_at_birth as BodyProfile['sexAtBirth']) ?? null,
    activity: (r.activity as BodyProfile['activity']) ?? DEFAULT_BODY_PROFILE.activity,
    goal: (r.goal as BodyProfile['goal']) ?? DEFAULT_BODY_PROFILE.goal,
    rateKgWeek: (r.rate_kg_week as number) ?? DEFAULT_BODY_PROFILE.rateKgWeek,
    goalMode: (r.goal_mode as BodyProfile['goalMode']) ?? DEFAULT_BODY_PROFILE.goalMode,
    manualKcalTarget: (r.manual_kcal_target as number | null) ?? null,
    climate: (r.climate as BodyProfile['climate']) ?? DEFAULT_BODY_PROFILE.climate,
    sweatRateMlH: (r.sweat_rate_ml_h as number | null) ?? null,
    updatedAt: r.updated_at ? new Date(r.updated_at as string).getTime() : Date.now(),
  };
}

export async function pushBodyProfile(profile: BodyProfile): Promise<void> {
  try {
    const userId = requireUserId();
    const { error } = await supabase.from('body_profile').upsert(bodyProfileRow(profile, userId));
    if (error) throw error;
  } catch {
    // No natural per-row id (one row per user) — rowId is unused for this table.
    await enqueuePendingSync('bodyProfile', getCurrentUserId() ?? 'unknown', 'upsert');
  }
}

export async function fetchBodyProfile(): Promise<BodyProfile | null> {
  const userId = requireUserId();
  const { data, error } = await supabase.from('body_profile').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data ? rowToBodyProfile(data) : null;
}

function bodyLogRow(entry: BodyLogEntry, userId: string) {
  return {
    user_id: userId,
    logged_on: entry.loggedOn,
    weight_kg: entry.weightKg,
    body_fat_pct: entry.bodyFatPct,
    waist_cm: entry.waistCm,
    chest_cm: entry.chestCm,
    arm_cm: entry.armCm,
    thigh_cm: entry.thighCm,
    hip_cm: entry.hipCm,
    neck_cm: entry.neckCm,
    sleep_hours: entry.sleepHours,
    resting_hr: entry.restingHr,
    energy: entry.energy,
    note: entry.note,
  };
}

function rowToBodyLogEntry(r: Record<string, unknown>): BodyLogEntry {
  return {
    loggedOn: r.logged_on as string,
    weightKg: (r.weight_kg as number | null) ?? null,
    bodyFatPct: (r.body_fat_pct as number | null) ?? null,
    waistCm: (r.waist_cm as number | null) ?? null,
    chestCm: (r.chest_cm as number | null) ?? null,
    armCm: (r.arm_cm as number | null) ?? null,
    thighCm: (r.thigh_cm as number | null) ?? null,
    hipCm: (r.hip_cm as number | null) ?? null,
    neckCm: (r.neck_cm as number | null) ?? null,
    sleepHours: (r.sleep_hours as number | null) ?? null,
    restingHr: (r.resting_hr as number | null) ?? null,
    energy: (r.energy as number | null) ?? null,
    note: (r.note as string | null) ?? null,
  };
}

// Upserts on (user_id, logged_on) rather than the row's own id — the id is
// server-generated (gen_random_uuid()), so the client can't know it ahead of
// time the way it does for routines/sessions. Targeting the natural-key
// conflict means editing "today" from any device always converges on the
// same row, matching the table's own unique(user_id, logged_on) constraint.
export async function pushBodyLogEntry(entry: BodyLogEntry): Promise<void> {
  try {
    const userId = requireUserId();
    const { error } = await supabase
      .from('body_log')
      .upsert(bodyLogRow(entry, userId), { onConflict: 'user_id,logged_on' });
    if (error) throw error;
  } catch {
    await enqueuePendingSync('bodyLog', entry.loggedOn, 'upsert');
  }
}

// Paged, because a plain select silently truncates at the server's max-rows
// and — ordered ascending — would drop the most recent entries first, i.e.
// exactly the ones the Life tab shows. `logged_on` is unique per user
// (see the table's unique constraint), so it's a stable sort for paging.
export async function fetchBodyLog(): Promise<BodyLogEntry[]> {
  const userId = requireUserId();
  const rows = await fetchAllPages<Record<string, unknown>>((from, to) =>
    supabase.from('body_log').select('*').eq('user_id', userId).order('logged_on').range(from, to),
  );
  return rows.map(rowToBodyLogEntry);
}

function waterLogRow(entry: WaterLogEntry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    logged_on: entry.loggedOn,
    amount_ml: entry.amountMl,
    logged_at: new Date(entry.loggedAt).toISOString(),
  };
}

// Append-only (multiple entries/day), with a client-generated uuid assigned
// before the row ever leaves the device — same id strategy as
// routines/sessions.
//
// Upsert, not insert, and that distinction matters: a write that commits
// server-side but loses its response on the way back (an ordinary flaky
// connection) gets queued for retry, and an insert retry would hit a primary
// key conflict on the id it already wrote. That failure is permanent, so it
// re-queued on every subsequent flush — the pending queue could never drain
// again. Upserting makes the retry idempotent instead.
export async function pushWaterLogEntry(entry: WaterLogEntry): Promise<void> {
  try {
    const userId = requireUserId();
    const { error } = await supabase.from('water_log').upsert(waterLogRow(entry, userId));
    if (error) throw error;
  } catch {
    await enqueuePendingSync('waterLog', entry.id, 'upsert');
  }
}

export async function deleteWaterLogEntryRemote(id: string): Promise<void> {
  try {
    requireUserId();
    const { error } = await supabase.from('water_log').delete().eq('id', id);
    if (error) throw error;
  } catch {
    await enqueuePendingSync('waterLog', id, 'delete');
  }
}

// Paged for the same reason as fetchBodyLog. `logged_at` alone isn't a
// unique sort — two quick taps can share a millisecond — so `id` breaks the
// tie and keeps row order stable across page boundaries; without that, a
// row can be skipped or repeated between pages.
export async function fetchWaterLog(): Promise<WaterLogEntry[]> {
  const userId = requireUserId();
  const data = await fetchAllPages<Record<string, unknown>>((from, to) =>
    supabase.from('water_log').select('*').eq('user_id', userId).order('logged_at').order('id').range(from, to),
  );
  return data.map((r) => ({
    id: r.id as string,
    loggedOn: r.logged_on as string,
    amountMl: r.amount_ml as number,
    loggedAt: new Date(r.logged_at as string).getTime(),
  }));
}

function calorieLogRow(entry: CalorieLogEntry, userId: string) {
  return {
    id: entry.id,
    user_id: userId,
    logged_on: entry.loggedOn,
    amount_kcal: entry.amountKcal,
    logged_at: new Date(entry.loggedAt).toISOString(),
  };
}

// Append-only, same shape/strategy as pushWaterLogEntry above — including
// the upsert, for the same retry-idempotency reason.
export async function pushCalorieLogEntry(entry: CalorieLogEntry): Promise<void> {
  try {
    const userId = requireUserId();
    const { error } = await supabase.from('calorie_log').upsert(calorieLogRow(entry, userId));
    if (error) throw error;
  } catch {
    await enqueuePendingSync('calorieLog', entry.id, 'upsert');
  }
}

// Paged, with the same `logged_at, id` stable sort as fetchWaterLog.
export async function fetchCalorieLog(): Promise<CalorieLogEntry[]> {
  const userId = requireUserId();
  const data = await fetchAllPages<Record<string, unknown>>((from, to) =>
    supabase.from('calorie_log').select('*').eq('user_id', userId).order('logged_at').order('id').range(from, to),
  );
  return data.map((r) => ({
    id: r.id as string,
    loggedOn: r.logged_on as string,
    amountKcal: r.amount_kcal as number,
    loggedAt: new Date(r.logged_at as string).getTime(),
  }));
}

export async function deleteCalorieLogEntryRemote(id: string): Promise<void> {
  try {
    requireUserId();
    const { error } = await supabase.from('calorie_log').delete().eq('id', id);
    if (error) throw error;
  } catch {
    await enqueuePendingSync('calorieLog', id, 'delete');
  }
}

// Wipes every Life-tab row this account owns, server side. Used by
// clearAllData() — which, despite its name, used to leave all of this
// behind. Deliberately NOT queued through pendingSync on failure: a queued
// "delete everything" that fires later, after the user has started logging
// again, would destroy data they added in the meantime. Throwing lets the
// caller tell the user it didn't work so they can retry deliberately.
export async function deleteAllBodyDataRemote(): Promise<void> {
  const userId = requireUserId();
  const results = await Promise.all([
    supabase.from('body_log').delete().eq('user_id', userId),
    supabase.from('water_log').delete().eq('user_id', userId),
    supabase.from('calorie_log').delete().eq('user_id', userId),
    supabase.from('body_profile').delete().eq('user_id', userId),
  ]);
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;
}

export async function flushBodyPendingSync(entry: { table: string; rowId: string; op: 'upsert' | 'delete'; id?: number }): Promise<void> {
  if (entry.op === 'delete') {
    if (entry.table === 'calorieLog') await deleteCalorieLogEntryRemote(entry.rowId);
    else if (entry.table === 'waterLog') await deleteWaterLogEntryRemote(entry.rowId);
    return;
  }
  if (entry.table === 'bodyProfile') {
    const record = await db.bodyProfile.get('current');
    if (record) {
      const { id: _id, ...profile } = record as BodyProfileRecord;
      void _id;
      await pushBodyProfile(profile);
    }
  } else if (entry.table === 'bodyLog') {
    const logEntry = await db.bodyLog.get(entry.rowId);
    if (logEntry) await pushBodyLogEntry(logEntry);
  } else if (entry.table === 'waterLog') {
    const waterEntry = await db.waterLog.get(entry.rowId);
    if (waterEntry) await pushWaterLogEntry(waterEntry);
  } else if (entry.table === 'calorieLog') {
    const calorieEntry = await db.calorieLog.get(entry.rowId);
    if (calorieEntry) await pushCalorieLogEntry(calorieEntry);
  }
}
