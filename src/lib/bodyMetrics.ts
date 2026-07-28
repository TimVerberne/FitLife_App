import type { BodyLogEntry, WorkoutSession } from './types';

export interface DatedValue {
  ts: number;
  value: number;
}

const DAY = 86_400_000;

// Local calendar date as YYYY-MM-DD. Must be LOCAL, not UTC — a UTC date
// (toISOString) rolls over at the wrong wall-clock time for anyone off UTC,
// so evening logs in the Americas would land on tomorrow and the "today"
// ring would reset mid-afternoon. Also matches toTs() below, which parses
// loggedOn at *local* midnight, so keys and lookups agree.
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Shared by every Life-tab card that logs "today" — was copy-pasted
// verbatim in 7 different feature files before being hoisted here.
export function todayIso(): string {
  return localDateKey(new Date());
}

function toTs(loggedOn: string): number {
  return new Date(`${loggedOn}T00:00:00`).getTime();
}

// Consecutive-day logging streak, e.g. for "logged weight 12 days running".
// `loggedDates` is the set of local date keys (YYYY-MM-DD) that have an
// entry. Today not being logged YET doesn't break the streak (the day isn't
// over) — it only breaks once a full day is skipped, same grace as
// weeklyStreak gives the current in-progress week.
export function loggingStreakDays(loggedDates: Set<string>, now = new Date()): number {
  const cursor = new Date(now);
  if (!loggedDates.has(localDateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (loggedDates.has(localDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
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

export interface PeriodStats {
  first: DatedValue;
  last: DatedValue;
  change: number; // last - first, in the series' own unit
  perWeek: number | null; // average change per week; null if the span is < a day
  min: DatedValue;
  max: DatedValue;
  count: number;
}

// Summarises a series over whatever window the caller already filtered to.
// This is what turns "here's a line" into "you're down 2.4 kg since 3 Jun,
// about 0.4 kg a week" — the line alone doesn't say that.
export function periodStats(series: DatedValue[]): PeriodStats | null {
  if (series.length === 0) return null;
  const first = series[0];
  const last = series[series.length - 1];
  let min = first;
  let max = first;
  for (const p of series) {
    if (p.value < min.value) min = p;
    if (p.value > max.value) max = p;
  }
  const spanDays = (last.ts - first.ts) / DAY;
  const change = last.value - first.value;
  // A single day (or a single entry) can't imply a weekly rate — extrapolating
  // one weigh-in to "5 kg/week" would be nonsense, so say nothing instead.
  const perWeek = spanDays >= 1 ? (change / spanDays) * 7 : null;
  return { first, last, change, perWeek, min, max, count: series.length };
}

// Each entry paired with its change from the previous one, newest first —
// the "how much was I on this date" list.
export interface DatedChange {
  ts: number;
  value: number;
  delta: number | null; // vs the previous (older) entry; null for the oldest
}

export function withDeltas(series: DatedValue[]): DatedChange[] {
  return series
    .map((p, i) => ({ ts: p.ts, value: p.value, delta: i === 0 ? null : p.value - series[i - 1].value }))
    .reverse();
}

// Total minutes of your own logged sessions today — feeds the hydration
// training bonus (see hydration.ts's hydrationTarget()).
export function todaysTrainingMinutes(sessions: WorkoutSession[]): number {
  const today = todayIso();
  return sessions
    .filter((s) => s.person === 'You' && new Date(s.startedAt).toISOString().slice(0, 10) === today)
    .reduce((a, s) => a + s.durationMin, 0);
}
