import { rollingAverage, seriesFor } from './bodyMetrics';
import type { BodyLogEntry } from './types';

const DAY = 86_400_000;

// Formulas are guesses; the logged weight trend is evidence. Needs at least
// this many days of history before the signal is trustworthy enough to
// suggest anything.
const MIN_DAYS_OF_DATA = 14;

// Adjust in modest steps, not dramatic jumps.
const ADJUSTMENT_STEP_KCAL = 150;

// Below this difference between predicted and actual weekly rate, the plan
// is already working — day-to-day noise means smaller gaps aren't a
// reliable signal to act on.
const ON_TRACK_THRESHOLD_KG_WEEK = 0.15;

export interface CalibrationResult {
  daysOfData: number;
  actualRateKgWeek: number;
  predictedRateKgWeek: number;
  onTrack: boolean;
  suggestedCalorieTarget: number | null;
}

// predictedRateKgWeek is signed to match the goal: negative for "lose",
// positive for "gain", 0 for "maintain" — so the same comparison works for
// all three without a special case.
export function calibrate(bodyLog: BodyLogEntry[], predictedRateKgWeek: number, currentCalorieTarget: number): CalibrationResult | null {
  const series = seriesFor(bodyLog, 'weightKg');
  if (series.length < 2) return null;

  const daysOfData = (series[series.length - 1].ts - series[0].ts) / DAY;
  if (daysOfData < MIN_DAYS_OF_DATA) return null;

  // Rolling averages, never day-to-day — a single heavy/light day is mostly
  // water and food weight, not a real signal.
  const avg = rollingAverage(series);
  const first = avg[0];
  const last = avg[avg.length - 1];
  const weeks = (last.ts - first.ts) / (7 * DAY);
  const actualRateKgWeek = (last.value - first.value) / weeks;

  const gap = predictedRateKgWeek - actualRateKgWeek;
  const onTrack = Math.abs(gap) < ON_TRACK_THRESHOLD_KG_WEEK;

  return {
    daysOfData: Math.round(daysOfData),
    actualRateKgWeek,
    predictedRateKgWeek,
    onTrack,
    // Losing/gaining slower than predicted -> move calories further from
    // maintenance; faster than predicted -> ease back toward maintenance.
    // Protein/fat stay pinned to bodyweight and carbs absorb this
    // automatically, since macros() always calculates in that order.
    suggestedCalorieTarget: onTrack ? null : currentCalorieTarget + Math.sign(gap) * ADJUSTMENT_STEP_KCAL,
  };
}
