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
  // Always populated regardless of which mode produced this target (a
  // kg/week rate, or a direct kcal number) — the single thing downstream
  // code (macros(), calibrate()) reads, so neither has to know or care
  // which input mode the user is in.
  effectiveGoal: NutritionGoal;
  effectiveRateKgWeek: number;
}

// A kcal number this close to maintenance just counts as "maintain" — no
// point forcing a 1% deficit/surplus distinction the estimate can't
// actually resolve. Shared between calorieTargetFromKcal() and the
// Nutrition card's own maintain-vs-not check.
export const MAINTENANCE_TOLERANCE_KCAL = 50;

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
    return {
      tdee: tdeeValue, target: tdeeValue, floor, maintenanceOnly: true, clampedToFloor: false, rateWarning: false,
      effectiveGoal: 'maintain', effectiveRateKgWeek: clampedRate,
    };
  }

  if (goal === 'maintain') {
    return {
      tdee: tdeeValue, target: tdeeValue, floor, maintenanceOnly: false, clampedToFloor: false, rateWarning: false,
      effectiveGoal: 'maintain', effectiveRateKgWeek: clampedRate,
    };
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
    effectiveGoal: goal,
    effectiveRateKgWeek: clampedRate,
  };
}

// A direct kcal/day target, as an alternative to specifying a kg/week rate
// — goal and rate are derived from comparing the target to TDEE rather
// than stored as separate user input, so there's exactly one number
// (manualKcalTarget) driving everything, no lossy round-trip through
// rateKgWeek that could drift from what was actually typed.
export function calorieTargetFromKcal(
  weightKg: number,
  heightCm: number,
  age: number,
  sex: SexAtBirth,
  activity: Activity,
  manualKcalTarget: number,
): CalorieTargetResult {
  const tdeeValue = tdee(bmr(weightKg, heightCm, age, sex), activity);
  const floor = CALORIE_FLOOR[sex];
  const isLosing = manualKcalTarget < tdeeValue - MAINTENANCE_TOLERANCE_KCAL;
  const isGaining = manualKcalTarget > tdeeValue + MAINTENANCE_TOLERANCE_KCAL;

  if (isLosing && bmi(weightKg, heightCm) < 18.5) {
    return {
      tdee: tdeeValue, target: tdeeValue, floor, maintenanceOnly: true, clampedToFloor: false, rateWarning: false,
      effectiveGoal: 'maintain', effectiveRateKgWeek: 0.5,
    };
  }

  const target = isLosing ? Math.max(manualKcalTarget, floor) : manualKcalTarget;
  const impliedRateKgWeek = Math.min(1, Math.max(0.1, (Math.abs(tdeeValue - target) * 7) / KCAL_PER_KG_FAT));

  return {
    tdee: tdeeValue,
    target,
    floor,
    maintenanceOnly: false,
    clampedToFloor: isLosing && manualKcalTarget < floor,
    rateWarning: impliedRateKgWeek > 0.75,
    effectiveGoal: isLosing ? 'lose' : isGaining ? 'gain' : 'maintain',
    effectiveRateKgWeek: impliedRateKgWeek,
  };
}

const PROTEIN_G_PER_KG = { min: 1.6, max: 2.2 };
// Lean-mass basis when body fat % is known — higher per-kg since it's a
// smaller mass being targeted (matters most for heavier users, where a
// bodyweight-based number would overshoot).
const PROTEIN_G_PER_KG_LEAN = { min: 2.3, max: 3.1 };
// More shows no added benefit for healthy adults and just displaces other
// macros — always relative to actual bodyweight regardless of basis.
const PROTEIN_CAP_G_PER_KG = 2.5;

const FAT_G_PER_KG = { min: 0.6, max: 1.0 };
// Fat is essential for hormone production and absorption of fat-soluble
// vitamins (A, D, E, K) — never generate a plan below this.
const FAT_FLOOR_G_PER_KG = 0.5;

