import type { BodyLogEntry, WorkoutSession } from './types';

export interface DatedValue {
  ts: number;
  value: number;
}

const DAY = 86_400_000;

function toTs(loggedOn: string): number {
  return new Date(`${loggedOn}T00:00:00`).getTime();
}

type NumericBodyLogField = {
  [K in keyof BodyLogEntry]: BodyLogEntry[K] extends number | null ? K : never;
}[keyof BodyLogEntry];

// Extracts one numeric field (weight, waist, etc.) from the log as a
// chronological {ts, value} series, skipping days where it wasn't logged.
export function seriesFor(bodyLog: BodyLogEntry[], field: NumericBodyLogField): DatedValue[] {
  return bodyLog
    .filter((e) => typeof e[field] === 'number')
    .map((e) => ({ ts: toTs(e.loggedOn), value: e[field] as number }))
    .sort((a, b) => a.ts - b.ts);
}

// Trailing rolling average (default 7 days) — smooths day-to-day water/food
// weight noise so a single heavy day doesn't visibly spike the trend line.
export function rollingAverage(series: DatedValue[], windowDays = 7): DatedValue[] {
  const windowMs = windowDays * DAY;
  return series.map((point, i) => {
    const windowStart = point.ts - windowMs;
    const inWindow = series.slice(0, i + 1).filter((p) => p.ts > windowStart);
    const avg = inWindow.reduce((a, p) => a + p.value, 0) / inWindow.length;
    return { ts: point.ts, value: avg };
  });
}

export function latestValue(series: DatedValue[]): number | null {
  return series.length > 0 ? series[series.length - 1].value : null;
}

// Change over the last N days (default 7), computed on rolling averages
// rather than raw points so a single heavy/light day can't create a false
// trend swing on its own.
export function trendDelta(series: DatedValue[], daysAgo = 7): number | null {
  if (series.length === 0) return null;
  const avg = rollingAverage(series);
  const now = avg[avg.length - 1];
  const target = now.ts - daysAgo * DAY;
  let prior: DatedValue | null = null;
  for (const p of avg) {
    if (p.ts <= target) prior = p;
  }
  return prior ? now.value - prior.value : null;
}

// Total minutes of your own logged sessions today — feeds the hydration
// training bonus (see hydration.ts's hydrationTarget()).
export function todaysTrainingMinutes(sessions: WorkoutSession[]): number {
  const today = new Date().toISOString().slice(0, 10);
  return sessions
    .filter((s) => s.person === 'You' && new Date(s.startedAt).toISOString().slice(0, 10) === today)
    .reduce((a, s) => a + s.durationMin, 0);
}
