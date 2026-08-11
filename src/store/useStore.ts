import { create } from 'zustand';
import { db, remapLegacyIdsToUuid, purgeDemoFriendRows, DEFAULT_BODY_PROFILE } from '../lib/db';
import { applyTheme, loadSettings, saveSettings, sanitizeSettings, DEFAULT_SETTINGS, type Settings } from '../lib/settings';
import { randomQuote } from '../lib/quotes';
import * as cloudSync from '../lib/cloudSync';
import * as friendsApi from '../lib/friends';
import type { Friend, FriendRequest } from '../lib/friends';
import * as bodySync from '../lib/bodySync';
import { onSignedOut, getCurrentUserId } from '../lib/supabase';
import { signOut } from '../lib/auth';
import { looksLikeHevyCsv, convertHevyCsv } from '../lib/hevyImport';
import { exerciseById, findExerciseByName, isCardioExercise, newCustomExerciseId, setCustomExercises } from '../lib/exercises';
import * as customExercisesApi from '../lib/customExercises';
import * as reactionsApi from '../lib/reactions';
import { REACTION_GLYPH } from '../lib/reactions';
import type { Reaction, ReactionCode } from '../lib/reactions';
import { disarmNudge } from '../lib/pushNudges';
import { liveRecordForSet, sortRoutines, type LiveRecord } from '../lib/records';
import { unlockAudio } from '../lib/beep';
import { vibrate } from '../lib/haptics';
import { prefersReducedMotion } from '../lib/useReducedMotion';
import { BADGE_BY_ID, computeEarnedBadges, type BadgeContext, type BadgeDef } from '../lib/badges';
import { todayIso } from '../lib/bodyMetrics';
import type { Person } from '../lib/types';
import type { ActiveSession, BodyLogEntry, BodyProfile, CalorieLogEntry, CustomExercise, CustomExerciseDraft, RestTimerState, Routine, SessionEntry, SetEntry, SetKind, WaterLogEntry, WorkoutSession } from '../lib/types';

export type Tab = 'home' | 'train' | 'stats' | 'life' | 'you';
export type SheetKind =
  | 'picker'
  | 'detail'
  | 'workout'
  | 'routineActions'
  | 'settings'
  | 'friends'
  | 'importPreview'
  | 'weightDetail'
  | 'hydrationDetail'
  | 'nutritionDetail'
  | 'macrosDetail'
  | 'strengthDetail'
  | 'profileDetail'
  | 'bodyCompositionDetail'
  | 'badges'
  | 'customExercise'
  | 'reactors'
  | null;

export interface ImportPreview {
  routines: Routine[];
  sessions: WorkoutSession[];
  unmatchedNames: string[];
  isCsv: boolean;
  settingsPatch?: Partial<Settings>;
  // Life-tab data carried by a full FitFlow JSON backup (never by a Hevy
  // CSV). Restored on confirm so "Export data" is a complete backup, not
  // just routines/sessions.
  bodyProfile?: BodyProfile;
  bodyLog?: BodyLogEntry[];
  waterLog?: WaterLogEntry[];
  calorieLog?: CalorieLogEntry[];
}

// Apply the persisted theme immediately on load, before the first paint.
applyTheme(loadSettings());

// Bounds for a hand-corrected workout length. The floor matches what
// finishSession() rounds up to, and the ceiling exists because this field is
// edited precisely to undo an implausible number — there's no point letting
// a typo replace one with another.
// How many recent workouts (own + friends', newest first) reactions are
// fetched for. Comfortably covers the crew feed's scroll window and any
// workout reachable from history without pulling the whole table.
const REACTION_SESSION_WINDOW = 120;

// A short tick on tapping a reaction — the same "something registered"
// feedback completing a set gives, at a lighter weight.
const REACTION_TAP_PATTERN = 12;

export const MIN_DURATION_MIN = 1;
export const MAX_DURATION_MIN = 24 * 60;

export interface FinishResult {
  sessionId: string;
  entries: SessionEntry[];
  durationMin: number;
  name: string;
  exerciseIds: string[];
  newRoutine: boolean;
  routineId: string | null;
  routineChanged: boolean;
}

interface DialogState {
  message: string;
  yesLabel: string;
  cancelLabel: string;
  danger: boolean;
  onYes: () => void;
}

function defaultRestTimersFor(exerciseIds: string[], defaultRestSeconds: number | null): Record<string, number> {
  if (defaultRestSeconds === null) return {};
  const map: Record<string, number> = {};
  exerciseIds.forEach((id) => {
    map[id] = defaultRestSeconds;
  });
  return map;
}

// What a freshly-added set should be pre-filled with.
//
// The most recently *completed* set, not simply the last row. When an
// exercise you've done before pre-fills several rows from last time, editing
// row 1 to what you actually lifted and then hitting "+ Add set" should carry
// that forward — copying the trailing row instead would hand back a stale
// value from the previous session and read as "it didn't remember".
//
// With no completed set yet, the last row is the best guess. With no rows at
// all (an exercise never logged before, which startingSetsFor deliberately
// leaves empty) it stays blank rather than inventing a weight — there's
// nothing to base a guess on, and a wrong pre-fill is worse than none.
function setToCopyForNewSet(sets: SetEntry[]): {
  reps: number;
  weight: number;
  durationSec: number | undefined;
  distanceKm: number | undefined;
} {
  const source = [...sets].reverse().find((s) => s.done) ?? sets[sets.length - 1];
  if (!source) return { reps: 0, weight: 0, durationSec: undefined, distanceKm: undefined };
  return { reps: source.reps, weight: source.weight, durationSec: source.durationSec, distanceKm: source.distanceKm };
}

function startingSetsFor(sessions: WorkoutSession[], exerciseId: string) {
  const prior = sessions
    .filter((h) => h.person === 'You' && h.entries.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => b.startedAt - a.startedAt)[0];
  const entry = prior?.entries.find((e) => e.exerciseId === exerciseId);
  if (entry && entry.sets.length > 0) {
    return entry.sets.map((s) => ({
      reps: s.reps,
      weight: s.weight,
      durationSec: s.durationSec,
      distanceKm: s.distanceKm,
      done: false,
      kind: 'normal' as SetKind,
    }));
  }
  // No history for this exercise — start with zero rows; the user adds sets manually.
  return [];
}

export interface StoreState {
  // data
  loaded: boolean;
  routines: Routine[];
  sessions: WorkoutSession[];

  // navigation
  tab: Tab;
  mode: 'tabs' | 'session' | 'finish';

  // Non-null only while the minimise/restore morph is playing — drives the
  // shrink-to-bar / grow-from-bar animation (see App.tsx).
  sessionMorph: 'minimizing' | 'restoring' | null;

  // active session
  active: ActiveSession | null;
  finishResult: FinishResult | null;
  restTimer: RestTimerState | null;

  // sheets
  sheet: SheetKind;
  detailExerciseId: string | null;
  detailReturnToPicker: boolean;
  viewingSessionId: string | null;
  viewingRoutineId: string | null;
  // Lives in the store rather than local component state — adding an
  // exercise while editing a past workout replaces WorkoutDetailSheet with
  // the picker sheet (only one sheet renders at a time) and back again,
  // which would otherwise silently drop back to read-only on remount.
  historyEditing: boolean;
  pickQuery: string;
  pickBodyPart: string;
  importPreview: ImportPreview | null;
  // True while importData() is reading/parsing the selected file — the CSV
  // path in particular runs an O(rows × exercises) fuzzy match that can take
  // a visible moment on a large export, with no other UI feedback otherwise.
  importing: boolean;
  pickSelected: Set<string>;
  // Non-null while the picker was opened from a past workout being edited
  // (openPickerForHistory) rather than from an in-progress session — tells
  // addExercisesToSession() which one to add the selection to.
  pickerTargetSessionId: string | null;
  // Non-null when the custom-exercise sheet is editing an existing entry
  // rather than creating a new one.
  editingCustomExerciseId: string | null;
  // Which sheet the custom-exercise form was opened from, so backing out of
  // it (swipe, scrim, Escape, Cancel) returns there instead of closing
  // everything — same problem detailReturnToPicker solves for the detail
  // sheet, but the form is reachable from two places, so it stores which.
  customExerciseReturnTo: SheetKind;

  // dialog + toast
  dialog: DialogState | null;
  toastMsg: string;

  // settings
  settings: Settings;

  // home page — picked once per app load, not per tab visit
  quote: string;