// A remainder below this is a sign the deficit itself is too aggressive,
// not a real "low-carb plan" — flagged so it isn't silently prescribed.
const CARB_CRASH_G_PER_KG = 1.5;

const PROTEIN_KCAL_PER_G = 4;
const FAT_KCAL_PER_G = 9;
const CARB_KCAL_PER_G = 4;

export interface MacroResult {
  proteinBasis: 'bodyweight' | 'lean-mass';
  proteinG: number;
  proteinRangeG: [number, number];
  proteinPortions: number;
  fatG: number;
  fatRangeG: [number, number];
  carbsG: number;
  carbCrashWarning: boolean;
  fibreG: number;
}

// Order matters: protein and fat anchor to bodyweight/lean-mass first,
// carbs absorb whatever calories are left — so a calorie-target change only
// ever has to re-run this to get carbs to move, protein/fat stay pinned.
export function macros(
  weightKg: number,
  bodyFatPct: number | null,
  targetKcal: number,
  goal: NutritionGoal,
  rateKgWeek = 1,
): MacroResult {
  const leanBasis = bodyFatPct != null;
  const proteinMassKg = leanBasis ? weightKg * (1 - bodyFatPct / 100) : weightKg;
  const proteinRange = leanBasis ? PROTEIN_G_PER_KG_LEAN : PROTEIN_G_PER_KG;
  const midpoint = (proteinRange.min + proteinRange.max) / 2;
  // In a deficit, protein needs rise (protects muscle while calories drop) —
  // scaled by how aggressive the deficit actually is, from the midpoint at
  // the mildest allowed rate (0.1 kg/week) up to the top of the range at the
  // most aggressive one (1.0 kg/week), rather than jumping straight to the
  // range's ceiling for any "lose" goal regardless of how slow it is —
  // that used to hand a very mild cut the same maxed-out target as an
  // aggressive one.
  const deficitIntensity = Math.min(1, Math.max(0, (rateKgWeek - 0.1) / 0.9));
  const proteinPerKg = goal === 'lose' ? midpoint + (proteinRange.max - midpoint) * deficitIntensity : midpoint;
  const proteinCapG = weightKg * PROTEIN_CAP_G_PER_KG;
  const proteinG = Math.min(proteinMassKg * proteinPerKg, proteinCapG);
  const proteinRangeG: [number, number] = [proteinMassKg * proteinRange.min, Math.min(proteinMassKg * proteinRange.max, proteinCapG)];

  const fatPerKg = (FAT_G_PER_KG.min + FAT_G_PER_KG.max) / 2;
  const fatFloorG = weightKg * FAT_FLOOR_G_PER_KG;
  const fatG = Math.max(weightKg * fatPerKg, fatFloorG);
  const fatRangeG: [number, number] = [Math.max(weightKg * FAT_G_PER_KG.min, fatFloorG), weightKg * FAT_G_PER_KG.max];

  const carbsG = Math.max(0, (targetKcal - proteinG * PROTEIN_KCAL_PER_G - fatG * FAT_KCAL_PER_G) / CARB_KCAL_PER_G);

  return {
    proteinBasis: leanBasis ? 'lean-mass' : 'bodyweight',
    proteinG,
    proteinRangeG,
    // ~25 g of protein per palm-sized portion — a common rule-of-thumb
    // translation from an abstract gram figure to something actionable
    // without needing a food database.
    proteinPortions: Math.round(proteinG / 25),
    fatG,
    fatRangeG,
    carbsG,
    carbCrashWarning: carbsG / weightKg < CARB_CRASH_G_PER_KG,
    fibreG: fibreTarget(targetKcal),
  };
}

// ~14 g per 1,000 kcal (standard dietary-guideline basis) — ~28-35 g for most.
export function fibreTarget(targetKcal: number): number {
  return (targetKcal / 1000) * 14;
}
