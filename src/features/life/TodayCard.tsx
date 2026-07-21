import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { todayIso } from '../../lib/bodyMetrics';
import { useNutritionPlan } from '../../lib/useNutritionPlan';
import { ProgressRing } from '../../components/ProgressRing';
import { BarChart } from '../../components/BarChart';
import { TapIcon } from '../../components/TapIcon';
import type { WeekBucket } from '../../lib/records';

const GOAL_VERB: Record<'lose' | 'maintain' | 'gain', string> = {
  lose: 'keep losing',
  maintain: 'hold steady',
  gain: 'keep gaining',
};

// Reused hex values, not new ones invented for this — matches the existing
// "orange"/"blue" ACCENT_PRESETS in src/lib/settings.ts.
const FAT_COLOR = '#f2994a';
const CARB_COLOR = '#5b8def';

function MacroTile({ label, grams, max, color, onOpen }: { label: string; grams: number; max: number; color: string; onOpen: () => void }) {
  const pct = max > 0 ? (grams / max) * 100 : 0;
  return (
    <div
      className="stat-tile"
      style={{ textAlign: 'left', padding: '10px 12px', position: 'relative', cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}
    >
      <TapIcon size={10} style={{ top: 6, right: 6 }} />
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 18 }}>
        {Math.round(grams)}
        <span style={{ fontSize: 12, fontWeight: 700 }}>g</span>
      </div>
      <div style={{ height: 4, borderRadius: 2, background: 'var(--surface-2)', marginTop: 6, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 2 }} />
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--faint)', marginTop: 6 }}>
        {label}
      </div>
    </div>
  );
}

// The "so what" card — everything else on this screen measures something;
// this is the one place that turns those numbers into "here's today's
// plan." Calories eaten is a single running daily total, logged exactly
// like the water counter elsewhere on this screen — no meal names, no
// per-food macros, no food database.
export function TodayCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);
  const calorieLog = useStore((s) => s.calorieLog);
  const addCalories = useStore((s) => s.addCalories);
  const clearCaloriesToday = useStore((s) => s.clearCaloriesToday);
  const deleteCalorieEntry = useStore((s) => s.deleteCalorieEntry);
  const confirm = useStore((s) => s.confirm);
  const openNutritionDetail = useStore((s) => s.openNutritionDetail);
  const openMacrosDetail = useStore((s) => s.openMacrosDetail);

  const today = todayIso();
  const [inputValue, setInputValue] = useState('');

  const loggedWeightToday = bodyLog.some((e) => e.loggedOn === today && e.weightKg != null);

  const plan = useNutritionPlan();

  // Filtering calorieLog to today's date is the entire "reset" mechanism —
  // a new day is just a loggedOn value with nothing logged against it yet,
  // same as every other "today" check throughout this feature.
  const todayEntries = useMemo(() => calorieLog.filter((e) => e.loggedOn === today), [calorieLog, today]);
  const todayKcal = todayEntries.reduce((a, e) => a + e.amountKcal, 0);

  const last7 = useMemo(() => {
    // Bucketed once (one pass over the whole log), then looked up per day —
    // filtering calorieLog fresh for each of the 7 days was O(7n) and only
    // gets more expensive as the log grows over months of use.
    const totalsByDay = new Map<string, number>();
    calorieLog.forEach((e) => totalsByDay.set(e.loggedOn, (totalsByDay.get(e.loggedOn) ?? 0) + e.amountKcal));
    const days: WeekBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      days.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), value: totalsByDay.get(iso) ?? 0 });
    }
    return days;
  }, [calorieLog]);

  function addCustom() {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    addCalories(Math.round(parsed));
    setInputValue('');
  }

  function clearToday() {
    confirm("Clear today's logged calories?", 'Yes, clear', () => clearCaloriesToday(), true);
  }

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

  const { calories, macroResult, calibration, predictedRateKgWeek } = plan;
  const pct = todayKcal / calories.target;
  const maxMacroG = Math.max(macroResult.proteinG, macroResult.fatG, macroResult.carbsG);

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: 0 }}>
        Today
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, position: 'relative', cursor: 'pointer' }}
        role="button"
        tabIndex={0}
        onClick={openNutritionDetail}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openNutritionDetail()}
      >
        <TapIcon />
        <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
          <ProgressRing pct={pct} size={96} stroke={9} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 21 }}>{Math.round(calories.target)}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '.08em', color: 'var(--faint)' }}>KCAL</div>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>
            {calories.effectiveGoal === 'lose' ? 'Losing' : calories.effectiveGoal === 'gain' ? 'Gaining' : 'Maintaining'}
            {calories.effectiveGoal !== 'maintain' ? ` · ${calories.effectiveRateKgWeek.toFixed(1)} kg/wk` : ''}
          </div>
          <p style={{ fontSize: 14, marginTop: 4, marginBottom: 0 }}>
            Aim for {Math.round(calories.target)} kcal today
            {calories.effectiveGoal !== 'maintain' ? ` to ${GOAL_VERB[calories.effectiveGoal]}` : ' to hold steady'}.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 16 }}>
        <MacroTile label="Protein" grams={macroResult.proteinG} max={maxMacroG} color="var(--accent)" onOpen={openMacrosDetail} />
        <MacroTile label="Fat" grams={macroResult.fatG} max={maxMacroG} color={FAT_COLOR} onOpen={openMacrosDetail} />
        <MacroTile label="Carbs" grams={macroResult.carbsG} max={maxMacroG} color={CARB_COLOR} onOpen={openMacrosDetail} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <input
          type="number"
          inputMode="decimal"
          value={inputValue}
          placeholder="kcal eaten"
          style={{ flex: 1 }}
          onChange={(e) => setInputValue(e.target.value)}
        />
        <button className="btn sec" style={{ width: 'auto', padding: '0 18px' }} onClick={addCustom}>
          Add
        </button>
      </div>

      {todayEntries.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {todayEntries.map((e) => (
            <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--faint)' }}>{Math.round(e.amountKcal)} kcal</span>
              <button
                aria-label="Delete this entry"
                onClick={() => deleteCalorieEntry(e.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--faint)', fontSize: 15, lineHeight: 1, padding: '2px 4px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {todayKcal > 0 && (
        <button
          onClick={clearToday}
          style={{ background: 'transparent', border: 'none', color: 'var(--faint)', fontSize: 12, padding: 0, marginTop: 8, cursor: 'pointer' }}
        >
          Clear today's kcal
        </button>
      )}

      {last7.some((d) => d.value > 0) && (
        <div style={{ marginTop: 12 }}>
          <BarChart weeks={last7} />
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 10 }}>
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
