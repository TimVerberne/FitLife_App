import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor } from '../../lib/bodyMetrics';
import { calorieTarget } from '../../lib/nutrition';
import type { NutritionGoal } from '../../lib/types';
import { chipStyle } from './chipStyle';

const GOAL_OPTIONS: { id: NutritionGoal; label: string }[] = [
  { id: 'lose', label: 'Lose' },
  { id: 'maintain', label: 'Maintain' },
  { id: 'gain', label: 'Gain' },
];

export function NutritionCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);
  const saveBodyProfile = useStore((s) => s.saveBodyProfile);

  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));
  const age = bodyProfile.birthYear ? new Date().getFullYear() - bodyProfile.birthYear : null;

  const result = useMemo(() => {
    if (!latestWeightKg || !bodyProfile.heightCm || !age || !bodyProfile.sexAtBirth) return null;
    return calorieTarget(
      latestWeightKg,
      bodyProfile.heightCm,
      age,
      bodyProfile.sexAtBirth,
      bodyProfile.activity,
      bodyProfile.goal,
      bodyProfile.rateKgWeek,
    );
  }, [latestWeightKg, bodyProfile, age]);

  if (!bodyProfile.sexAtBirth) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: 0 }}>
        Nutrition
      </div>

      {!result ? (
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>Log today's weight to see your calorie target.</p>
      ) : (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', gap: 24 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)' }}>MAINTENANCE</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22 }}>{Math.round(result.tdee)}</div>
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent)' }}>TARGET</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 22, color: 'var(--accent)' }}>
                {Math.round(result.target)}
              </div>
            </div>
          </div>

          {result.maintenanceOnly && (
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 8 }}>
              Your BMI is already on the low side, so this shows maintenance instead of a deficit —
              worth a chat with a professional if weight loss is still the goal.
            </p>
          )}
          {result.clampedToFloor && (
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 8 }}>
              This is below a safe minimum, so it's capped at {result.floor} kcal — consider a slower rate.
            </p>
          )}
          {result.rateWarning && !result.maintenanceOnly && (
            <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 8 }}>
              Fairly aggressive rate — {bodyProfile.rateKgWeek.toFixed(1)} kg/week.
            </p>
          )}

          <p style={{ color: 'var(--faint)', fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Estimate only (Mifflin-St Jeor, typically within ~10% for most people, less precise for
            very muscular or very heavy individuals) — a starting point, never a verdict.
          </p>

          <div style={{ display: 'flex', gap: 6, marginTop: 14 }}>
            {GOAL_OPTIONS.map((opt) => (
              <button key={opt.id} onClick={() => saveBodyProfile({ goal: opt.id })} style={{ ...chipStyle(bodyProfile.goal === opt.id), flex: 1 }}>
                {opt.label}
              </button>
            ))}
          </div>
          {bodyProfile.goal !== 'maintain' && (
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Target rate</div>
                <div className="settings-row-desc">{bodyProfile.rateKgWeek.toFixed(1)} kg/week</div>
              </div>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.1}
                value={bodyProfile.rateKgWeek}
                onChange={(e) => saveBodyProfile({ rateKgWeek: Number(e.target.value) })}
                style={{ width: 110 }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
