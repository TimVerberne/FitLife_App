import type { Climate } from './types';

const ML_PER_KG = { min: 30, max: 35 };
const HOT_CLIMATE_BONUS_ML = 500;
const TRAINING_ML_PER_HOUR = { min: 500, max: 1000 };

export interface HydrationTargetResult {
  baseMl: number;
  climateBonusMl: number;
  trainingBonusMl: number;
  totalMl: number;
}

// Baseline 30-35 ml/kg/day (midpoint), plus a hot-climate bonus, plus a
// training bonus scaled by today's logged session duration (500-1000
// ml/hour midpoint, or a personally measured sweat rate if one's been
// calibrated — sweat rates vary several-fold between people, so a measured
// value beats the default whenever it's available).
export function hydrationTarget(weightKg: number, climate: Climate, todaySessionMinutes: number, sweatRateMlH: number | null): HydrationTargetResult {
  const baseMl = weightKg * ((ML_PER_KG.min + ML_PER_KG.max) / 2);
  const climateBonusMl = climate === 'hot' ? HOT_CLIMATE_BONUS_ML : 0;
  const perHour = sweatRateMlH ?? (TRAINING_ML_PER_HOUR.min + TRAINING_ML_PER_HOUR.max) / 2;
  const trainingBonusMl = (todaySessionMinutes / 60) * perHour;
  return { baseMl, climateBonusMl, trainingBonusMl, totalMl: baseMl + climateBonusMl + trainingBonusMl };
}

// From a before/after workout weigh-in (same clothing, towelled dry) — the
// accurate, personal version of the training bonus above.
export function sweatRateMlPerHour(weightBeforeKg: number, weightAfterKg: number, fluidDrunkMl: number, sessionHours: number): number {
  const sweatMl = (weightBeforeKg - weightAfterKg) * 1000 + fluidDrunkMl;
  return sweatMl / sessionHours;
}
