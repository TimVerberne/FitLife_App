import { create } from 'zustand';
import { db, seedIfEmpty } from '../lib/db';
import { SEED_ROUTINES, SEED_SESSIONS } from '../lib/seedData';
import type { ActiveSession, Routine, SessionEntry, SetKind, WorkoutSession } from '../lib/types';

export type Tab = 'home' | 'train' | 'stats' | 'you';
export type SheetKind = 'picker' | 'detail' | 'workout' | 'routineActions' | null;

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
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;

export const useStore = create<StoreState>((set, get) => ({
  loaded: false,
  routines: [],
  sessions: [],

  tab: 'home',
  mode: 'tabs',
  active: null,
  finishResult: null,

  sheet: null,
  detailExerciseId: null,
  viewingSessionId: null,
  viewingRoutineId: null,
  pickQuery: '',
  pickBodyPart: 'all',

  dialog: null,
  toastMsg: '',

  async init() {
    try {
      await seedIfEmpty();
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
      const active: ActiveSession = {
        routineId,
        name: routine ? routine.name : 'New routine',
        startedAt: Date.now(),
        entries: (routine ? routine.exerciseIds : []).map((exerciseId) => ({ exerciseId, sets: startingSetsFor(get().sessions, exerciseId) })),
      };
      set({ active, mode: 'session' });
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
    const entries = active.entries.map((e, ei) => {
      if (ei !== entryIdx) return e;
      const sets = e.sets.map((s, si) => (si === setIdx ? { ...s, done: !s.done } : s));
      return { ...e, sets };
    });
    set({ active: { ...active, entries } });
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
    set({ active: { ...active, entries: [...active.entries, { exerciseId, sets: startingSetsFor(get().sessions, exerciseId) }] } });
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
    set({
      active: { ...active, entries: [...active.entries, ...toAdd.map((exerciseId) => ({ exerciseId, sets: startingSetsFor(sessions, exerciseId) }))] },
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
      set({ active: null, mode: 'tabs' });
      get().showToast('Workout discarded');
    }, true, 'Keep training');
  },

  finishSession() {
    const active = get().active;
    if (!active) return;
    const entries = active.entries.filter((e) => e.sets.some((s) => s.done));
    if (entries.length === 0) {
      get().showToast('Log at least one set before finishing');
      return;
    }
    const durationMin = Math.max(1, Math.round((Date.now() - active.startedAt) / 60000));
    const newSession: WorkoutSession = {
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      person: 'You',
      name: active.name || 'Workout',
      routineId: active.routineId,
      startedAt: Date.now(),
      durationMin,
      entries,
    };
    void db.sessions.add(newSession);
    const exerciseIds = Array.from(new Set(active.entries.map((e) => e.exerciseId)));
    const newRoutine = !active.routineId && exerciseIds.length > 0;
    set((s) => ({
      sessions: [newSession, ...s.sessions],
      active: null,
      mode: 'finish',
      finishResult: { entries, durationMin, name: active.name, exerciseIds, newRoutine },
    }));
  },

  saveRoutineFromFinish(name, exerciseIds) {
    const routine: Routine = { id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, exerciseIds, createdAt: Date.now() };
    void db.routines.add(routine);
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
    set((s) => ({ routines: s.routines.map((r) => (r.id === id ? { ...r, name: trimmed } : r)), sheet: null }));
    get().showToast('Routine renamed');
  },

  deleteRoutine(id) {
    get().confirm('Delete this routine? This can\'t be undone.', 'Yes, delete', () => {
      void db.routines.delete(id);
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
    const session = get().sessions.find((s) => s.id === sessionId);
    if (!session) return;
    const exerciseIds = Array.from(new Set(session.entries.map((e) => e.exerciseId)));
    const routine: Routine = {
      id: `r-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${session.name} (from ${session.person})`,
      exerciseIds,
      createdAt: Date.now(),
    };
    void db.routines.add(routine);
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
        entries: session.entries.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.map((s) => ({ reps: s.reps, weight: s.weight, done: false })) })),
      };
      set({ active, mode: 'session' });
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
}));
