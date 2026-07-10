import { create } from 'zustand';
import { db, seedIfEmpty, remapLegacyIdsToUuid, purgeDemoFriendRows } from '../lib/db';
import { SEED_ROUTINES, SEED_SESSIONS } from '../lib/seedData';
import { applyTheme, loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from '../lib/settings';
import { randomQuote } from '../lib/quotes';
import * as cloudSync from '../lib/cloudSync';
import * as friendsApi from '../lib/friends';
import type { Friend, FriendRequest } from '../lib/friends';
import { onSignedOut } from '../lib/supabase';
import type { ActiveSession, RestTimerState, Routine, SessionEntry, SetKind, WorkoutSession } from '../lib/types';

export type Tab = 'home' | 'train' | 'stats' | 'you';
export type SheetKind = 'picker' | 'detail' | 'workout' | 'routineActions' | 'settings' | 'friends' | null;

// Apply the persisted theme immediately on load, before the first paint.
applyTheme(loadSettings());

export interface FinishResult {
  entries: SessionEntry[];
  durationMin: number;
  name: string;
  exerciseIds: string[];
  newRoutine: boolean;
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
    return entry.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: false, kind: 'normal' as SetKind }));
  }
  // No history for this exercise — start with zero rows; the user adds sets manually.
  return [];
}

interface StoreState {
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
  viewingSessionId: string | null;
  viewingRoutineId: string | null;
  pickQuery: string;
  pickBodyPart: string;

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

  // actions
  init(): Promise<void>;
  go(tab: Tab): void;

  startSession(routineId: string | null): void;
  setSessionName(name: string): void;
  setVal(entryIdx: number, setIdx: number, field: 'reps' | 'weight', value: number): void;
  toggleSet(entryIdx: number, setIdx: number): void;
  addSet(entryIdx: number): void;
  removeSet(entryIdx: number, setIdx: number): void;
  setSetKind(entryIdx: number, setIdx: number, kind: SetKind): void;
  applyDropSet(entryIdx: number, setIdx: number, rounds: number): void;
  removeExercise(entryIdx: number): void;
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

  openPicker(): void;
  openDetail(id: string): void;
  openWorkoutSheet(id: string): void;
  openRoutineActions(id: string): void;
  renameRoutine(id: string, name: string): void;
  deleteRoutine(id: string): void;
  closeSheet(): void;
  setPickQuery(q: string): void;
  setPickBodyPart(bp: string): void;

  confirm(message: string, yesLabel: string, onYes: () => void, danger?: boolean, cancelLabel?: string): void;
  resolveDialog(yes: boolean): void;

  showToast(message: string): void;

  copyWorkoutToRoutines(sessionId: string): void;
  repeatWorkout(sessionId: string): void;
  updateHistorySet(sessionId: string, entryIdx: number, setIdx: number, field: 'reps' | 'weight', value: number): void;

  openSettings(): void;
  updateSettings(patch: Partial<Settings>): void;
  exportData(): void;
  importData(file: File): void;
  clearAllData(): void;

  syncWithCloud(userId: string): Promise<void>;

  openFriends(): void;
  refreshFriends(): Promise<void>;
  refreshFriendSessions(): Promise<void>;
  sendFriendRequest(email: string): Promise<friendsApi.SendFriendRequestResult | { ok: false; reason: 'not-found' }>;
  sendFriendRequestToProfile(profileId: string): Promise<friendsApi.SendFriendRequestResult>;
  acceptFriendRequest(friendshipId: string): Promise<void>;
  declineFriendRequest(friendshipId: string): Promise<void>;
  removeFriend(friendshipId: string): void;
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
let cloudSyncStarted = false;

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
  viewingSessionId: null,
  viewingRoutineId: null,
  pickQuery: '',
  pickBodyPart: 'all',

  dialog: null,
  toastMsg: '',

  settings: loadSettings(),
  quote: randomQuote(),

  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  friendsLoaded: false,
  friendSessions: [],

