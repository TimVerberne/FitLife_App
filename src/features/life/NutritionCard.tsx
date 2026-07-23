import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';
import { useNutritionPlan } from '../../lib/useNutritionPlan';
import type { NutritionGoal } from '../../lib/types';
import { chipStyle } from './chipStyle';

const GOAL_OPTIONS: { id: NutritionGoal; label: string }[] = [
  { id: 'lose', label: 'Lose' },
  { id: 'maintain', label: 'Maintain' },
  { id: 'gain', label: 'Gain' },
];

// Commits only on blur/Enter, unlike NumberField's per-keystroke commit —
// typing "1800" digit by digit would otherwise flip the goal between
// lose/maintain/gain several times before the number is even finished.
function KcalTargetInput({ currentTarget, onCommit }: { currentTarget: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(Math.round(currentTarget)));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(Math.round(currentTarget)));
  }, [currentTarget, focused]);

  function commit() {
    const n = parseFloat(text);
    if (Number.isFinite(n) && n > 0) onCommit(Math.round(n));
    else setText(String(Math.round(currentTarget)));
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      value={text}
      onFocus={() => setFocused(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      style={{ width: 90 }}
    />
  );
}

export function NutritionCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const saveBodyProfile = useStore((s) => s.saveBodyProfile);
  const showToast = useStore((s) => s.showToast);

  // goalMode/manualKcalTarget live on the profile itself (not local state) —
  // otherwise reopening this card (a sheet, which remounts) would forget
  // which mode you were in and silently show "Rate" again with whatever
  // rateKgWeek happened to be clamped to, which is exactly what used to
  // read as "changes my goal back to 1kg per week."
  const plan = useNutritionPlan();
  const result = plan?.calories ?? null;
  const calibration = plan?.calibration ?? null;

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
              Fairly aggressive rate — {result.effectiveRateKgWeek.toFixed(1)} kg/week.
            </p>
          )}

          {/* Kept brief — the full "you've averaged X kg/week" breakdown
              already shows on the Today card this sheet was opened from, no
              need to restate it verbatim here. */}
          {calibration?.suggestedCalorieTarget != null && (
            <>
              <p style={{ color: 'var(--accent)', fontSize: 12, marginTop: 8, marginBottom: 0 }}>
                Based on the last {calibration.daysOfData} days, try ~{Math.round(calibration.suggestedCalorieTarget)} kcal to hit your goal.
              </p>
              <button
                className="btn sec"
                style={{ width: 'auto', padding: '5px 14px', fontSize: 12, marginTop: 8 }}
                onClick={() => {
                  const target = Math.round(calibration.suggestedCalorieTarget!);
                  saveBodyProfile({ goalMode: 'kcal', manualKcalTarget: target });
                  showToast(`Target updated to ${target} kcal`);
                }}
              >
                Apply {Math.round(calibration.suggestedCalorieTarget)} kcal
              </button>
            </>
          )}

          <p style={{ color: 'var(--faint)', fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Estimate only (Mifflin-St Jeor, typically within ~10% for most people, less precise for
            very muscular or very heavy individuals) — a starting point, never a verdict.
          </p>

          <div className="settings-row" style={{ marginTop: 14 }}>
            <div className="settings-row-label">Set goal by</div>
            <div className="seg" style={{ width: 140 }}>
              <button
                className={bodyProfile.goalMode === 'rate' ? 'on' : ''}
                onClick={() => saveBodyProfile({ goalMode: 'rate' })}
              >
                Rate
              </button>
              <button
                className={bodyProfile.goalMode === 'kcal' ? 'on' : ''}
                onClick={() => saveBodyProfile({ goalMode: 'kcal', manualKcalTarget: bodyProfile.manualKcalTarget ?? Math.round(result.target) })}
              >
                Kcal/day
              </button>
            </div>
          </div>

          {bodyProfile.goalMode === 'rate' ? (
            <>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
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
            </>
          ) : (
            <div className="settings-row">
              <div>
                <div className="settings-row-label">Target calories</div>
                <div className="settings-row-desc">
                  {result.effectiveGoal === 'maintain'
                    ? 'Maintaining'
                    : `${result.effectiveGoal === 'lose' ? 'Losing' : 'Gaining'} · ${result.effectiveRateKgWeek.toFixed(1)} kg/week`}
                </div>
              </div>
              <KcalTargetInput
                currentTarget={bodyProfile.manualKcalTarget ?? result.target}
                onCommit={(n) => saveBodyProfile({ manualKcalTarget: n })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
