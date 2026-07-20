import type { Tab } from '../store/useStore';

export type Units = 'kg' | 'lb';
export type WeekStart = 'sun' | 'mon';
export type ThemeMode = 'dark' | 'light';
export type AccentPreset = 'mint' | 'blue' | 'orange' | 'violet' | 'red' | 'yellow' | 'teal' | 'pink';

export interface Settings {
  units: Units;
  weekStart: WeekStart;
  defaultRestSeconds: number | null;
  defaultTab: Tab;
  smartRoutineRotation: boolean;
  confirmRemoveExercise: boolean;
  keepScreenAwake: boolean;
  hapticsOnSetComplete: boolean;
  restTimerSound: boolean;
  theme: ThemeMode;
  accent: AccentPreset;
  notifyActiveWorkout: boolean;
  notifyActiveWorkoutRepeat: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  units: 'kg',
  weekStart: 'mon',
  defaultRestSeconds: null,
  defaultTab: 'home',
  smartRoutineRotation: true,
  confirmRemoveExercise: true,
  keepScreenAwake: false,
  hapticsOnSetComplete: true,
  restTimerSound: true,
  theme: 'dark',
  accent: 'mint',
  notifyActiveWorkout: false,
  notifyActiveWorkoutRepeat: true,
};

const STORAGE_KEY = 'fitflow-settings';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable (private browsing, quota) — settings just won't persist across reloads.
  }
}

export const ACCENT_PRESETS: Record<AccentPreset, { accent: string; accentInk: string; accentSoft: string }> = {
  mint: { accent: '#74e0ae', accentInk: '#00110a', accentSoft: 'rgba(116, 224, 174, 0.12)' },
  blue: { accent: '#5b8def', accentInk: '#050f24', accentSoft: 'rgba(91, 141, 239, 0.14)' },
  orange: { accent: '#f2994a', accentInk: '#241300', accentSoft: 'rgba(242, 153, 74, 0.14)' },
  violet: { accent: '#b58cf2', accentInk: '#180a24', accentSoft: 'rgba(181, 140, 242, 0.14)' },
  red: { accent: '#f2617a', accentInk: '#240a10', accentSoft: 'rgba(242, 97, 122, 0.14)' },
  yellow: { accent: '#f2c94c', accentInk: '#241d00', accentSoft: 'rgba(242, 201, 76, 0.14)' },
  teal: { accent: '#4fd1c5', accentInk: '#00201d', accentSoft: 'rgba(79, 209, 197, 0.14)' },
  pink: { accent: '#f28cd0', accentInk: '#240a1c', accentSoft: 'rgba(242, 140, 208, 0.14)' },
};

export function applyTheme(settings: Settings): void {
  const root = document.documentElement;
  root.dataset.theme = settings.theme;
  const preset = ACCENT_PRESETS[settings.accent];
  root.style.setProperty('--accent', preset.accent);
  root.style.setProperty('--accent-ink', preset.accentInk);
  root.style.setProperty('--accent-soft', preset.accentSoft);
}