  // friends — server-derived, never cached in Dexie
  friends: Friend[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  friendsLoaded: boolean;
  friendSessions: WorkoutSession[];
  // profileId → their <=3 showcase badge ids (friend-readable, best-effort;
  // empty/missing → fall back to badges derived from their session history).
  friendShowcase: Map<string, string[]>;

  // Achievements. `badgeCelebration` holds the badges just unlocked this
  // moment (drives the one-time celebration overlay); `viewingBadgesPerson`
  // is whose collection the badges sheet is showing ('You' or a friend label).
  badgeCelebration: BadgeDef[] | null;
  viewingBadgesPerson: Person;

  // The in-session "new personal record" celebration. `line` picks which of
  // the four rotating headline pairs to show (chosen once at fire time so it
  // doesn't reshuffle on re-render).
  prCelebration: (LiveRecord & { line: number }) | null;

  // Life tab — body measurements, nutrition, hydration. Strictly private:
  // never shared with friends, never in the crew feed or Stats head-to-head.
  bodyProfile: BodyProfile;
  bodyLog: BodyLogEntry[];
  waterLog: WaterLogEntry[];
  calorieLog: CalorieLogEntry[];
  bodyLoaded: boolean;

  // actions
  init(): Promise<void>;
  go(tab: Tab): void;

  startSession(routineId: string | null): void;
  setSessionName(name: string): void;
  setVal(entryIdx: number, setIdx: number, field: 'reps' | 'weight' | 'durationSec' | 'distanceKm', value: number): void;
  toggleSet(entryIdx: number, setIdx: number): void;
  addSet(entryIdx: number): void;
  removeSet(entryIdx: number, setIdx: number): void;
  setSetKind(entryIdx: number, setIdx: number, kind: SetKind): void;
  applyDropSet(entryIdx: number, setIdx: number, rounds: number): void;
  removeExercise(entryIdx: number): void;
  pairSuperset(exerciseId: string, partnerId: string): void;
  unpairSuperset(exerciseId: string): void;
  reorderEntries(order: number[]): void;
  addExerciseToSession(exerciseId: string): void;
  addExercisesToSession(exerciseIds: string[]): void;
  setRestDuration(exerciseId: string, seconds: number | null): void;
  adjustRestTimer(deltaSeconds: number): void;
  skipRestTimer(): void;
  minimizeSession(): void;
  restoreSession(): void;
  cancelSession(): void;
  finishSession(): void;
  saveRoutineFromFinish(name: string, exerciseIds: string[]): void;
  updateRoutineExercises(routineId: string, exerciseIds: string[]): void;

  openPicker(): void;
  openDetail(id: string): void;
  openDetailFromPicker(id: string): void;
  openWorkoutSheet(id: string): void;
  openRoutineActions(id: string): void;
  renameRoutine(id: string, name: string): void;
  deleteRoutine(id: string): void;
  duplicateRoutine(id: string): void;
  reorderRoutines(order: number[]): void;
  closeSheet(): void;
  setPickQuery(q: string): void;
  setPickBodyPart(bp: string): void;
  togglePickSelected(id: string): void;

  // Reactions on workouts, keyed by session id. In memory only: they hang
  // off sessions that are often somebody else's, and friend sessions never
  // reach Dexie either.
  reactions: Map<string, Reaction[]>;
  // Which workout the reactor-list sheet is showing.
  reactorListSessionId: string | null;
  refreshReactions(): Promise<void>;
  toggleReaction(sessionId: string, code: ReactionCode): void;
  openReactorList(sessionId: string): void;

  // Shared global exercise library (see lib/customExercises.ts).
  customExercises: CustomExercise[];
  // True when the signed-in user is in the app_admins allowlist, which lets
  // them archive exercises they didn't author. Server-enforced regardless;
  // this only drives whether the UI offers the action.
  isLibraryAdmin: boolean;
  refreshCustomExercises(): Promise<void>;
  openCustomExerciseForm(editId?: string, prefillName?: string): void;
  saveCustomExercise(draft: CustomExerciseDraft): Promise<void>;
  archiveCustomExercise(id: string): void;

  confirm(message: string, yesLabel: string, onYes: () => void, danger?: boolean, cancelLabel?: string): void;
  resolveDialog(yes: boolean): void;

  showToast(message: string): void;

  copyWorkoutToRoutines(sessionId: string): void;
  repeatWorkout(sessionId: string): void;
  setHistoryEditing(v: boolean): void;
  updateSessionDuration(sessionId: string, minutes: number): void;
  updateHistorySet(sessionId: string, entryIdx: number, setIdx: number, field: 'reps' | 'weight' | 'durationSec' | 'distanceKm', value: number): void;
  addHistorySet(sessionId: string, entryIdx: number): void;
  removeHistorySet(sessionId: string, entryIdx: number, setIdx: number): void;
  openPickerForHistory(sessionId: string): void;
  removeHistoryExercise(sessionId: string, entryIdx: number): void;
  deleteSession(sessionId: string): void;

  openSettings(): void;
  openWeightDetail(): void;
  openHydrationDetail(): void;
  openNutritionDetail(): void;
  openMacrosDetail(): void;
  openStrengthDetail(): void;
  openProfileDetail(): void;
  openBodyCompositionDetail(): void;
  updateSettings(patch: Partial<Settings>): void;
  exportData(): void;
  importData(file: File): void;
  confirmImport(mode: 'replace' | 'merge'): void;
  cancelImportPreview(): void;
  clearAllData(): void;
  deleteAccount(): void;

  syncWithCloud(userId: string): Promise<void>;

  openFriends(): void;
  refreshFriends(): Promise<void>;
  refreshFriendSessions(): Promise<void>;
  refreshFriendShowcase(): Promise<void>;

  openBadges(person?: Person): void;
  dismissBadgeCelebration(): void;
  dismissPrCelebration(): void;
  setShowcaseBadges(ids: string[]): void;
  toggleShowcaseBadge(id: string): 'added' | 'removed' | 'full';
  markFirstComparison(): void;
  sendFriendRequest(
    email: string,
  ): Promise<(friendsApi.SendFriendRequestResult & { profileId?: string }) | { ok: false; reason: 'not-found'; profileId?: undefined }>;
  sendFriendRequestToProfile(profileId: string): Promise<friendsApi.SendFriendRequestResult>;
  acceptFriendRequest(friendshipId: string): Promise<void>;
  declineFriendRequest(friendshipId: string): Promise<void>;
  removeFriend(friendshipId: string, pending?: boolean): void;

  refreshBody(): Promise<void>;
  saveBodyProfile(patch: Partial<BodyProfile>): void;
  logBodyMetrics(patch: Partial<BodyLogEntry> & { loggedOn: string }): void;
  addWater(ml: number): void;
  clearWaterToday(): void;
  deleteWaterEntry(id: string): void;
  addCalories(kcal: number): void;
  clearCaloriesToday(): void;
  deleteCalorieEntry(id: string): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let cloudSyncUserId: string | null = null;
let morphTimer: ReturnType<typeof setTimeout> | undefined;

// Duration of the minimise/restore morph. Kept short — this happens many
// times in a workout, so it has to stay snappy. Must match the
// sessionShrink/sessionGrow animation durations in index.css.
export const SESSION_MORPH_MS = 200;

// Guards a JSON backup import against malformed items — the top-level
// array check alone (routines/sessions being arrays at all) doesn't catch a
// hand-edited or truncated file whose *items* are missing fields, which
// would otherwise crash later when the preview/import path reads
// r.exerciseIds.length or iterates s.entries.
function isValidSetEntry(v: unknown): v is SetEntry {
  if (!v || typeof v !== 'object') return false;
  const x = v as Record<string, unknown>;
  return typeof x.reps === 'number' && typeof x.weight === 'number' && typeof x.done === 'boolean';
}

function isValidSessionEntry(v: unknown): v is SessionEntry {
  if (!v || typeof v !== 'object') return false;
  const x = v as Record<string, unknown>;
  return typeof x.exerciseId === 'string' && Array.isArray(x.sets) && x.sets.every(isValidSetEntry);
}

function isValidImportedRoutine(v: unknown): v is Routine {
  if (!v || typeof v !== 'object') return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    typeof x.createdAt === 'number' &&
    Array.isArray(x.exerciseIds) &&
    x.exerciseIds.every((e) => typeof e === 'string')
  );
}

function isValidImportedSession(v: unknown): v is WorkoutSession {
  if (!v || typeof v !== 'object') return false;
  const x = v as Record<string, unknown>;
  return (
    typeof x.id === 'string' &&
    typeof x.person === 'string' &&
    typeof x.name === 'string' &&
    (x.routineId === null || typeof x.routineId === 'string') &&
    typeof x.startedAt === 'number' &&
    typeof x.durationMin === 'number' &&
    Array.isArray(x.entries) &&
    x.entries.every(isValidSessionEntry)
  );
}

// Shared by both import paths (FitFlow JSON backup and Hevy CSV) — remaps
// legacy/placeholder ids to real UUIDs before anything reaches Dexie or
// Supabase, and merges in any imported settings without clobbering the rest.
function prepareImportedData(
  currentSettings: Settings,
  routines: Routine[],
  sessions: WorkoutSession[],
  settingsPatch?: Partial<Settings>,
) {
  // A backup/import only ever legitimately contains your own data — filtering
  // here guards against a stray `person` value colliding with a real friend's
  // current display label and silently blending into their stats.
  const ownSessionsOnly = sessions.filter((s) => s.person === 'You');
  const remapped = remapLegacyIdsToUuid(routines, ownSessionsOnly);
  const settings = settingsPatch ? sanitizeSettings({ ...currentSettings, ...settingsPatch }) : currentSettings;
  return { ...remapped, settings };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Folds freshly-imported routines/sessions into what's already stored instead
// of wiping it. FitFlow backup ids are stable, portable UUIDs that match the
// live record's own id directly, so those dedup by id. Hevy CSV ids are just
// positional placeholders regenerated fresh on every parse (see
// convertHevyCsv) and never mean anything across separate imports, so those
// dedup by name/start-time instead — the closest thing to a stable identity
// a CSV export actually has.
function mergeImportedData(
  existingRoutines: Routine[],
  existingSessions: WorkoutSession[],
  importRoutines: Routine[],
  importSessions: WorkoutSession[],
  isCsv: boolean,
): { routines: Routine[]; sessions: WorkoutSession[]; touchedRoutines: Routine[]; touchedSessions: WorkoutSession[] } {
  const routines = [...existingRoutines];
  const idMap = new Map<string, string>();
  const touchedRoutines: Routine[] = [];
  for (const r of importRoutines) {
    const matchIdx = isCsv ? routines.findIndex((er) => er.name === r.name) : routines.findIndex((er) => er.id === r.id);
    const finalId = matchIdx >= 0 ? routines[matchIdx].id : isCsv || !UUID_RE.test(r.id) ? crypto.randomUUID() : r.id;
    idMap.set(r.id, finalId);
    const merged = { ...r, id: finalId };
    if (matchIdx >= 0) routines[matchIdx] = merged;
    else routines.push(merged);
    touchedRoutines.push(merged);
  }

  const sessions = [...existingSessions];
  const touchedSessions: WorkoutSession[] = [];
  for (const s of importSessions) {
    const matchIdx = isCsv
      ? sessions.findIndex((es) => es.person === 'You' && es.name === s.name && es.startedAt === s.startedAt)
      : sessions.findIndex((es) => es.id === s.id);
    const finalId = matchIdx >= 0 ? sessions[matchIdx].id : isCsv || !UUID_RE.test(s.id) ? crypto.randomUUID() : s.id;
    const merged: WorkoutSession = {
      ...s,
      id: finalId,
      routineId: s.routineId ? (idMap.get(s.routineId) ?? s.routineId) : null,
    };
    if (matchIdx >= 0) sessions[matchIdx] = merged;
    else sessions.push(merged);
    touchedSessions.push(merged);
  }

  return { routines, sessions, touchedRoutines, touchedSessions };
}

// Restores the Life-tab data carried by a full FitFlow JSON backup into
// Dexie + cloud (per-entry pushes retry via pendingSync on failure, same as
// routines/sessions) and returns the new in-memory arrays for the caller to
// set into state. Returns null when the backup carried no body data (e.g. a
// Hevy CSV, or a backup made before this was included). Replace mode swaps
// the stored data out entirely; merge mode upserts by key (bodyLog by day,
// water/calorie by id).
function persistImportedBodyData(
  mode: 'merge' | 'replace',
  current: { bodyProfile: BodyProfile; bodyLog: BodyLogEntry[]; waterLog: WaterLogEntry[]; calorieLog: CalorieLogEntry[] },
  imported: Pick<ImportPreview, 'bodyProfile' | 'bodyLog' | 'waterLog' | 'calorieLog'>,
): { bodyProfile: BodyProfile; bodyLog: BodyLogEntry[]; waterLog: WaterLogEntry[]; calorieLog: CalorieLogEntry[] } | null {
  if (!imported.bodyProfile && !imported.bodyLog && !imported.waterLog && !imported.calorieLog) return null;
  const replace = mode === 'replace';
  const bodyProfile = imported.bodyProfile ?? current.bodyProfile;
  const mergeById = <T extends { id: string }>(cur: T[], imp: T[]): T[] => {
    if (replace) return imp;
    const map = new Map(cur.map((x) => [x.id, x]));
    imp.forEach((x) => map.set(x.id, x));
    return [...map.values()];
  };
  const bodyLog = imported.bodyLog
    ? replace
      ? imported.bodyLog
      : (() => {
          const map = new Map(current.bodyLog.map((x) => [x.loggedOn, x]));
          imported.bodyLog.forEach((x) => map.set(x.loggedOn, x));
          return [...map.values()];
        })()
    : current.bodyLog;
  const waterLog = imported.waterLog ? mergeById(current.waterLog, imported.waterLog) : current.waterLog;
  const calorieLog = imported.calorieLog ? mergeById(current.calorieLog, imported.calorieLog) : current.calorieLog;

  if (imported.bodyProfile) {
    void db.bodyProfile.put({ id: 'current', ...bodyProfile });
    void bodySync.pushBodyProfile(bodyProfile);
  }
  if (imported.bodyLog) {
    void (replace ? db.bodyLog.clear().then(() => db.bodyLog.bulkPut(bodyLog)) : db.bodyLog.bulkPut(bodyLog));
    void Promise.all(imported.bodyLog.map((e) => bodySync.pushBodyLogEntry(e)));
  }
  if (imported.waterLog) {
    void (replace ? db.waterLog.clear().then(() => db.waterLog.bulkPut(waterLog)) : db.waterLog.bulkPut(waterLog));
    void Promise.all(imported.waterLog.map((e) => bodySync.pushWaterLogEntry(e)));
  }
  if (imported.calorieLog) {
    void (replace ? db.calorieLog.clear().then(() => db.calorieLog.bulkPut(calorieLog)) : db.calorieLog.bulkPut(calorieLog));
    void Promise.all(imported.calorieLog.map((e) => bodySync.pushCalorieLogEntry(e)));
  }
  return { bodyProfile, bodyLog, waterLog, calorieLog };
}

// Builds the badge-computation context for the signed-in user from current
// store state (own routines and the two Social signals are only available for
// 'You'). `extraSession` lets an in-progress workout be evaluated as if it were
// already finished, so achievements can celebrate the moment they're earned
// mid-session — not only at the finish screen.
function ownBadgeContext(s: StoreState, firstFriendAt: number | null, now: number, extraSession?: WorkoutSession): BadgeContext {
  return {
    sessions: extraSession ? [...s.sessions, extraSession] : s.sessions,
    person: 'You',
    routines: s.routines,
    weekStart: s.settings.weekStart,
    now,
    social: {
      hasFriend: s.friends.length > 0,
      firstFriendAt,
      firstComparisonAt: s.settings.firstComparisonAt ?? null,
      firstReactionGivenAt: s.settings.firstReactionGivenAt ?? null,
      firstReactionReceivedAt: s.settings.firstReactionReceivedAt ?? null,
    },
  };
}

// The in-progress workout as it would look if finished right now (only its
// checked-off sets), or null if nothing's been logged yet. Used to celebrate
// achievements mid-session.
function activeAsFinishedSession(active: ActiveSession | null): WorkoutSession | null {
  if (!active) return null;
  const entries = active.entries.map((e) => ({ ...e, sets: e.sets.filter((sset) => sset.done) })).filter((e) => e.sets.length > 0);
  if (entries.length === 0) return null;
  return {
    id: '__active__',
    person: 'You',
    name: active.name || 'Workout',
    routineId: active.routineId,
    startedAt: active.startedAt,
    durationMin: Math.max(1, Math.round((Date.now() - active.startedAt) / 60000)),
    entries,
  };
}

// Recomputes the signed-in user's earned badges and folds any not-yet-known
// ones into settings.badgesKnown (so each celebrates at most once). When
// `celebrate` is true, newly-earned badges also trigger the celebration
// overlay — but never on the very first baseline (badgesKnown undefined),
// which quietly credits all of a user's pre-existing history the day this
// ships. Passive callers (init, friend refresh) pass celebrate=false: they
// keep the known set in sync without ever popping a celebration for something
// earned before the app was looking.
function reconcileOwnBadges(
  get: () => StoreState,
  set: (partial: Partial<StoreState>) => void,
  celebrate: boolean,
  extraSession?: WorkoutSession,
): void {
  const s = get();
  const now = Date.now();
  let firstFriendAt = s.settings.firstFriendAt ?? null;
  if (s.friends.length > 0 && firstFriendAt == null) firstFriendAt = now;

  const earned = computeEarnedBadges(ownBadgeContext(s, firstFriendAt, now, extraSession));
  const isFirstBaseline = s.settings.badgesKnown === undefined;
  const known = new Set(s.settings.badgesKnown ?? []);
  const newlyEarned: BadgeDef[] = [];
  earned.forEach((_ts, id) => {
    if (!known.has(id)) {
      known.add(id);
      const def = BADGE_BY_ID.get(id);
      if (def) newlyEarned.push(def);
    }
  });

  const grew = known.size !== (s.settings.badgesKnown?.length ?? -1);
  const friendChanged = firstFriendAt !== (s.settings.firstFriendAt ?? null);
  if (grew || friendChanged) {
    get().updateSettings({ badgesKnown: [...known], firstFriendAt });
  }

  if (celebrate && !isFirstBaseline && newlyEarned.length > 0) {
    newlyEarned.sort((a, b) => (earned.get(a.id) ?? 0) - (earned.get(b.id) ?? 0));
    set({ badgeCelebration: newlyEarned });
  }
}

// Merges the account's cloud settings onto local without losing badge state.
// `badgesKnown` is cumulative "already celebrated" state — it must be UNIONed,
// never replaced, or adopting a cloud blob written by a client that lacks the
// field (older version, or a first-run race) would reset it to undefined and
// make every subsequent finish silently re-baseline instead of celebrating.
// The two Social timestamps take the earliest known value; showcase picks are
// a synced user choice so the cloud wins when it has them.
function mergeCloudSettings(local: Settings, remote: Settings): Settings {
  const localKnown = local.badgesKnown;
  const remoteKnown = remote.badgesKnown;
  const badgesKnown = localKnown || remoteKnown ? [...new Set([...(localKnown ?? []), ...(remoteKnown ?? [])])] : undefined;
  const earliest = (a?: number | null, b?: number | null): number | null => {
    const vals = [a, b].filter((v): v is number => typeof v === 'number');
    return vals.length ? Math.min(...vals) : null;
  };
  return sanitizeSettings({
    ...remote,
    badgesKnown,
    showcaseBadges: remote.showcaseBadges ?? local.showcaseBadges,
    firstComparisonAt: earliest(local.firstComparisonAt, remote.firstComparisonAt),
    firstFriendAt: earliest(local.firstFriendAt, remote.firstFriendAt),
  });
}

// Drops any badge from `badgesKnown` that isn't actually earned from finished
// history — used after discarding a workout, so a badge that celebrated
// mid-session (against the in-progress workout) but wasn't truly earned can
// celebrate again for real next time.
function pruneBadgesKnownToEarned(get: () => StoreState): void {
  const s = get();
  const known = s.settings.badgesKnown;
  if (!known || known.length === 0) return;
  const earned = computeEarnedBadges(ownBadgeContext(s, s.settings.firstFriendAt ?? null, Date.now()));
  const pruned = known.filter((id) => earned.has(id));
  if (pruned.length !== known.length) get().updateSettings({ badgesKnown: pruned });
}

// Tells the user about reactions that landed on their own workouts since
// they were last told. There's no realtime subscription — reactions arrive
// on a poll or when you open Home — so without this they appear silently and
// you only notice by chance.
//
// "Since last told" is one synced timestamp rather than a set of seen ids:
// it stays a single number however many reactions accumulate, and being
// notified on the phone means the tablet won't repeat it.
function announceNewReactions(get: () => StoreState, rows: Reaction[]): void {
  const me = getCurrentUserId();
  if (!me) return;
  const ownSessions = new Map(get().sessions.map((s) => [s.id, s]));
  const fromOthers = rows.filter((r) => r.userId !== me && ownSessions.has(r.sessionId));
  if (fromOthers.length === 0) return;

  const newest = Math.max(...fromOthers.map((r) => r.createdAt));
  const seenAt = get().settings.reactionsSeenAt;

  // First run on this account: adopt the current state as the baseline
  // rather than announcing a backlog of reactions the user has very likely
  // already seen. Same reasoning as the badge system's first-run credit.
  if (seenAt == null) {
    get().updateSettings({ reactionsSeenAt: newest });
    return;
  }

  const fresh = fromOthers.filter((r) => r.createdAt > seenAt);
  if (fresh.length === 0) return;

  // Named and specific when there's exactly one, because that's the version
  // worth reading; a count once there are several, since a toast can't
  // usefully list them.
  let message: string;
  if (fresh.length === 1) {
    const [r] = fresh;
    const name = ownSessions.get(r.sessionId)?.name ?? 'your workout';
    message = `${REACTION_GLYPH[r.code]} ${r.name} reacted to ${name}`;
  } else {
    message = `${fresh.length} new reactions on your workouts`;
  }
  get().updateSettings({ reactionsSeenAt: newest });
  get().showToast(message);
}

export const useStore = create<StoreState>((set, get) => ({
  loaded: false,
  routines: [],
  sessions: [],

  tab: 'home',
  mode: 'tabs',
  sessionMorph: null,
  active: null,
  finishResult: null,
  restTimer: null,

  sheet: null,
  detailExerciseId: null,
  detailReturnToPicker: false,
  viewingSessionId: null,
  viewingRoutineId: null,
  historyEditing: false,
  pickQuery: '',
  pickBodyPart: 'all',
  pickSelected: new Set(),
  pickerTargetSessionId: null,
  editingCustomExerciseId: null,
  customExerciseReturnTo: null,
  importPreview: null,
  importing: false,
  customExercises: [],
  isLibraryAdmin: false,
  reactions: new Map(),
  reactorListSessionId: null,

  dialog: null,
  toastMsg: '',

  settings: loadSettings(),
  quote: randomQuote(),

  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  friendsLoaded: false,
  friendSessions: [],
  friendShowcase: new Map(),

  badgeCelebration: null,
  viewingBadgesPerson: 'You',
  prCelebration: null,

  bodyProfile: DEFAULT_BODY_PROFILE,
  bodyLog: [],
  waterLog: [],
  calorieLog: [],
  bodyLoaded: false,

  async init() {
    // Reset synchronously (not just on first load) so a re-mount after switching
    // accounts can't leave syncWithCloud reading stale in-memory data from
    // whoever was signed in before, while this reload is still in flight.
    set({ tab: get().settings.defaultTab, loaded: false, routines: [], sessions: [] });
    try {
      await purgeDemoFriendRows();
      const [routines, sessions, activeRecord, bodyProfileRecord, bodyLog, waterLog, calorieLog, customExercises] = await Promise.all([
        db.routines.toArray(),
        db.sessions.toArray(),
        db.activeSession.get('current'),
        db.bodyProfile.get('current'),
        db.bodyLog.toArray(),
        db.waterLog.toArray(),
        db.calorieLog.toArray(),
        db.customExercises.toArray(),
      ]);
      // Seed the synchronous exerciseById() registry from the local cache
      // before anything renders, so custom exercises already referenced by
      // this device's history resolve on the very first paint rather than
      // popping in once refreshCustomExercises() returns from the network.
      setCustomExercises(customExercises);
      set({ customExercises });
      let bodyProfile = DEFAULT_BODY_PROFILE;
      if (bodyProfileRecord) {
        const { id: _bodyProfileId, ...rest } = bodyProfileRecord;
        void _bodyProfileId;
        bodyProfile = rest;
      }
      if (activeRecord) {
        // A workout was still in progress when this device last closed —
        // restore it and land straight on it, instead of losing it the
        // moment the OS (iOS especially) fully evicts a backgrounded PWA.
        const { id: _id, ...active } = activeRecord;
        set({ routines, sessions, loaded: true, active, mode: 'session', bodyProfile, bodyLog, waterLog, calorieLog });
      } else {
        set({ routines, sessions, loaded: true, bodyProfile, bodyLog, waterLog, calorieLog });
      }
      // Credit badges earned by existing history quietly on first run — no
      // flood of celebrations for milestones passed before this shipped.
      reconcileOwnBadges(get, set, false);
    } catch (err) {
      // IndexedDB unavailable (private browsing, restrictive webview, etc.) —
      // fall back to an empty in-memory session so the app still works, just without persistence.
      console.error('Local storage unavailable, falling back to in-memory data', err);
      set({ routines: [], sessions: [], loaded: true });
    }
  },

  go(tab) {
    set({ tab, mode: 'tabs', finishResult: null });
    // The crew feed lives here and there's no realtime subscription, so
    // arriving on Home is the natural moment to go and look. Anything that
    // landed on your own workouts since you last saw it gets announced by
    // announceNewReactions.
    if (tab === 'home') void get().refreshReactions();
  },

  startSession(routineId) {
    const doStart = () => {
      const routine = routineId ? get().routines.find((r) => r.id === routineId) : null;
      const exerciseIds = routine ? routine.exerciseIds : [];
      const active: ActiveSession = {
        routineId,
        name: routine ? routine.name : 'New routine',
        startedAt: Date.now(),
        entries: exerciseIds.map((exerciseId) => ({ exerciseId, sets: startingSetsFor(get().sessions, exerciseId) })),
        restTimers: defaultRestTimersFor(exerciseIds, get().settings.defaultRestSeconds),
      };
      set({ active, mode: 'session', restTimer: null });
      if (!routine) get().openPicker();
    };
    if (get().active) {
      get().confirm('You already have a workout in progress. Discard it and start a new one?', 'Start new', () => {
        set({ active: null });
        doStart();
      }, true);
      return;
    }
    doStart();
  },

  setSessionName(name) {
    const active = get().active;
    if (!active) return;
    set({ active: { ...active, name } });
  },

  setVal(entryIdx, setIdx, field, value) {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const sets = e.sets.map((s, si) => (si === setIdx ? { ...s, [field]: Math.max(0, value) } : s));
      return { ...e, sets };
    });
    set({ active: { ...active, entries } });
  },

  toggleSet(entryIdx, setIdx) {
    const active = get().active;
    if (!active) return;
    const entry = active.entries[entryIdx];
    const target = entry?.sets[setIdx];
    if (!target) return;
    const turningOn = !target.done;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const sets = e.sets.map((s, si) => (si === setIdx ? { ...s, done: !s.done } : s));
      return { ...e, sets };
    });
    if (turningOn && get().settings.hapticsOnSetComplete) vibrate(15);
    // Checking off a set is a real user gesture, and it's the same tap that
    // starts the rest timer — the one chance to take the AudioContext out of
    // the suspended state iOS creates it in. Without this the timer's own
    // beep, fired from a setTimeout callback, is inaudible on iPhone.
    if (turningOn && get().settings.restTimerSound) unlockAudio();
    // Supersetted exercises share one rest boundary — in strict alternation
    // (A set, then straight into B's matching set) finishing A's set
    // shouldn't start a timer while B's matching set is still pending; only
    // the set that finishes the pair for that round starts the shared
    // countdown. But some people do all of one exercise's sets before the
    // other's ("grouping"); there the partner falls behind, and suppressing
    // every time would mean no timer ever fires. So only suppress when the
    // partner is *keeping pace* (has done at least as many sets as this
    // exercise had before this one) — i.e. genuine alternation. entry is the
    // pre-toggle state, and set `setIdx` is still not-done there, so
    // counting its done sets gives this exercise's count before this one.
    const partner = entry.supersetWith ? active.entries.find((e) => e.exerciseId === entry.supersetWith) : undefined;
    const partnerSet = partner?.sets[setIdx];
    const xDoneBefore = entry.sets.filter((s) => s.done).length;
    const partnerDone = partner ? partner.sets.filter((s) => s.done).length : 0;
    const suppressForSuperset = !!partnerSet && !partnerSet.done && partnerDone >= xDoneBefore;
    const restSeconds =
      turningOn && !suppressForSuperset
        ? (active.restTimers[entry.exerciseId] ?? (partner ? active.restTimers[partner.exerciseId] : undefined))
        : undefined;
    // A different exercise's rest timer already counting down would
    // otherwise get silently overwritten (only one restTimer can be shown
    // at a time) — supersetting between exercises made this easy to trigger
    // by accident, so at least surface it instead of losing the countdown
    // with no explanation.
    const currentTimer = get().restTimer;
    const replacingOtherTimer =
      !!restSeconds && !!currentTimer && currentTimer.exerciseId !== entry.exerciseId && currentTimer.endsAt > Date.now();
    set({
      active: { ...active, entries },
      restTimer: restSeconds
        ? { exerciseId: entry.exerciseId, endsAt: Date.now() + restSeconds * 1000, total: restSeconds }
        : get().restTimer,
    });
    if (replacingOtherTimer) {
      get().showToast('Rest timer switched to this exercise');
    }
    // Celebrate achievements the instant they're earned, mid-session — not
    // only at the finish screen. Evaluates the in-progress workout as if
    // finished right now; a discard later prunes anything that turns out not
    // to be really earned (see cancelSession).
    if (turningOn) {
      const synthetic = activeAsFinishedSession(get().active);
      if (synthetic) reconcileOwnBadges(get, set, true, synthetic);
      // ...and celebrate a lift that just beat this exercise's all-time best.
      // `entries` is the post-toggle state (the set is now done), which is
      // what liveRecordForSet needs to judge it.
      const record = liveRecordForSet(get().sessions, entries, entryIdx, setIdx);
      if (record) set({ prCelebration: { ...record, line: Math.floor(Math.random() * 4) } });
    }
  },

