import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor, todaysTrainingMinutes } from '../../lib/bodyMetrics';
import { calorieTarget, macros } from '../../lib/nutrition';
import { hydrationTarget } from '../../lib/hydration';
import { calibrate } from '../../lib/calibration';
import { formatVolume } from '../../lib/units';

const GOAL_VERB: Record<'lose' | 'maintain' | 'gain', string> = {
  lose: 'keep losing',
  maintain: 'hold steady',
  gain: 'keep gaining',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// The "so what" card — everything else on this screen measures something;
// this is the one place that turns those numbers into "here's today's
// plan." No new data collection (still no food diary), just composing the
// same calorieTarget()/macros()/hydrationTarget()/calibrate() every other
// card already calls independently.
export function TodayCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);
  const sessions = useStore((s) => s.sessions);
  const units = useStore((s) => s.settings.units);

  const today = todayIso();
  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));
  const latestBodyFatPct = latestValue(seriesFor(bodyLog, 'bodyFatPct'));
  const age = bodyProfile.birthYear ? new Date().getFullYear() - bodyProfile.birthYear : null;
  const loggedWeightToday = bodyLog.some((e) => e.loggedOn === today && e.weightKg != null);

  const plan = useMemo(() => {
    if (!latestWeightKg || !bodyProfile.heightCm || !age || !bodyProfile.sexAtBirth) return null;
    const calories = calorieTarget(
      latestWeightKg,
      bodyProfile.heightCm,
      age,
      bodyProfile.sexAtBirth,
      bodyProfile.activity,
      bodyProfile.goal,
      bodyProfile.rateKgWeek,
    );
    const macroResult = macros(latestWeightKg, latestBodyFatPct, calories.target, bodyProfile.goal);
    const hydration = hydrationTarget(latestWeightKg, bodyProfile.climate, todaysTrainingMinutes(sessions), bodyProfile.sweatRateMlH);
    const predictedRateKgWeek = bodyProfile.goal === 'lose' ? -bodyProfile.rateKgWeek : bodyProfile.goal === 'gain' ? bodyProfile.rateKgWeek : 0;
    const calibration = calibrate(bodyLog, predictedRateKgWeek, calories.target);
    return { calories, macroResult, hydration, calibration, predictedRateKgWeek };
  }, [latestWeightKg, latestBodyFatPct, bodyProfile, age, sessions, bodyLog]);

  if (!bodyProfile.sexAtBirth) return null;

  if (!plan) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-h" style={{ margin: 0 }}>
          Today
        </div>
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>Log today's weight to see today's plan.</p>
      </div>
    );
  }

  const { calories, macroResult, hydration, calibration, predictedRateKgWeek } = plan;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: 0 }}>
        Today
      </div>

      <p style={{ fontSize: 15, marginTop: 10, marginBottom: 0 }}>
        Aim for <strong>~{Math.round(calories.target)} kcal</strong> today
        {bodyProfile.goal !== 'maintain' ? ` to ${GOAL_VERB[bodyProfile.goal]} at ${bodyProfile.rateKgWeek.toFixed(1)} kg/week` : ' to hold steady'}.
      </p>
      <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 6, marginBottom: 0 }}>
        {Math.round(macroResult.proteinG)}g protein · {Math.round(macroResult.fatG)}g fat · {Math.round(macroResult.carbsG)}g carbs
      </p>
      <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 4, marginBottom: 0 }}>
        {formatVolume(hydration.totalMl, units)} water
        {hydration.trainingBonusMl > 0 ? ' (includes today\'s training bonus)' : ''}
      </p>

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 10, paddingTop: 10 }}>
        {!calibration ? (
          <p style={{ color: 'var(--faint)', fontSize: 12, margin: 0 }}>
            Keep logging weight daily — a calibrated suggestion unlocks after 2 weeks.
          </p>
        ) : calibration.onTrack ? (
          <p style={{ color: 'var(--faint)', fontSize: 12, margin: 0 }}>
            The last {calibration.daysOfData} days track with your {predictedRateKgWeek === 0 ? 'maintain' : `${predictedRateKgWeek.toFixed(1)} kg/week`} goal.
          </p>
        ) : (
          <p style={{ color: 'var(--accent)', fontSize: 12, margin: 0 }}>
            You've averaged {calibration.actualRateKgWeek >= 0 ? '+' : ''}
            {calibration.actualRateKgWeek.toFixed(1)} kg/week over the last {calibration.daysOfData} days. Try ~
            {Math.round(calibration.suggestedCalorieTarget!)} kcal instead.
          </p>
        )}
      </div>

      {!loggedWeightToday && (
        <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 8, marginBottom: 0 }}>Haven't logged today's weight yet.</p>
      )}
    </div>
  );
}