  async init() {
    // Reset synchronously (not just on first load) so a re-mount after switching
    // accounts can't leave syncWithCloud reading stale in-memory data from
    // whoever was signed in before, while this reload is still in flight.
    set({ tab: get().settings.defaultTab, loaded: false, routines: [], sessions: [] });
    try {
      await seedIfEmpty();
      await purgeDemoFriendRows();
      const [routines, sessions] = await Promise.all([db.routines.toArray(), db.sessions.toArray()]);
      set({ routines, sessions, loaded: true });
    } catch (err) {
      // IndexedDB unavailable (private browsing, restrictive webview, etc.) —
      // fall back to in-memory seed data so the app still works, just without persistence.
      console.error('Local storage unavailable, falling back to in-memory data', err);
      set({ routines: SEED_ROUTINES, sessions: SEED_SESSIONS, loaded: true });
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
    const restSeconds = turningOn ? active.restTimers[entry.exerciseId] : undefined;
    set({
      active: { ...active, entries },
      restTimer: restSeconds
        ? { exerciseId: entry.exerciseId, endsAt: Date.now() + restSeconds * 1000, total: restSeconds }
        : get().restTimer,
    });
  },

  addSet(entryIdx) {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const last = e.sets[e.sets.length - 1] ?? { reps: 10, weight: 20 };
      return { ...e, sets: [...e.sets, { reps: last.reps, weight: last.weight, done: false, kind: 'normal' as SetKind }] };
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
      const dropRounds = Array.from({ length: Math.max(1, rounds) }, () => ({
        reps: base.reps,
        weight: base.weight,
        done: false,
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
    set({ active: { ...active, entries: active.entries.filter((_, ei) => ei !== entryIdx) } });
  },

  addExerciseToSession(exerciseId) {
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
    const active = get().active;
    if (!active || exerciseIds.length === 0) return;
    const existing = new Set(active.entries.map((e) => e.exerciseId));
    const toAdd = exerciseIds.filter((id) => !existing.has(id));
    if (toAdd.length === 0) return;
    const { sessions } = get();
    const restTimers = { ...active.restTimers, ...defaultRestTimersFor(toAdd, get().settings.defaultRestSeconds) };
    set({
      active: { ...active, entries: [...active.entries, ...toAdd.map((exerciseId) => ({ exerciseId, sets: startingSetsFor(sessions, exerciseId) }))], restTimers },
    });
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
      get().showToast('Workout discarded');
    }, true, 'Keep training');
  },

  finishSession() {
    const active = get().active;
    if (!active) return;
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
      startedAt: Date.now(),
      durationMin,
      entries,
    };
    void db.sessions.add(newSession);
    void cloudSync.pushSession(newSession);
    const exerciseIds = Array.from(new Set(active.entries.map((e) => e.exerciseId)));
    const newRoutine = !active.routineId && exerciseIds.length > 0;
    set((s) => ({
      sessions: [newSession, ...s.sessions],
      active: null,
      mode: 'finish',
      restTimer: null,
      finishResult: { entries, durationMin, name: active.name, exerciseIds, newRoutine },
    }));
  },

  saveRoutineFromFinish(name, exerciseIds) {
    const routine: Routine = { id: crypto.randomUUID(), name, exerciseIds, createdAt: Date.now() };
    void db.routines.add(routine);
    void cloudSync.pushRoutine(routine);
    set((s) => ({ routines: [...s.routines, routine], tab: 'train', mode: 'tabs', finishResult: null }));
    get().showToast('Routine saved');
  },

  openPicker() {
    set({ sheet: 'picker' });
  },

  openDetail(id) {
    set({ sheet: 'detail', detailExerciseId: id });
  },

  openWorkoutSheet(id) {
    set({ sheet: 'workout', viewingSessionId: id });
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

  closeSheet() {
    const { sheet, active } = get();
    if (sheet === 'detail' && active) {
      set({ sheet: 'picker' });
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

  confirm(message, yesLabel, onYes, danger = false, cancelLabel = 'Cancel') {
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
        entries: session.entries.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: false, kind: s.kind })) })),
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
    set({ restTimer: { ...rt, endsAt: Math.max(Date.now(), rt.endsAt + deltaSeconds * 1000) } });
  },

  skipRestTimer() {
    set({ restTimer: null });
  },

  openSettings() {
    set({ sheet: 'settings' });
  },

  updateSettings(patch) {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    saveSettings(settings);
    if (patch.theme || patch.accent) applyTheme(settings);
    void cloudSync.pushSettings(settings);
  },

  exportData() {
    const { routines, sessions, settings } = get();
    const blob = new Blob([JSON.stringify({ routines, sessions, settings }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    get().showToast('Data exported');
  },

  importData(file) {
    file
      .text()
      .then((text) => {
        const data = JSON.parse(text) as { routines?: Routine[]; sessions?: WorkoutSession[]; settings?: Partial<Settings> };
        if (!Array.isArray(data.routines) || !Array.isArray(data.sessions)) {
          get().showToast('That file doesn\'t look like a FitFlow backup');
          return;
        }
        get().confirm('Import this backup? It will replace all current routines and workout history.', 'Import', () => {
          const { routines, sessions } = remapLegacyIdsToUuid(data.routines!, data.sessions!);
          void db.routines.clear().then(() => db.routines.bulkPut(routines));
          void db.sessions.clear().then(() => db.sessions.bulkPut(sessions));
          void cloudSync.replaceAllRemote(routines, sessions);
          const settings = data.settings ? { ...get().settings, ...data.settings } : get().settings;
          set({ routines, sessions, settings, sheet: null });
          saveSettings(settings);
          applyTheme(settings);
          void cloudSync.pushSettings(settings);
          get().showToast('Backup imported');
        }, true);
      })
      .catch(() => get().showToast('Could not read that file'));
  },

  clearAllData() {
    get().confirm('Delete all routines and workout history? This can\'t be undone.', 'Yes, delete everything', () => {
      void db.routines.clear();
      void db.sessions.clear();
      void cloudSync.clearAllRemote();
      set({ routines: [], sessions: [], sheet: null });
      get().showToast('All data cleared');
    }, true);
  },

  async syncWithCloud(userId) {
    if (cloudSyncStarted) return;
    cloudSyncStarted = true;
    const linkedKey = `fitflow-cloud-linked-${userId}`;
    try {
      await cloudSync.flushPendingSync();

      // Settings are account-specific, not device-specific — always adopt
      // whatever this account has saved in the cloud (or, if it has none
      // yet, seed the cloud with this device's current settings) regardless
      // of which branch below runs. This is what makes the theme/accent
      // switch to the signed-in account's own choice right after login.
      const remoteSettings = await cloudSync.fetchSettings();
      if (remoteSettings) {
        set({ settings: remoteSettings });
        saveSettings(remoteSettings);
        applyTheme(remoteSettings);
      } else {
        await cloudSync.pushSettings(get().settings);
      }

      if (localStorage.getItem(linkedKey) === '1') {
        // Already linked — pull in anything created on another device, additively only.
        const { newRoutines, newSessions } = await cloudSync.reconcileNewFromCloud(get().routines, get().sessions);
        if (newRoutines.length > 0) await db.routines.bulkPut(newRoutines);
        if (newSessions.length > 0) await db.sessions.bulkPut(newSessions);
        if (newRoutines.length > 0 || newSessions.length > 0) {
          set((s) => ({ routines: [...s.routines, ...newRoutines], sessions: [...s.sessions, ...newSessions] }));
        }
        return;
      }

      const counts = await cloudSync.remoteCounts();
      if (counts.routines === 0 && counts.sessions === 0) {
        // Brand-new account — this device's local history becomes the account's history.
        const { routines, sessions } = remapLegacyIdsToUuid(get().routines, get().sessions);
        await db.routines.clear();
        await db.routines.bulkPut(routines);
        await db.sessions.clear();
        await db.sessions.bulkPut(sessions);
        set({ routines, sessions });
        await cloudSync.uploadLocalDataOnFirstLogin(routines, sessions);
      } else {
        // Account already has data (signing in on a second device) — cloud
        // fully wins for routines and your own sessions.
        const remote = await cloudSync.fetchAllRemote();
        await db.routines.clear();
        await db.routines.bulkPut(remote.routines);
        await db.sessions.clear();
        await db.sessions.bulkPut(remote.sessions);
        set({ routines: remote.routines, sessions: remote.sessions });
      }
      localStorage.setItem(linkedKey, '1');
    } catch (err) {
      console.error('Cloud sync failed, will retry next load', err);
    } finally {
      cloudSyncStarted = false;
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
    try {
      const [friendsList, incomingRequests, outgoingRequests] = await Promise.all([
        friendsApi.fetchFriends(),
        friendsApi.fetchIncomingRequests(),
        friendsApi.fetchOutgoingRequests(),
      ]);
      set({ friends: friendsList, incomingRequests, outgoingRequests, friendsLoaded: true });
      void get().refreshFriendSessions();
    } catch (err) {
      console.error('Failed to refresh friends', err);
    }
  },

  async refreshFriendSessions() {
    try {
      const friendSessions = await friendsApi.fetchAllFriendSessions(get().friends);
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
    await friendsApi.acceptFriendRequest(friendshipId);
    void get().refreshFriends();
  },

  async declineFriendRequest(friendshipId) {
    await friendsApi.declineFriendRequest(friendshipId);
    void get().refreshFriends();
  },

  removeFriend(friendshipId) {
    get().confirm('Remove this friend? You\'ll both lose access to each other\'s stats.', 'Yes, remove', () => {
      void friendsApi.removeFriend(friendshipId).then(() => get().refreshFriends());
    }, true);
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
    settings: DEFAULT_SETTINGS,
    friends: [],
    incomingRequests: [],
    outgoingRequests: [],
    friendsLoaded: false,
    friendSessions: [],
  });
  saveSettings(DEFAULT_SETTINGS);
  applyTheme(DEFAULT_SETTINGS);
});
