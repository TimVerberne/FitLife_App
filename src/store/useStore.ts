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
import { exerciseById, isCardioExercise } from '../lib/exercises';
import { disarmNudge } from '../lib/pushNudges';
import { sortRoutines } from '../lib/records';
import { todayIso } from '../lib/bodyMetrics';
import type { ActiveSession, BodyLogEntry, BodyProfile, CalorieLogEntry, RestTimerState, Routine, SessionEntry, SetEntry, SetKind, WaterLogEntry, WorkoutSession } from '../lib/types';

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

  confirm(message: string, yesLabel: string, onYes: () => void, danger?: boolean, cancelLabel?: string): void;
  resolveDialog(yes: boolean): void;

  showToast(message: string): void;

  copyWorkoutToRoutines(sessionId: string): void;
  repeatWorkout(sessionId: string): void;
  setHistoryEditing(v: boolean): void;
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
  sendFriendRequest(email: string): Promise<friendsApi.SendFriendRequestResult | { ok: false; reason: 'not-found' }>;
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

export const useStore = create<StoreState>((set, get) => ({
  loaded: false,
  routines: [],
  sessions: [],

  tab: 'home',
  mode: 'tabs',
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
  importPreview: null,
  importing: false,

  dialog: null,
  toastMsg: '',

  settings: loadSettings(),
  quote: randomQuote(),

  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  friendsLoaded: false,
  friendSessions: [],

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
      const [routines, sessions, activeRecord, bodyProfileRecord, bodyLog, waterLog, calorieLog] = await Promise.all([
        db.routines.toArray(),
        db.sessions.toArray(),
        db.activeSession.get('current'),
        db.bodyProfile.get('current'),
        db.bodyLog.toArray(),
        db.waterLog.toArray(),
        db.calorieLog.toArray(),
      ]);
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
    } catch (err) {
      // IndexedDB unavailable (private browsing, restrictive webview, etc.) —
      // fall back to an empty in-memory session so the app still works, just without persistence.
      console.error('Local storage unavailable, falling back to in-memory data', err);
      set({ routines: [], sessions: [], loaded: true });
    }
  },

  go(tab) {
    set({ tab, mode: 'tabs', finishResult: null });
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
    if (turningOn && get().settings.hapticsOnSetComplete && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }
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
  },

  addSet(entryIdx) {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const ex = exerciseById(e.exerciseId);
      // A brand-new strength set with no prior row falls back to a
      // reasonable non-zero starting weight/reps — but that same fallback
      // must never apply to a cardio exercise's first set, or the leftover
      // reps/weight (never touched by the Min/Km inputs) would silently
      // count toward kg-lifted volume despite the UI showing neither field.
      const fallback = ex && isCardioExercise(ex)
        ? { reps: 0, weight: 0, durationSec: undefined, distanceKm: undefined }
        : { reps: 10, weight: 20, durationSec: undefined, distanceKm: undefined };
      const last = e.sets[e.sets.length - 1] ?? fallback;
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

  minimizeSession() {
    set((s) => ({ mode: 'tabs', tab: s.tab === 'train' ? 'home' : s.tab }));
  },

  restoreSession() {
    set({ mode: 'session' });
  },

  cancelSession() {
    get().confirm('Discard this workout? Your progress will be lost.', 'Yes, discard', () => {
      set({ active: null, mode: 'tabs', restTimer: null });
      void disarmNudge();
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
    const { sheet, detailReturnToPicker, pickerTargetSessionId } = get();
    if (sheet === 'detail' && detailReturnToPicker) {
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
        const ex = exerciseById(e.exerciseId);
        const fallback = ex && isCardioExercise(ex)
          ? { reps: 0, weight: 0, durationSec: 0, distanceKm: 0 }
          : { reps: 10, weight: 20, durationSec: undefined, distanceKm: undefined };
        const last = e.sets[e.sets.length - 1] ?? fallback;
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
    const { routines, sessions, settings, bodyProfile, bodyLog, waterLog, calorieLog } = get();
    const blob = new Blob(
      [JSON.stringify({ routines, sessions, settings, bodyProfile, bodyLog, waterLog, calorieLog }, null, 2)],
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

  clearAllData() {
    get().confirm('Delete all routines and workout history? This can\'t be undone.', 'Yes, delete everything', () => {
      const prevRoutines = get().routines;
      const prevSessions = get().sessions;
      void db.routines.clear();
      void db.sessions.clear();
      // Per-row deletes so a failed one gets queued in pendingSync and
      // retried, instead of silently leaving that row on the server to be
      // resurrected by the next sync (see confirmImport for the same fix).
      void Promise.all([
        ...prevRoutines.map((r) => cloudSync.deleteRoutineRemote(r.id)),
        ...prevSessions.filter((s) => s.person === 'You').map((s) => cloudSync.deleteSessionRemote(s.id)),
      ]);
      set({ routines: [], sessions: [], sheet: null });
      get().showToast('All data cleared');
    }, true);
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
        set({ settings: remoteSettings });
        saveSettings(remoteSettings);
        applyTheme(remoteSettings);
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
    } catch (err) {
      console.error('Failed to refresh friend sessions', err);
    }
  },

  async sendFriendRequest(email) {
    const profile = await friendsApi.searchProfileByEmail(email);
    if (!profile) return { ok: false, reason: 'not-found' };
    return get().sendFriendRequestToProfile(profile.id);
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
