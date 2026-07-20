import type { Activity, NutritionGoal, SexAtBirth } from './types';
import { bmi } from './bodyComposition';

const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  very: 1.725,
  extra: 1.9,
};

// ~1 kg of body fat is ~7,700 kcal — the basis for converting a target
// weekly rate of change into a daily calorie adjustment.
const KCAL_PER_KG_FAT = 7700;

// Conventional rule-of-thumb safe minimums, not precise medical thresholds —
// worded as guidance in the UI, but always enforced here regardless of what
// the formula would otherwise produce.
const CALORIE_FLOOR: Record<SexAtBirth, number> = { male: 1500, female: 1200 };

export function bmr(weightKg: number, heightCm: number, age: number, sex: SexAtBirth): number {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function tdee(bmrValue: number, activity: Activity): number {
  return bmrValue * ACTIVITY_FACTOR[activity];
}

export interface CalorieTargetResult {
  tdee: number;
  target: number;
  floor: number;
  // A loss target was suppressed entirely because BMI is already under 18.5
  // — target equals TDEE (maintenance) regardless of the requested rate.
  maintenanceOnly: boolean;
  // The formula wanted to go lower than the sex-specific floor; target was
  // clamped up to the floor instead.
  clampedToFloor: boolean;
  // Rate is above 0.75 kg/week — still allowed (hard cap is 1.0), but the UI
  // should call out that it's fairly aggressive.
  rateWarning: boolean;
}

export function calorieTarget(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: SexAtBirth,
  activity: Activity,
  goal: NutritionGoal,
  rateKgWeek: number,
): CalorieTargetResult {
  const tdeeValue = tdee(bmr(weightKg, heightCm, age, sex), activity);
  const floor = CALORIE_FLOOR[sex];
  const clampedRate = Math.min(1, Math.max(0.1, rateKgWeek));
  const rateWarning = clampedRate > 0.75;

  if (goal === 'lose' && bmi(weightKg, heightCm) < 18.5) {
    return { tdee: tdeeValue, target: tdeeValue, floor, maintenanceOnly: true, clampedToFloor: false, rateWarning: false };
  }

  if (goal === 'maintain') {
    return { tdee: tdeeValue, target: tdeeValue, floor, maintenanceOnly: false, clampedToFloor: false, rateWarning: false };
  }

  const dailyAdjustment = (clampedRate * KCAL_PER_KG_FAT) / 7;
  const rawTarget = goal === 'lose' ? tdeeValue - dailyAdjustment : tdeeValue + dailyAdjustment;
  const target = goal === 'lose' ? Math.max(rawTarget, floor) : rawTarget;

  return {
    tdee: tdeeValue,
    target,
    floor,
    maintenanceOnly: false,
    clampedToFloor: goal === 'lose' && rawTarget < floor,
    rateWarning,
  };
}
