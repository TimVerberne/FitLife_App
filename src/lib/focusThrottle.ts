// Multiple independent features each want to refresh themselves when the app
// regains focus (service worker update check, friend session refresh, cloud
// sync) — none of them know about each other, so without this, switching
// apps/tabs quickly (or the OS firing a spurious visibilitychange) fires all
// of them repeatedly with no minimum spacing, each pulling data over the
// network. Keyed so unrelated callers don't throttle each other.
const lastRunAt = new Map<string, number>();

export function throttleOnFocus(key: string, minIntervalMs: number, fn: () => void): void {
  const now = Date.now();
  const last = lastRunAt.get(key) ?? 0;
  if (now - last < minIntervalMs) return;
  lastRunAt.set(key, now);
  fn();
}
