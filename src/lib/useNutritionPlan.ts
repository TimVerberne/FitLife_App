import { useMemo } from 'react';
import { useStore } from '../store/useStore';
import { latestValue, seriesFor } from './bodyMetrics';
import { calorieTarget, calorieTargetFromKcal, macros, type CalorieTargetResult, type MacroResult } from './nutrition';
import { calibrate, type CalibrationResult } from './calibration';

export interface NutritionPlan {
  calories: CalorieTargetResult;
  macroResult: MacroResult;
  calibration: CalibrationResult | null;
  predictedRateKgWeek: number;
}

// Shared by TodayCard, MacrosCard, and NutritionCard — all three
// independently rebuilt this exact calorieTarget()/calorieTargetFromKcal()
// -> macros() -> calibrate() pipeline, with the same null-guard conditions
// and the same goalMode branch. Returns null under the same conditions each
// card already individually checked for (missing weight/height/age/sex).
export function useNutritionPlan(): NutritionPlan | null {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);

  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));
  const latestBodyFatPct = latestValue(seriesFor(bodyLog, 'bodyFatPct'));
  const age = bodyProfile.birthYear ? new Date().getFullYear() - bodyProfile.birthYear : null;

  return useMemo(() => {
    if (!latestWeightKg || !bodyProfile.heightCm || !age || !bodyProfile.sexAtBirth) return null;
    const calories =
      bodyProfile.goalMode === 'kcal' && bodyProfile.manualKcalTarget != null
        ? calorieTargetFromKcal(latestWeightKg, bodyProfile.heightCm, age, bodyProfile.sexAtBirth, bodyProfile.activity, bodyProfile.manualKcalTarget)
        : calorieTarget(latestWeightKg, bodyProfile.heightCm, age, bodyProfile.sexAtBirth, bodyProfile.activity, bodyProfile.goal, bodyProfile.rateKgWeek);
    const macroResult = macros(latestWeightKg, latestBodyFatPct, calories.target, calories.effectiveGoal, calories.effectiveRateKgWeek);
    const predictedRateKgWeek =
      calories.effectiveGoal === 'lose' ? -calories.effectiveRateKgWeek : calories.effectiveGoal === 'gain' ? calories.effectiveRateKgWeek : 0;
    const calibration = calibrate(bodyLog, predictedRateKgWeek, calories.target);
    return { calories, macroResult, calibration, predictedRateKgWeek };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestWeightKg, latestBodyFatPct, bodyProfile, age, bodyLog]);
}
