export const REST_PRESETS = [5, 10, 15, 30, 45, 60, 75, 90, 105, 120];

export function formatRest(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const r = seconds % 60;
  return r === 0 ? `${m}m` : `${m}m ${r}s`;
}