  addSet(entryIdx) {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const last = setToCopyForNewSet(e.sets);
      return {
        ...e,
        sets: [
          ...e.sets,
          { reps: last.reps, weight: last.weight, durationSec: last.durationSec, distanceKm: last.distanceKm, done: false, kind: 'normal' as SetKind },
        ],
      };
    });
    set({ active: { ...active, entries } });
  },

  removeSet(entryIdx, setIdx) {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      return { ...e, sets: e.sets.filter((_, si) => si !== setIdx) };
    });
    set({ active: { ...active, entries } });
  },

  setSetKind(entryIdx, setIdx, kind) {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const sets = e.sets.map((s, si) => (si === setIdx ? { ...s, kind } : s));
      return { ...e, sets };
    });
    set({ active: { ...active, entries } });
  },

  applyDropSet(entryIdx, setIdx, rounds) {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const base = e.sets[setIdx];
      if (!base) return e;
      // Spread the whole base set so cardio fields (durationSec/distanceKm)
      // survive, and keep the base set's done state on the first round
      // instead of silently un-checking an already-completed set.
      const dropRounds = Array.from({ length: Math.max(1, rounds) }, (_, i) => ({
        ...base,
        done: i === 0 ? base.done : false,
        kind: 'dropset' as SetKind,
      }));
      const sets = [...e.sets.slice(0, setIdx), ...dropRounds, ...e.sets.slice(setIdx + 1)];
      return { ...e, sets };
    });
    set({ active: { ...active, entries } });
  },

  removeExercise(entryIdx) {
    const active = get().active;
    if (!active) return;
    const removedId = active.entries[entryIdx]?.exerciseId;
    // Clears the removed exercise's own partner's `supersetWith` too — left
    // alone, the partner would keep pointing at an exerciseId that's no
    // longer in `entries`, silently pairing it with nothing (lookups just
    // find no match) and leaving a stale "paired with X" badge showing.
    const entries = active.entries.filter((_, ei) => ei !== entryIdx).map((e) => (e.supersetWith === removedId ? { ...e, supersetWith: undefined } : e));
    set({ active: { ...active, entries } });
  },

  // Pairing is symmetric and exclusive — each exercise can have at most one
  // partner at a time, so re-pairing either side first clears whatever it
  // (or the new partner) was previously paired with, instead of leaving a
  // stale one-directional link.
  pairSuperset(exerciseId, partnerId) {
    const active = get().active;
    if (!active || exerciseId === partnerId) return;
    const entries = active.entries.map((e) => {
      if (e.exerciseId === exerciseId) return { ...e, supersetWith: partnerId };
      if (e.exerciseId === partnerId) return { ...e, supersetWith: exerciseId };
      if (e.supersetWith === exerciseId || e.supersetWith === partnerId) return { ...e, supersetWith: undefined };
      return e;
    });
    set({ active: { ...active, entries } });
  },

  unpairSuperset(exerciseId) {
    const active = get().active;
    if (!active) return;
    const entry = active.entries.find((e) => e.exerciseId === exerciseId);
    const partnerId = entry?.supersetWith;
    if (!partnerId) return;
    const entries = active.entries.map((e) =>
      e.exerciseId === exerciseId || e.exerciseId === partnerId ? { ...e, supersetWith: undefined } : e,
    );
    set({ active: { ...active, entries } });
  },

  // `order[i]` is the original entries-index that should end up at position
  // i — the drag UI builds this locally as the exercise list is dragged, and
  // commits it here once on drop rather than writing to the store on every
  // intermediate swap. restTimers is keyed by exerciseId, not position, so
  // it needs no adjustment when entries move around.
  reorderEntries(order) {
    const active = get().active;
    if (!active || order.length !== active.entries.length) return;
    const entries = order.map((i) => active.entries[i]);
    set({ active: { ...active, entries } });
  },

  addExerciseToSession(exerciseId) {
    // Reached via ExerciseDetailSheet's "+ Add to workout" — when that sheet
    // was opened from the history-edit picker (pickerTargetSessionId set),
    // route through the same target-session-aware path the picker's own
    // multi-select "Add" button uses, instead of always assuming there's a
    // live in-progress session.
    if (get().pickerTargetSessionId) {
      get().addExercisesToSession([exerciseId]);
      return;
    }
    const active = get().active;
    if (!active) return;
    if (active.entries.some((e) => e.exerciseId === exerciseId)) {
      get().showToast('Already in your workout');
      return;
    }
    const restTimers = { ...active.restTimers, ...defaultRestTimersFor([exerciseId], get().settings.defaultRestSeconds) };
    set({ active: { ...active, entries: [...active.entries, { exerciseId, sets: startingSetsFor(get().sessions, exerciseId) }], restTimers } });
    get().showToast('Added');
    get().closeSheet();
  },

  addExercisesToSession(exerciseIds) {
    if (exerciseIds.length === 0) return;
    const targetSessionId = get().pickerTargetSessionId;
    if (targetSessionId) {
      const sessions = get().sessions.map((sess) => {
        if (sess.id !== targetSessionId) return sess;
        const existing = new Set(sess.entries.map((e) => e.exerciseId));
        const toAdd = exerciseIds.filter((id) => !existing.has(id));
        const newEntries = toAdd.map((exerciseId) => {
          const ex = exerciseById(exerciseId);
          const cardio = !!ex && isCardioExercise(ex);
          const firstSet = cardio
            ? { reps: 0, weight: 0, durationSec: 0, distanceKm: 0, done: true, kind: 'normal' as SetKind }
            : { reps: 10, weight: 20, durationSec: undefined, distanceKm: undefined, done: true, kind: 'normal' as SetKind };
          return { exerciseId, sets: [firstSet] };
        });
        return { ...sess, entries: [...sess.entries, ...newEntries] };
      });
      set({ sessions, pickSelected: new Set(), pickerTargetSessionId: null, sheet: 'workout', viewingSessionId: targetSessionId });
      const updated = sessions.find((s) => s.id === targetSessionId);
      if (updated) {
        void db.sessions.put(updated);
        void cloudSync.pushSession(updated);
      }
      get().showToast(exerciseIds.length === 1 ? 'Added 1 exercise' : `Added ${exerciseIds.length} exercises`);
      return;
    }

    const active = get().active;
    if (!active) return;
    const existing = new Set(active.entries.map((e) => e.exerciseId));
    const toAdd = exerciseIds.filter((id) => !existing.has(id));
    if (toAdd.length === 0) return;
    const { sessions } = get();
    const restTimers = { ...active.restTimers, ...defaultRestTimersFor(toAdd, get().settings.defaultRestSeconds) };
    set({
      active: { ...active, entries: [...active.entries, ...toAdd.map((exerciseId) => ({ exerciseId, sets: startingSetsFor(sessions, exerciseId) }))], restTimers },
    });
    set({ pickSelected: new Set() });
    get().showToast(toAdd.length === 1 ? 'Added 1 exercise' : `Added ${toAdd.length} exercises`);
    get().closeSheet();
  },

  // Minimise/restore are deliberately not instant mode flips: the session
  // screen shrinks toward the bar (and expands back out of it) so it reads as
  // the same thing changing size rather than one screen replacing another.
  // The mode change is held back until the shrink has played; the expand runs
  // after the mode change, on the way in. `sessionMorph` is what the CSS
  // hangs off — see App.tsx. Reduced motion skips straight to the flip.
  minimizeSession() {
    const done = () => set((s) => ({ mode: 'tabs', tab: s.tab === 'train' ? 'home' : s.tab, sessionMorph: null }));
    if (prefersReducedMotion()) {
      done();
      return;
    }
    set({ sessionMorph: 'minimizing' });
    clearTimeout(morphTimer);
    morphTimer = setTimeout(done, SESSION_MORPH_MS);
  },

  restoreSession() {
    clearTimeout(morphTimer);
    if (prefersReducedMotion()) {
      set({ mode: 'session', sessionMorph: null });
      return;
    }
    set({ mode: 'session', sessionMorph: 'restoring' });
    morphTimer = setTimeout(() => set({ sessionMorph: null }), SESSION_MORPH_MS);
  },

  cancelSession() {
    get().confirm('Discard this workout? Your progress will be lost.', 'Yes, discard', () => {
      set({ active: null, mode: 'tabs', restTimer: null, prCelebration: null });
      void disarmNudge();
      // Any badge that celebrated against this now-discarded workout isn't
      // really earned — drop it from "known" so it can celebrate for real later.
      pruneBadgesKnownToEarned(get);
      get().showToast('Workout discarded');
    }, true, 'Keep training');
  },

  finishSession() {
    const active = get().active;
    if (!active) return;
    void disarmNudge();
    // Only keep sets you actually checked off — unfilled rows shouldn't be saved as if you did them.
    const entries = active.entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done) }))
      .filter((e) => e.sets.length > 0);
    if (entries.length === 0) {
      get().showToast('Log at least one set before finishing');
      return;
    }
    const durationMin = Math.max(1, Math.round((Date.now() - active.startedAt) / 60000));
    const newSession: WorkoutSession = {
      id: crypto.randomUUID(),
      person: 'You',
      name: active.name || 'Workout',
      routineId: active.routineId,
      startedAt: active.startedAt,
      durationMin,
      entries,
    };
    void db.sessions.add(newSession);
    void cloudSync.pushSession(newSession);
    const exerciseIds = Array.from(new Set(active.entries.map((e) => e.exerciseId)));
    const newRoutine = !active.routineId && exerciseIds.length > 0;
    // Editing a routine's exercises only ever happens live, mid-session — there's
    // no separate "edit routine" screen — so a session that started from a
    // routine but ends with a different exercise list (added/removed/reordered)
    // otherwise has that change silently discarded the moment you finish, with
    // no indication it happened. Flag it so the Finish screen can offer a choice
    // instead of quietly reverting to the original every time.
    const sourceRoutine = active.routineId ? get().routines.find((r) => r.id === active.routineId) : null;
    const routineChanged =
      !!sourceRoutine &&
      (sourceRoutine.exerciseIds.length !== exerciseIds.length ||
        sourceRoutine.exerciseIds.some((id, i) => id !== exerciseIds[i]));
    set((s) => ({
      sessions: [newSession, ...s.sessions],
      active: null,
      mode: 'finish',
      restTimer: null,
      // A PR popup left open when the workout ends belongs to a session
      // that's now finished — the Finish screen takes over from here.
      prCelebration: null,
      finishResult: {
        sessionId: newSession.id,
        entries,
        durationMin,
        name: active.name,
        exerciseIds,
        newRoutine,
        routineId: active.routineId,
        routineChanged,
      },
    }));
    // Session is now in state — check whether finishing it just unlocked
    // anything, and celebrate it (once).
    reconcileOwnBadges(get, set, true);
  },

  saveRoutineFromFinish(name, exerciseIds) {
    const routine: Routine = { id: crypto.randomUUID(), name, exerciseIds, createdAt: Date.now() };
    void db.routines.add(routine);
    void cloudSync.pushRoutine(routine);
    set((s) => ({ routines: [...s.routines, routine], tab: 'train', mode: 'tabs', finishResult: null }));
    get().showToast('Routine saved');
  },

  updateRoutineExercises(routineId, exerciseIds) {
    void db.routines.update(routineId, { exerciseIds });
    const routine = get().routines.find((r) => r.id === routineId);
    if (routine) void cloudSync.pushRoutine({ ...routine, exerciseIds });
    set((s) => ({ routines: s.routines.map((r) => (r.id === routineId ? { ...r, exerciseIds } : r)) }));
    get().showToast('Routine updated');
  },

  openPicker() {
    set({ sheet: 'picker', pickQuery: '', pickBodyPart: 'all', pickSelected: new Set(), pickerTargetSessionId: null });
  },

  openPickerForHistory(sessionId) {
    set({ sheet: 'picker', pickQuery: '', pickBodyPart: 'all', pickSelected: new Set(), pickerTargetSessionId: sessionId });
  },

  openDetail(id) {
    set({ sheet: 'detail', detailExerciseId: id, detailReturnToPicker: false });
  },

  openDetailFromPicker(id) {
    set({ sheet: 'detail', detailExerciseId: id, detailReturnToPicker: true });
  },

  openWorkoutSheet(id) {
    set({ sheet: 'workout', viewingSessionId: id, historyEditing: false });
  },

  openRoutineActions(id) {
    set({ sheet: 'routineActions', viewingRoutineId: id });
  },

  renameRoutine(id, name) {
    const trimmed = name.trim();
    if (!trimmed) return;
    void db.routines.update(id, { name: trimmed });
    const routine = get().routines.find((r) => r.id === id);
    if (routine) void cloudSync.pushRoutine({ ...routine, name: trimmed });
    set((s) => ({ routines: s.routines.map((r) => (r.id === id ? { ...r, name: trimmed } : r)), sheet: null }));
    get().showToast('Routine renamed');
  },

  deleteRoutine(id) {
    get().confirm('Delete this routine? This can\'t be undone.', 'Yes, delete', () => {
      void db.routines.delete(id);
      void cloudSync.deleteRoutineRemote(id);
      set((s) => ({ routines: s.routines.filter((r) => r.id !== id), sheet: null }));
      get().showToast('Routine deleted');
    }, true);
  },

  duplicateRoutine(id) {
    const source = get().routines.find((r) => r.id === id);
    if (!source) return;
    // No explicit sortOrder — falls back to createdAt (see sortRoutines),
    // which naturally places the copy at the end of the list, same as any
    // other freshly-created routine.
    const copy: Routine = { id: crypto.randomUUID(), name: `${source.name} copy`, exerciseIds: [...source.exerciseIds], createdAt: Date.now() };
    void db.routines.add(copy);
    void cloudSync.pushRoutine(copy);
    set((s) => ({ routines: [...s.routines, copy], sheet: null }));
    get().showToast('Routine duplicated');
  },

  // `order[i]` is the displayed-list index (per sortRoutines, same ordering
  // TrainScreen renders) that should end up at position i — mirrors
  // reorderEntries's contract. Every routine gets a fresh sortOrder here
  // rather than just the ones that moved, so the whole list stays a clean,
  // gap-free sequence after each drag.
  reorderRoutines(order) {
    const sorted = sortRoutines(get().routines);
    if (order.length !== sorted.length) return;
    const reordered = order.map((i, position) => ({ ...sorted[i], sortOrder: position }));
    set((s) => ({
      routines: s.routines.map((r) => reordered.find((u) => u.id === r.id) ?? r),
    }));
    reordered.forEach((r) => {
      void db.routines.update(r.id, { sortOrder: r.sortOrder });
      void cloudSync.pushRoutine(r);
    });
  },

  closeSheet() {
    const { sheet, detailReturnToPicker, pickerTargetSessionId, customExerciseReturnTo } = get();
    if (sheet === 'customExercise') {
      // Reachable from both the picker (create) and the exercise detail
      // sheet (edit), so back out to whichever opened it rather than
      // guessing — see customExerciseReturnTo.
      set({ sheet: customExerciseReturnTo, editingCustomExerciseId: null, customExerciseReturnTo: null });
    } else if (sheet === 'detail' && detailReturnToPicker) {
      // Only true when detail was reached via the picker's "i" button — an
      // explicit flag rather than inferring it from "a session happens to be
      // active", which used to wrongly send you to the picker when opening
      // detail from, say, Profile's Personal Records while a session was
      // merely minimized (still active) in the background.
      set({ sheet: 'picker', detailReturnToPicker: false });
    } else if (sheet === 'picker' && pickerTargetSessionId) {
      // The picker replaced the workout-detail sheet (only one sheet renders
      // at a time), so backing out without adding anything — swipe, scrim
      // tap, Escape — needs to return there explicitly, not just close
      // everything the way it would for the in-progress-session picker.
      set({ sheet: 'workout', pickerTargetSessionId: null });
    } else if (sheet === 'importPreview') {
      // Dismissing any way (swipe, backdrop tap, Escape) should discard the
      // pending import and land back on Settings, same as tapping Cancel —
      // otherwise the preview data would linger in memory even though the
      // sheet closed, and closing to nothing would drop the user out of
      // Settings entirely just for backing out of an import attempt.
      set({ sheet: 'settings', importPreview: null });
    } else {
      set({ sheet: null });
    }
  },

  setPickQuery(q) {
    set({ pickQuery: q });
  },

  setPickBodyPart(bp) {
    set({ pickBodyPart: bp });
  },

  togglePickSelected(id) {
    set((s) => {
      const next = new Set(s.pickSelected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { pickSelected: next };
    });
  },

  // --- Reactions --------------------------------------------------------

  // Fetches reactions for the workouts that could plausibly be on screen:
  // the most recent slice across your own history and your friends'. Scoped
  // rather than fetching everything, because reactions are the highest-row
  // table in the app and nothing older than the feed window is ever shown.
  async refreshReactions() {
    const userId = getCurrentUserId();
    if (!userId) return;
    const ids = [...get().sessions, ...get().friendSessions]
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, REACTION_SESSION_WINDOW)
      .map((s) => s.id);
    if (ids.length === 0) return;
    try {
      const rows = await reactionsApi.fetchReactionsFor(ids);
      if (getCurrentUserId() !== userId) return;
      const next = new Map<string, Reaction[]>();
      for (const r of rows) {
        const list = next.get(r.sessionId);
        if (list) list.push(r);
        else next.set(r.sessionId, [r]);
      }
      set({ reactions: next });
      announceNewReactions(get, rows);
      // Someone applauding your workout is the signal for the "received"
      // badge, and it isn't derivable from stored data any other way — same
      // shape as firstFriendAt/firstComparisonAt.
      const ownIds = new Set(get().sessions.map((s) => s.id));
      if (get().settings.firstReactionReceivedAt == null && rows.some((r) => ownIds.has(r.sessionId) && r.userId !== userId)) {
        get().updateSettings({ firstReactionReceivedAt: Date.now() });
        reconcileOwnBadges(get, set, true);
      }
    } catch (err) {
      console.error('Failed to load reactions', err);
    }
  },

  // Applied locally first: a reaction that waited on a round trip would feel
  // broken, and the poll that brings in everyone else's is up to 45s away.
  // Reverts on failure rather than leaving the optimistic state lying.
  toggleReaction(sessionId, code) {
    const userId = getCurrentUserId();
    if (!userId) return;
    const before = get().reactions;
    const current = before.get(sessionId) ?? [];
    const mine = current.find((r) => r.userId === userId && r.code === code);
    const nextList = mine
      ? current.filter((r) => r !== mine)
      : [...current, { sessionId, userId, code, name: 'You', createdAt: Date.now() }];

    const optimistic = new Map(before);
    if (nextList.length > 0) optimistic.set(sessionId, nextList);
    else optimistic.delete(sessionId);
    set({ reactions: optimistic });
    vibrate(REACTION_TAP_PATTERN);

    const request = mine
      ? reactionsApi.removeReactionRemote(sessionId, code)
      : reactionsApi.addReactionRemote(sessionId, code);
    void request.catch((err) => {
      console.error('Failed to save reaction', err);
      // Rebuilt from the CURRENT map rather than restoring the snapshot
      // wholesale — another session's reactions may have arrived from the
      // poll while this request was in flight, and those shouldn't be lost
      // just because this one write failed.
      const live = new Map(get().reactions);
      const list = (live.get(sessionId) ?? []).filter((r) => !(r.userId === userId && r.code === code));
      if (mine) list.push(mine);
      if (list.length > 0) live.set(sessionId, list);
      else live.delete(sessionId);
      set({ reactions: live });
      get().showToast(navigator.onLine ? 'Could not save that reaction' : 'Reactions need a connection');
    });

    if (!mine && get().settings.firstReactionGivenAt == null) {
      get().updateSettings({ firstReactionGivenAt: Date.now() });
      reconcileOwnBadges(get, set, true);
    }
  },

  openReactorList(sessionId) {
    set({ sheet: 'reactors', reactorListSessionId: sessionId });
  },

  // --- Shared custom exercise library ---------------------------------

  async refreshCustomExercises() {
    const userId = getCurrentUserId();
    if (!userId) return;
    // Fetched alongside the library rather than on its own schedule — it's a
    // single indexed row and it's only ever needed together with the list.
    void customExercisesApi.fetchIsAdmin(userId).then((isLibraryAdmin) => {
      if (getCurrentUserId() === userId) set({ isLibraryAdmin });
    });
    try {
      const remote = await customExercisesApi.fetchCustomExercises();
      // Anything created on this device that hasn't reached the server yet
      // (added offline, still sitting in pendingSync) would otherwise be
      // wiped by this overwrite and vanish from the picker mid-workout.
      const remoteIds = new Set(remote.map((e) => e.id));
      const unsynced = get().customExercises.filter((e) => !remoteIds.has(e.id));
      const merged = [...remote, ...unsynced];
      await db.customExercises.bulkPut(remote);
      setCustomExercises(merged);
      set({ customExercises: merged });
    } catch (err) {
      // Offline or unreachable — the Dexie copy loaded in init() stands in,
      // so the picker keeps working with whatever this device last saw.
      console.error('Could not refresh the shared exercise library', err);
    }
  },

  openCustomExerciseForm(editId, prefillName) {
    set((s) => ({
      sheet: 'customExercise',
      editingCustomExerciseId: editId ?? null,
      customExerciseReturnTo: s.sheet,
      // Reused as the create form's initial name when opened from a search
      // that found nothing — typing it twice would be silly.
      pickQuery: editId ? s.pickQuery : (prefillName ?? s.pickQuery),
    }));
  },

  async saveCustomExercise(draft) {
    const name = draft.name.trim().replace(/\s+/g, ' ');
    if (!name) {
      get().showToast('Give the exercise a name');
      return;
    }
    const editId = get().editingCustomExerciseId;
    const clash = findExerciseByName(name);
    if (clash && clash.id !== editId) {
      get().showToast(`“${clash.name}” is already in the library`);
      return;
    }

    const existing = editId ? get().customExercises.find((e) => e.id === editId) : undefined;
    if (editId && !existing) return;
    const exercise: CustomExercise = existing
      ? { ...existing, ...draft, name }
      : {
          ...draft,
          name,
          id: newCustomExerciseId(),
          secondary_muscles: [],
          image: '',
          gif_url: '',
          attribution: '',
          createdBy: getCurrentUserId(),
          createdAt: Date.now(),
          archived: false,
        };

    // Written locally and made usable first, then published. Adding an
    // exercise is something people do mid-workout, in a gym, often on bad
    // signal — blocking on the round-trip would be the wrong trade. The
    // server's unique index is still the real duplicate guard; if a queued
    // publish loses that race the exercise simply stays local to this
    // device, which is a far better failure than refusing to log the set.
    await db.customExercises.put(exercise);
    const next = existing
      ? get().customExercises.map((e) => (e.id === exercise.id ? exercise : e))
      : [...get().customExercises, exercise];
    setCustomExercises(next);
    set({
      customExercises: next,
      sheet: get().customExerciseReturnTo,
      editingCustomExerciseId: null,
      customExerciseReturnTo: null,
    });
    void cloudSync.pushCustomExercise(exercise);
    get().showToast(existing ? 'Exercise updated' : `“${name}” added for everyone`);
  },

  archiveCustomExercise(id) {
    const exercise = get().customExercises.find((e) => e.id === id);
    if (!exercise) return;
    get().confirm(
      `Remove “${exercise.name}” from the shared library? It disappears from search for everyone, but workouts that already used it — yours and anyone else's — keep it.`,
      'Remove',
      () => {
        const archived: CustomExercise = { ...exercise, archived: true };
        void db.customExercises.put(archived);
        const next = get().customExercises.map((e) => (e.id === id ? archived : e));
        setCustomExercises(next);
        set({ customExercises: next, sheet: null });
        void cloudSync.pushCustomExercise(archived);
        get().showToast('Removed from the library');
      },
      true,
    );
  },

  confirm(message, yesLabel, onYes, danger = false, cancelLabel = 'Cancel') {
    // Guards against a second confirm() call silently discarding the first
    // dialog's onYes (e.g. a rapid double-tap on the trigger button firing
    // twice before the scrim's pointer-events:auto kicks in). First request
    // wins; it must be resolved before a new one can replace it.
    if (get().dialog) return;
    set({ dialog: { message, yesLabel, cancelLabel, danger, onYes } });
  },

  resolveDialog(yes) {
    const dialog = get().dialog;
    set({ dialog: null });
    if (yes && dialog) dialog.onYes();
  },

  showToast(message) {
    set({ toastMsg: message });
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => set({ toastMsg: '' }), 1800);
  },

  copyWorkoutToRoutines(sessionId) {
    const session = [...get().sessions, ...get().friendSessions].find((s) => s.id === sessionId);
    if (!session) return;
    const exerciseIds = Array.from(new Set(session.entries.map((e) => e.exerciseId)));
    const routine: Routine = {
      id: crypto.randomUUID(),
      name: `${session.name} (from ${session.person})`,
      exerciseIds,
      createdAt: Date.now(),
    };
    void db.routines.add(routine);
    void cloudSync.pushRoutine(routine);
    set((s) => ({ routines: [...s.routines, routine] }));
    get().showToast('Copied to your routines');
    get().closeSheet();
    get().go('train');
  },

  repeatWorkout(sessionId) {
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const doStart = () => {
      get().closeSheet();
      const active: ActiveSession = {
        routineId: null,
        name: session.name,
        startedAt: Date.now(),
        entries: session.entries.map((e) => ({
          exerciseId: e.exerciseId,
          sets: e.sets.map((s) => ({ reps: s.reps, weight: s.weight, durationSec: s.durationSec, distanceKm: s.distanceKm, done: false, kind: s.kind })),
        })),
        restTimers: defaultRestTimersFor(Array.from(new Set(session.entries.map((e) => e.exerciseId))), get().settings.defaultRestSeconds),
      };
      set({ active, mode: 'session', restTimer: null });
    };
    if (get().active) {
      get().confirm('You already have a workout in progress. Discard it and start this one?', 'Yes, start', () => {
        set({ active: null });
        doStart();
      }, true);
    } else {
      doStart();
    }
  },

  setHistoryEditing(v) {
    set({ historyEditing: v });
  },

  // Forgetting to hit "finish" until hours later leaves a workout claiming a
  // duration nobody actually trained, which then skews weekly-minutes totals,
  // the "vs last time" comparison and the session-length badges. The recorded
  // length is the one number the app infers rather than being told, so it's
  // the one that most needs correcting afterwards.
  updateSessionDuration(sessionId, minutes) {
    const durationMin = Math.min(MAX_DURATION_MIN, Math.max(MIN_DURATION_MIN, Math.round(minutes)));
    const sessions = get().sessions.map((sess) => (sess.id === sessionId ? { ...sess, durationMin } : sess));
    const updated = sessions.find((s) => s.id === sessionId);
    if (!updated) return;
    const finishResult = get().finishResult;
    set({
      sessions,
      // The Finish screen reads its own snapshot rather than `sessions`, so
      // it has to be corrected alongside or the edit appears not to take.
      ...(finishResult?.sessionId === sessionId ? { finishResult: { ...finishResult, durationMin } } : {}),
    });
    void db.sessions.put(updated);
    void cloudSync.pushSession(updated);
    // Session-length badges are derived from this number, so a correction can
    // both earn one and take one away. Sync the "already celebrated" set in
    // both directions, but silently: NumberField commits on every keystroke,
    // so typing 600 back over a shortened value would otherwise re-fire a
    // celebration for a badge the workout already had. (Both calls only touch
    // settings when the earned set genuinely changed.)
    reconcileOwnBadges(get, set, false);
    pruneBadgesKnownToEarned(get);
  },

  updateHistorySet(sessionId, entryIdx, setIdx, field, value) {
    const sessions = get().sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      const entries = sess.entries.map((e, ei) => {
        if (ei !== entryIdx) return e;
        const sets = e.sets.map((s, si) => (si === setIdx ? { ...s, [field]: Math.max(0, value) } : s));
        return { ...e, sets };
      });
      return { ...sess, entries };
    });
    set({ sessions });
    const updated = sessions.find((s) => s.id === sessionId);
    if (updated) {
      void db.sessions.put(updated);
      void cloudSync.pushSession(updated);
    }
  },

  // A finished workout's sets are already `done` by the time they're saved,
  // so a set added while editing history defaults to done: true too — unlike
  // addSet() for an in-progress session, where a fresh set is meant to be
  // checked off as it's actually performed.
  addHistorySet(sessionId, entryIdx) {
    const sessions = get().sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      const entries = sess.entries.map((e, ei) => {
        if (ei !== entryIdx) return e;
        const last = setToCopyForNewSet(e.sets);
        return {
          ...e,
          sets: [
            ...e.sets,
            { reps: last.reps, weight: last.weight, durationSec: last.durationSec, distanceKm: last.distanceKm, done: true, kind: 'normal' as SetKind },
          ],
        };
      });
      return { ...sess, entries };
    });
    set({ sessions });
    const updated = sessions.find((s) => s.id === sessionId);
    if (updated) {
      void db.sessions.put(updated);
      void cloudSync.pushSession(updated);
    }
  },

  removeHistorySet(sessionId, entryIdx, setIdx) {
    const sessions = get().sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      const entries = sess.entries.map((e, ei) => (ei !== entryIdx ? e : { ...e, sets: e.sets.filter((_, si) => si !== setIdx) }));
      return { ...sess, entries };
    });
    set({ sessions });
    const updated = sessions.find((s) => s.id === sessionId);
    if (updated) {
      void db.sessions.put(updated);
      void cloudSync.pushSession(updated);
    }
  },

  removeHistoryExercise(sessionId, entryIdx) {
    const sessions = get().sessions.map((sess) => {
      if (sess.id !== sessionId) return sess;
      return { ...sess, entries: sess.entries.filter((_, ei) => ei !== entryIdx) };
    });
    set({ sessions });
    const updated = sessions.find((s) => s.id === sessionId);
    if (updated) {
      void db.sessions.put(updated);
      void cloudSync.pushSession(updated);
    }
  },

  deleteSession(sessionId) {
    get().confirm('Delete this workout from your history? This can\'t be undone.', 'Yes, delete', () => {
      void db.sessions.delete(sessionId);
      void cloudSync.deleteSessionRemote(sessionId);
      set((s) => ({ sessions: s.sessions.filter((sess) => sess.id !== sessionId), sheet: null }));
      get().showToast('Workout deleted');
    }, true);
  },

  setRestDuration(exerciseId, seconds) {
    const active = get().active;
    if (!active) return;
    const restTimers = { ...active.restTimers };
    if (seconds === null) delete restTimers[exerciseId];
    else restTimers[exerciseId] = seconds;
    set({ active: { ...active, restTimers } });
  },

  adjustRestTimer(deltaSeconds) {
    const rt = get().restTimer;
    if (!rt) return;
    const endsAt = Math.max(Date.now(), rt.endsAt + deltaSeconds * 1000);
    // Grow/shrink `total` alongside `endsAt` so the progress bar (which
    // fills by remaining / total) stays proportional — otherwise +5s pins
    // the fill at 100% and -5s makes it jump. Never let total fall below the
    // remaining time.
    const remainingSec = Math.ceil((endsAt - Date.now()) / 1000);
    const total = Math.max(remainingSec, 1, rt.total + deltaSeconds);
    set({ restTimer: { ...rt, endsAt, total } });
  },

  skipRestTimer() {
    set({ restTimer: null });
  },

  openSettings() {
    set({ sheet: 'settings' });
  },

  openWeightDetail() {
    set({ sheet: 'weightDetail' });
  },

  openHydrationDetail() {
    set({ sheet: 'hydrationDetail' });
  },

  openNutritionDetail() {
    set({ sheet: 'nutritionDetail' });
  },

  openMacrosDetail() {
    set({ sheet: 'macrosDetail' });
  },

  openStrengthDetail() {
    set({ sheet: 'strengthDetail' });
  },

  openProfileDetail() {
    set({ sheet: 'profileDetail' });
  },

  openBodyCompositionDetail() {
    set({ sheet: 'bodyCompositionDetail' });
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    saveSettings(settings);
    if (patch.theme || patch.accent) applyTheme(settings);
    void cloudSync.pushSettings(settings);
  },

  exportData() {
    const { routines, sessions, settings, bodyProfile, bodyLog, waterLog, calorieLog, customExercises } = get();
    // customExercises rides along so the backup can name every exercise its
    // sessions reference, but confirmImport deliberately ignores it: the
    // shared library is server-owned, and re-publishing someone's snapshot
    // of it on restore would resurrect entries other people have since
    // archived. Restoring pulls the live library from Supabase instead.
    const blob = new Blob(
      [JSON.stringify({ routines, sessions, settings, bodyProfile, bodyLog, waterLog, calorieLog, customExercises }, null, 2)],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    get().showToast('Data exported');
  },

  importData(file) {
    set({ importing: true });
    file
      .text()
      .then((text) => {
        const isCsv = file.name.toLowerCase().endsWith('.csv') || looksLikeHevyCsv(text);
        if (isCsv) {
          const result = convertHevyCsv(text);
          if (!result || result.sessions.length === 0) {
            get().showToast('No importable workouts found in that file');
            return;
          }
          set({
            importPreview: { routines: result.routines, sessions: result.sessions, unmatchedNames: result.unmatchedNames, isCsv: true },
            sheet: 'importPreview',
          });
          return;
        }

        const data = JSON.parse(text) as {
          routines?: unknown;
          sessions?: unknown;
          settings?: Partial<Settings>;
          bodyProfile?: unknown;
          bodyLog?: unknown;
          waterLog?: unknown;
          calorieLog?: unknown;
        };
        if (!Array.isArray(data.routines) || !Array.isArray(data.sessions)) {
          get().showToast('That file doesn\'t look like a FitFlow backup or a Hevy CSV export');
          return;
        }
        const validRoutines = data.routines.filter(isValidImportedRoutine);
        // Filtered to 'You' here too (not just in prepareImportedData at
        // confirm time) so the preview's counts — and the "Import N
        // workouts" button — match exactly what actually gets imported,
        // instead of showing a higher count that silently shrinks on confirm.
        const validSessions = data.sessions.filter(isValidImportedSession).filter((s) => s.person === 'You');
        const bodyProfile = data.bodyProfile && typeof data.bodyProfile === 'object' ? (data.bodyProfile as BodyProfile) : undefined;
        const bodyLog = Array.isArray(data.bodyLog) ? (data.bodyLog as BodyLogEntry[]) : undefined;
        const waterLog = Array.isArray(data.waterLog) ? (data.waterLog as WaterLogEntry[]) : undefined;
        const calorieLog = Array.isArray(data.calorieLog) ? (data.calorieLog as CalorieLogEntry[]) : undefined;
        const hasBody = !!(bodyProfile || bodyLog?.length || waterLog?.length || calorieLog?.length);
        if (validRoutines.length === 0 && validSessions.length === 0 && !hasBody) {
          get().showToast('That file doesn\'t look like a FitFlow backup or a Hevy CSV export');
          return;
        }
        const skipped = data.routines.length - validRoutines.length + (data.sessions.length - validSessions.length);
        set({
          importPreview: {
            routines: validRoutines,
            sessions: validSessions,
            unmatchedNames: [],
            isCsv: false,
            settingsPatch: data.settings,
            bodyProfile,
            bodyLog,
            waterLog,
            calorieLog,
          },
          sheet: 'importPreview',
        });
        if (skipped > 0) {
          get().showToast(`Skipped ${skipped} item${skipped === 1 ? '' : 's'} that can't be imported`);
        }
      })
      .catch(() => get().showToast('Could not read that file'))
      .finally(() => set({ importing: false }));
  },

  confirmImport(mode) {
    const preview = get().importPreview;
    if (!preview) return;

    if (mode === 'merge') {
      const { routines, sessions, touchedRoutines, touchedSessions } = mergeImportedData(
        get().routines,
        get().sessions,
        preview.routines,
        preview.sessions.filter((s) => s.person === 'You'),
        preview.isCsv,
      );
      void db.routines.bulkPut(touchedRoutines);
      void db.sessions.bulkPut(touchedSessions);
      void Promise.all([...touchedRoutines.map((r) => cloudSync.pushRoutine(r)), ...touchedSessions.map((s) => cloudSync.pushSession(s))]);
      let settings = get().settings;
      set({ routines, sessions, sheet: null, importPreview: null });
      if (preview.settingsPatch) {
        settings = sanitizeSettings({ ...settings, ...preview.settingsPatch });
        set({ settings });
        saveSettings(settings);
        applyTheme(settings);
        void cloudSync.pushSettings(settings);
      }
      const body = persistImportedBodyData('merge', get(), preview);
      if (body) set(body);
      get().showToast(preview.isCsv ? 'Workouts merged in' : 'Backup merged in');
      return;
    }

    const prevRoutines = get().routines;
    const prevSessions = get().sessions;
    const { routines, sessions, settings } = prepareImportedData(get().settings, preview.routines, preview.sessions, preview.settingsPatch);
    void db.routines.clear().then(() => db.routines.bulkPut(routines));
    void db.sessions.clear().then(() => db.sessions.bulkPut(sessions));
    // Per-row delete/upsert instead of a bulk clear+replace — each of these
    // already retries via pendingSync on failure (see pushRoutine etc. in
    // cloudSync.ts), so a network hiccup here gets queued and flushed later
    // instead of leaving stale rows on the server that reconcileNewFromCloud
    // would otherwise resurrect on the next sync.
    const newRoutineIds = new Set(routines.map((r) => r.id));
    const newSessionIds = new Set(sessions.map((s) => s.id));
    void Promise.all([
      ...prevRoutines.filter((r) => !newRoutineIds.has(r.id)).map((r) => cloudSync.deleteRoutineRemote(r.id)),
      ...prevSessions.filter((s) => s.person === 'You' && !newSessionIds.has(s.id)).map((s) => cloudSync.deleteSessionRemote(s.id)),
      ...routines.map((r) => cloudSync.pushRoutine(r)),
      ...sessions.filter((s) => s.person === 'You').map((s) => cloudSync.pushSession(s)),
    ]);
    set({ routines, sessions, settings, sheet: null, importPreview: null });
    if (preview.settingsPatch) {
      saveSettings(settings);
      applyTheme(settings);
      void cloudSync.pushSettings(settings);
    }
    const body = persistImportedBodyData('replace', get(), preview);
    if (body) set(body);
    get().showToast(preview.isCsv ? 'Workouts imported' : 'Backup imported');
  },

  cancelImportPreview() {
    // The preview only ever gets here from Settings' "Import backup" button —
    // back out to it rather than closing everything, same as declining to
    // keep viewing whatever screen was open before.
    set({ importPreview: null, sheet: 'settings' });
  },

  // "Clear all data" means all of it. This used to wipe only routines and
  // sessions, silently leaving every Life-tab record — weight, body fat,
  // measurements, sleep, resting HR, nutrition, hydration, the body profile
  // — plus any workout still in progress. That's the most sensitive data in
  // the app, and someone clearing a phone before handing it on would
  // reasonably have believed it was gone.
  //
  // The shared custom-exercise library is deliberately NOT touched: those
  // rows aren't this account's data, they belong to everyone, and other
  // people's history points at them.
  clearAllData() {
    get().confirm(
      'Delete everything on this account — routines, workout history, weight and measurements, nutrition and hydration, and any workout in progress? This can\'t be undone.',
      'Yes, delete everything',
      () => {
        const prevRoutines = get().routines;
        const prevSessions = get().sessions;
        void db.routines.clear();
        void db.sessions.clear();
        void db.activeSession.clear();
        void db.bodyProfile.clear();
        void db.bodyLog.clear();
        void db.waterLog.clear();
        void db.calorieLog.clear();
        // Per-row deletes for routines/sessions so a failed one gets queued in
        // pendingSync and retried, instead of silently leaving that row on the
        // server to be resurrected by the next sync (see confirmImport for the
        // same fix). The body tables go in one bulk delete per table instead —
        // there's no per-row id to queue for bodyProfile, and a queued mass
        // delete that fires later could destroy data logged in the meantime.
        void Promise.all([
          ...prevRoutines.map((r) => cloudSync.deleteRoutineRemote(r.id)),
          ...prevSessions.filter((s) => s.person === 'You').map((s) => cloudSync.deleteSessionRemote(s.id)),
        ]);
        void bodySync.deleteAllBodyDataRemote().catch((err) => {
          console.error('Failed to clear body data from the cloud', err);
          get().showToast('Body data cleared here, but not in the cloud — try again when online');
        });
        // Any in-progress workout is part of "everything" too; leaving it
        // would also let finishSession() write a new session moments later.
        set({
          routines: [],
          sessions: [],
          active: null,
          mode: 'tabs',
          restTimer: null,
          finishResult: null,
          bodyProfile: DEFAULT_BODY_PROFILE,
          bodyLog: [],
          waterLog: [],
          calorieLog: [],
          sheet: null,
        });
        void disarmNudge();
        // Badges were credited against history that no longer exists — drop
        // the ones that are no longer actually earned so they can celebrate
        // again for real rather than staying silently "known".
        pruneBadgesKnownToEarned(get);
        get().showToast('All data cleared');
      },
      true,
    );
  },

  deleteAccount() {
    get().confirm(
      'Permanently delete your account? This removes your routines, workout history, settings, and friend connections — for good. Anyone who\'s friends with you will lose access to your stats too.',
      'Yes, delete my account',
      () => {
        void cloudSync
          .deleteOwnAccount()
          .then(() => signOut())
          .catch((err) => {
            console.error('Failed to delete account', err);
            get().showToast('Could not delete your account — try again');
          });
      },
      true,
    );
  },

  async syncWithCloud(userId) {
    // Keyed by userId (not a plain boolean) so a fast account switch doesn't
    // make the incoming account's sync silently no-op just because the
    // previous account's sync was still in flight. stillCurrent() is
    // rechecked before every write below, so if the signed-in user changes
    // partway through, this run stops touching Dexie/state instead of
    // possibly writing one account's data on top of another's.
    if (cloudSyncUserId === userId) return;
    cloudSyncUserId = userId;
    const linkedKey = `fitflow-cloud-linked-${userId}`;
    const stillCurrent = () => getCurrentUserId() === userId;
    try {
      await cloudSync.flushPendingSync();
      if (!stillCurrent()) return;

      // Settings are account-specific, not device-specific — always adopt
      // whatever this account has saved in the cloud (or, if it has none
      // yet, seed the cloud with this device's current settings) regardless
      // of which branch below runs. This is what makes the theme/accent
      // switch to the signed-in account's own choice right after login.
      const remoteSettings = await cloudSync.fetchSettings();
      if (!stillCurrent()) return;
      if (remoteSettings) {
        // Merge (don't replace) so cumulative badge state survives — see
        // mergeCloudSettings. Push the merged result back so the cloud blob
        // gains any fields it was missing (e.g. badgesKnown from this device's
        // baseline), instead of handing the same lossy blob back next launch.
        const merged = mergeCloudSettings(get().settings, remoteSettings);
        set({ settings: merged });
        saveSettings(merged);
        applyTheme(merged);
        void cloudSync.pushSettings(merged);
      } else {
        await cloudSync.pushSettings(get().settings);
      }
      if (!stillCurrent()) return;

      if (localStorage.getItem(linkedKey) === '1') {
        // Already linked — pull in anything created on another device
        // (additive), any routine edited on another device (cloud content
        // wins for a routine id already present locally), and remove
        // anything deleted on another device (a routine or a workout no
        // longer present remotely).
        const { newRoutines, updatedRoutines, goneRoutineIds, newSessions, goneSessionIds } = await cloudSync.reconcileNewFromCloud(
          get().routines,
          get().sessions,
        );
        if (!stillCurrent()) return;
        if (newRoutines.length > 0) await db.routines.bulkPut(newRoutines);
        if (updatedRoutines.length > 0) await db.routines.bulkPut(updatedRoutines);
        if (goneRoutineIds.length > 0) await db.routines.bulkDelete(goneRoutineIds);
        if (newSessions.length > 0) await db.sessions.bulkPut(newSessions);
        if (goneSessionIds.length > 0) await db.sessions.bulkDelete(goneSessionIds);
        if (!stillCurrent()) return;
        if (
          newRoutines.length > 0 ||
          updatedRoutines.length > 0 ||
          goneRoutineIds.length > 0 ||
          newSessions.length > 0 ||
          goneSessionIds.length > 0
        ) {
          set((s) => ({
            routines: s.routines
              .filter((r) => !goneRoutineIds.includes(r.id))
              .map((r) => updatedRoutines.find((u) => u.id === r.id) ?? r)
              .concat(newRoutines),
            sessions: s.sessions.filter((sess) => !goneSessionIds.includes(sess.id)).concat(newSessions),
          }));
        }
        return;
      }

      const counts = await cloudSync.remoteCounts();
      if (!stillCurrent()) return;
      if (counts.routines === 0 && counts.sessions === 0) {
        // Brand-new account — this device's local history becomes the account's history.
        const { routines, sessions } = remapLegacyIdsToUuid(get().routines, get().sessions);
        await db.routines.clear();
        await db.routines.bulkPut(routines);
        await db.sessions.clear();
        await db.sessions.bulkPut(sessions);
        if (!stillCurrent()) return;
        set({ routines, sessions });
        await cloudSync.uploadLocalDataOnFirstLogin(routines, sessions);
      } else {
        // Account already has data (signing in on a second device) — cloud
        // fully wins for routines and your own sessions.
        const remote = await cloudSync.fetchAllRemote();
        if (!stillCurrent()) return;
        await db.routines.clear();
        await db.routines.bulkPut(remote.routines);
        await db.sessions.clear();
        await db.sessions.bulkPut(remote.sessions);
        if (!stillCurrent()) return;
        set({ routines: remote.routines, sessions: remote.sessions });
      }
      if (stillCurrent()) localStorage.setItem(linkedKey, '1');
      // History may have been pulled from the cloud (a second device, or
      // freshly linked) — credit any badges it earned silently, so those
      // don't all fire as "new" celebrations on the next finish.
      if (stillCurrent()) reconcileOwnBadges(get, set, false);
    } catch (err) {
      console.error('Cloud sync failed, will retry next load', err);
    } finally {
      if (cloudSyncUserId === userId) cloudSyncUserId = null;
    }
  },

  openFriends() {
    set({ sheet: 'friends' });
    // Always refetch (not just on first-ever open) — there's no realtime
    // subscription, so a request that arrived after this device's last
    // fetch would otherwise stay invisible until a full page reload.
    void get().refreshFriends();
  },

  async refreshFriends() {
    // Same staleness guard as syncWithCloud — without it, a fast sign-out
    // then sign-in as a different account could let account A's slower,
    // still-in-flight response land after account B's, silently overwriting
    // B's friends list with A's.
    const userId = getCurrentUserId();
    if (!userId) return;
    try {
      const [friendsList, incomingRequests, outgoingRequests] = await Promise.all([
        friendsApi.fetchFriends(),
        friendsApi.fetchIncomingRequests(),
        friendsApi.fetchOutgoingRequests(),
      ]);
      if (getCurrentUserId() !== userId) return;
      set({ friends: friendsList, incomingRequests, outgoingRequests, friendsLoaded: true });
      void get().refreshFriendSessions();
      void get().refreshFriendShowcase();
      // Keep the Social badges' known-state in sync as the friend list changes
      // (credited silently — a friend added on another device, or before this
      // shipped, shouldn't pop a celebration on a passive refresh).
      reconcileOwnBadges(get, set, false);
    } catch (err) {
      console.error('Failed to refresh friends', err);
    }
  },

  async refreshFriendSessions() {
    const userId = getCurrentUserId();
    if (!userId) return;
    try {
      const friendSessions = await friendsApi.fetchAllFriendSessions(get().friends);
      if (getCurrentUserId() !== userId) return;
      set({ friendSessions });
      // Reactions are fetched for a list of session ids, and a friend's
      // sessions only exist here — they never touch Dexie. Chaining the two
      // is what guarantees the ids are actually present when the reaction
      // query is built.
      //
      // This used to be a separate effect keyed on `friends`, which fired
      // while this request was still in flight and so only ever asked about
      // the user's OWN workouts. The rows were in the database and readable
      // the whole time; nothing was requesting them. The visible result was
      // that a reaction you left on someone else's workout vanished on
      // reload, and someone reacting to yours could never see their own
      // reaction — while you could see it perfectly well.
      void get().refreshReactions();
    } catch (err) {
      console.error('Failed to refresh friend sessions', err);
    }
  },

  async refreshFriendShowcase() {
    const userId = getCurrentUserId();
    if (!userId) return;
    const ids = get().friends.map((f) => f.profile.id);
    const friendShowcase = await friendsApi.fetchShowcaseBadges(ids);
    if (getCurrentUserId() !== userId) return;
    set({ friendShowcase });
  },

  openBadges(person = 'You') {
    set({ sheet: 'badges', viewingBadgesPerson: person });
    if (person !== 'You') void get().refreshFriendShowcase();
  },

  dismissBadgeCelebration() {
    set({ badgeCelebration: null });
  },

  dismissPrCelebration() {
    set({ prCelebration: null });
  },

  setShowcaseBadges(ids) {
    get().updateSettings({ showcaseBadges: ids });
    void friendsApi.pushOwnShowcase(ids);
  },

  toggleShowcaseBadge(id) {
    const current = get().settings.showcaseBadges ?? [];
    if (current.includes(id)) {
      get().setShowcaseBadges(current.filter((x) => x !== id));
      return 'removed';
    }
    if (current.length >= 3) return 'full';
    get().setShowcaseBadges([...current, id]);
    return 'added';
  },

  markFirstComparison() {
    if (get().settings.firstComparisonAt != null) return;
    get().updateSettings({ firstComparisonAt: Date.now() });
    reconcileOwnBadges(get, set, true);
  },

  // Returns the resolved profileId alongside the result. FriendsSheet needs
  // it to tell "a request is pending" apart from "they already sent you one"
  // — it used to compare the typed email against the pending requests', but
  // clients can't read anyone's email any more (see the Phase 14 grants).
  async sendFriendRequest(email) {
    const profile = await friendsApi.searchProfileByEmail(email);
    if (!profile) return { ok: false, reason: 'not-found' };
    const result = await get().sendFriendRequestToProfile(profile.id);
    return { ...result, profileId: profile.id };
  },

  async sendFriendRequestToProfile(profileId) {
    const result = await friendsApi.sendFriendRequest(profileId);
    if (result.ok) void get().refreshFriends();
    return result;
  },

  async acceptFriendRequest(friendshipId) {
    try {
      await friendsApi.acceptFriendRequest(friendshipId);
      void get().refreshFriends();
    } catch (err) {
      console.error('Failed to accept friend request', err);
      get().showToast('Could not accept — try again');
    }
  },

  async declineFriendRequest(friendshipId) {
    try {
      await friendsApi.declineFriendRequest(friendshipId);
      void get().refreshFriends();
    } catch (err) {
      console.error('Failed to decline friend request', err);
      get().showToast('Could not decline — try again');
    }
  },

  removeFriend(friendshipId, pending = false) {
    // A pending outgoing request was never accepted, so the "you'll both
    // lose access to each other's stats" framing (written for an actual
    // established friendship) doesn't apply — cancelling it is lower-stakes
    // than removing a real friend, so it gets its own wording and isn't
    // styled as a destructive/danger action.
    const message = pending ? 'Cancel this friend request?' : 'Remove this friend? You\'ll both lose access to each other\'s stats.';
    const yesLabel = pending ? 'Yes, cancel' : 'Yes, remove';
    const errorMessage = pending ? 'Could not cancel — try again' : 'Could not remove — try again';
    get().confirm(message, yesLabel, () => {
      void friendsApi
        .removeFriend(friendshipId)
        .then(() => get().refreshFriends())
        .catch((err) => {
          console.error('Failed to remove friend', err);
          get().showToast(errorMessage);
        });
    }, !pending, pending ? 'Keep it' : 'Cancel');
  },

  async refreshBody() {
    // Same staleness guard as refreshFriends/syncWithCloud — a fast account
    // switch must not let a slower, still-in-flight response from the
    // previous account land after the next account's and overwrite it.
    const userId = getCurrentUserId();
    if (!userId) return;
    try {
      // Push anything queued locally (e.g. a profile/weight edit made while
      // offline) before fetching — otherwise this can race flushPendingSync
      // and overwrite the not-yet-pushed edit with the stale remote value,
      // or drop an unsynced bodyLog/waterLog entry from the in-memory store
      // (still safe on disk, but confusingly missing from the UI until the
      // next full reload). Mirrors syncWithCloud()'s own opening line.
      await cloudSync.flushPendingSync();
      if (getCurrentUserId() !== userId) return;
      const [profile, bodyLog, waterLog, calorieLog] = await Promise.all([
        bodySync.fetchBodyProfile(),
        bodySync.fetchBodyLog(),
        bodySync.fetchWaterLog(),
        bodySync.fetchCalorieLog(),
      ]);
      if (getCurrentUserId() !== userId) return;
      if (profile) await db.bodyProfile.put({ id: 'current', ...profile });
      await db.bodyLog.bulkPut(bodyLog);
      await db.waterLog.bulkPut(waterLog);
      await db.calorieLog.bulkPut(calorieLog);
      if (getCurrentUserId() !== userId) return;
      set({ bodyProfile: profile ?? get().bodyProfile, bodyLog, waterLog, calorieLog, bodyLoaded: true });
    } catch (err) {
      console.error('Failed to refresh body data', err);
    }
  },

  saveBodyProfile(patch) {
    const bodyProfile = { ...get().bodyProfile, ...patch, updatedAt: Date.now() };
    set({ bodyProfile });
    void db.bodyProfile.put({ id: 'current', ...bodyProfile });
    void bodySync.pushBodyProfile(bodyProfile);
  },

  logBodyMetrics(patch) {
    const existing = get().bodyLog.find((e) => e.loggedOn === patch.loggedOn);
    const entry: BodyLogEntry = {
      weightKg: null,
      bodyFatPct: null,
      waistCm: null,
      chestCm: null,
      armCm: null,
      thighCm: null,
      hipCm: null,
      neckCm: null,
      sleepHours: null,
      restingHr: null,
      energy: null,
      note: null,
      ...existing,
      ...patch,
    };
    set((s) => ({
      bodyLog: [...s.bodyLog.filter((e) => e.loggedOn !== entry.loggedOn), entry].sort((a, b) =>
        a.loggedOn.localeCompare(b.loggedOn),
      ),
    }));
    void db.bodyLog.put(entry);
    void bodySync.pushBodyLogEntry(entry);
  },

  addWater(ml) {
    const entry: WaterLogEntry = {
      id: crypto.randomUUID(),
      loggedOn: todayIso(),
      amountMl: ml,
      loggedAt: Date.now(),
    };
    set((s) => ({ waterLog: [...s.waterLog, entry] }));
    void db.waterLog.put(entry);
    void bodySync.pushWaterLogEntry(entry);
  },

  clearWaterToday() {
    const today = todayIso();
    const todayIds = get().waterLog.filter((e) => e.loggedOn === today).map((e) => e.id);
    if (todayIds.length === 0) return;
    set((s) => ({ waterLog: s.waterLog.filter((e) => e.loggedOn !== today) }));
    void db.waterLog.bulkDelete(todayIds);
    todayIds.forEach((id) => void bodySync.deleteWaterLogEntryRemote(id));
  },

  // Fixes a single mis-logged entry (e.g. "500" fat-fingered as "5000")
  // without wiping the whole day the way clearWaterToday() does.
  deleteWaterEntry(id) {
    set((s) => ({ waterLog: s.waterLog.filter((e) => e.id !== id) }));
    void db.waterLog.delete(id);
    void bodySync.deleteWaterLogEntryRemote(id);
  },

  addCalories(kcal) {
    const entry: CalorieLogEntry = {
      id: crypto.randomUUID(),
      loggedOn: todayIso(),
      amountKcal: kcal,
      loggedAt: Date.now(),
    };
    set((s) => ({ calorieLog: [...s.calorieLog, entry] }));
    void db.calorieLog.put(entry);
    void bodySync.pushCalorieLogEntry(entry);
  },

  clearCaloriesToday() {
    const today = todayIso();
    const todayIds = get().calorieLog.filter((e) => e.loggedOn === today).map((e) => e.id);
    if (todayIds.length === 0) return;
    set((s) => ({ calorieLog: s.calorieLog.filter((e) => e.loggedOn !== today) }));
    void db.calorieLog.bulkDelete(todayIds);
    todayIds.forEach((id) => void bodySync.deleteCalorieLogEntryRemote(id));
  },

  // Same as deleteWaterEntry — fixes one entry without wiping the whole day.
  deleteCalorieEntry(id) {
    set((s) => ({ calorieLog: s.calorieLog.filter((e) => e.id !== id) }));
    void db.calorieLog.delete(id);
    void bodySync.deleteCalorieLogEntryRemote(id);
  },
}));

