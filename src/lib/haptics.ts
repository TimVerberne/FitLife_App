// iOS/WebKit doesn't implement the Vibration API at all — on an iPhone,
// navigator.vibrate simply isn't there, in a browser tab *or* an installed
// home-screen app. Every vibration in the app is already guarded, so nothing
// breaks; the problem is a settings toggle that silently does nothing with
// no explanation. Callers use this to say so out loud instead.
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

// Safe wrapper — a no-op wherever the API is missing.
export function vibrate(pattern: number | number[]): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers throw on odd patterns / while backgrounded.
  }
}

// The rest-timer alert: short-short-long, deliberately different from the
// single 15ms tap when a set is checked off, so it's distinguishable
// through a pocket without looking.
export const REST_END_PATTERN = [120, 80, 120, 80, 240];