// Settings and friends are account-specific. Reset to defaults on sign-out
// so the sign-in screen always shows the plain mint theme rather than
// whatever the previous account had chosen, and so no friend/request data
// from one account is ever visible while a different account is signed in
// on this device — syncWithCloud()/refreshFriends() re-populate everything
// for whoever signs in next.
onSignedOut(() => {
  useStore.setState({
    // routines/sessions MUST be cleared here too. wipeLocalData() clears
    // Dexie on sign-out, but these in-memory arrays would otherwise survive,
    // and syncWithCloud's "remote is empty → seed from this device" branch
    // would then upload the signed-out account's workouts into the *next*
    // account signed in on this device (see deleteAccount, which signs out).
    routines: [],
    sessions: [],
    settings: DEFAULT_SETTINGS,
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    friendsLoaded: false,
    friendSessions: [],
    active: null,
    mode: 'tabs',
    bodyProfile: DEFAULT_BODY_PROFILE,
    bodyLog: [],
    waterLog: [],
    calorieLog: [],
    bodyLoaded: false,
  });
  saveSettings(DEFAULT_SETTINGS);
  applyTheme(DEFAULT_SETTINGS);
});

// Mirrors `active` to Dexie every time it changes (including to null, which
// deletes the record) instead of requiring every action that touches it to
// remember to persist — a single place that can't be missed as new
// active-session actions get added later.
//
// Writes are debounced (not deletes — those fire immediately, see below) —
// typing a weight/reps value commits per keystroke via setVal(), so without
// this, typing "125" would fire three separate IndexedDB writes. A pending
// write is flushed early if the tab is about to be hidden/evicted, so a
// backgrounded PWA getting killed (iOS does this aggressively) can't lose
// the last <400ms of edits the debounce alone would otherwise risk.
let lastPersistedActive: ActiveSession | null = null;
let persistTimer: ReturnType<typeof setTimeout> | undefined;
let pendingActive: ActiveSession | null = null;

function flushPendingActivePersist() {
  if (!persistTimer) return;
  clearTimeout(persistTimer);
  persistTimer = undefined;
  if (pendingActive) void db.activeSession.put({ id: 'current', ...pendingActive });
  pendingActive = null;
}

useStore.subscribe((state) => {
  if (state.active === lastPersistedActive) return;
  lastPersistedActive = state.active;
  if (persistTimer) clearTimeout(persistTimer);
  if (!state.active) {
    persistTimer = undefined;
    pendingActive = null;
    void db.activeSession.delete('current');
    return;
  }
  pendingActive = state.active;
  persistTimer = setTimeout(flushPendingActivePersist, 400);
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingActivePersist();
  });
}
