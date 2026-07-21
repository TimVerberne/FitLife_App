import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor, todayIso, todaysTrainingMinutes } from '../../lib/bodyMetrics';
import { hydrationTarget, sweatRateMlPerHour } from '../../lib/hydration';
import { formatVolume, fromDisplayVolume, fromDisplayWeight, toDisplayVolume } from '../../lib/units';
import { BarChart } from '../../components/BarChart';
import { ProgressRing } from '../../components/ProgressRing';
import type { WeekBucket } from '../../lib/records';

// Fixed canonical amounts (a "glass" and a "bottle" are roughly fixed
// real-world quantities) — displayed converted to the user's unit setting,
// but the underlying add is always exactly 250/500 ml.
const QUICK_ADD_ML = [250, 500];

// A before/after workout weigh-in is genuinely individual — sweat rates
// vary several-fold between people — so a measured value beats the
// 500-1000 ml/hour default whenever one's available.
function SweatRateCalibration({ defaultHours }: { defaultHours: number }) {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const saveBodyProfile = useStore((s) => s.saveBodyProfile);
  const showToast = useStore((s) => s.showToast);
  const units = useStore((s) => s.settings.units);
  const [open, setOpen] = useState(false);
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [drunk, setDrunk] = useState('');
  const [hours, setHours] = useState(defaultHours > 0 ? String(Math.round(defaultHours * 10) / 10) : '1');

  function compute() {
    const beforeKg = fromDisplayWeight(Number(before), units);
    const afterKg = fromDisplayWeight(Number(after), units);
    const drunkMl = fromDisplayVolume(Number(drunk) || 0, units);
    const sessionHours = Number(hours);
    if (!beforeKg || !afterKg || !sessionHours || beforeKg <= afterKg) {
      showToast('Check your numbers — weight before should be higher than after.');
      return;
    }
    const rate = sweatRateMlPerHour(beforeKg, afterKg, drunkMl, sessionHours);
    saveBodyProfile({ sweatRateMlH: Math.round(rate) });
    showToast(`Saved — ${Math.round(rate)} ml/hour`);
    setBefore('');
    setAfter('');
    setDrunk('');
    setOpen(false);
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', marginTop: 14, paddingTop: 12 }}>
      <button
        aria-expanded={open}
        aria-controls="sweat-rate-panel"
        onClick={() => setOpen((v) => !v)}
        style={{ width: '100%', display: 'flex', justifyContent: 'space-between', background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer', padding: 0 }}
      >
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--faint)' }}>
          {bodyProfile.sweatRateMlH != null ? `Sweat rate: ${bodyProfile.sweatRateMlH} ml/h · Recalibrate` : 'Calibrate your sweat rate'}
        </span>
        <span style={{ color: 'var(--faint)', fontSize: 11 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div id="sweat-rate-panel" style={{ marginTop: 10 }}>
          <p style={{ color: 'var(--faint)', fontSize: 11, marginTop: 0 }}>
            Weigh yourself right before and after a workout (same clothing, towelled dry) for a personal
            number instead of the 500-1000 ml/hour default.
          </p>
          <div className="settings-row">
            <div className="settings-row-label">Weight before ({units})</div>
            <input type="number" inputMode="decimal" value={before} style={{ width: 80 }} onChange={(e) => setBefore(e.target.value)} />
          </div>
          <div className="settings-row">
            <div className="settings-row-label">Weight after ({units})</div>
            <input type="number" inputMode="decimal" value={after} style={{ width: 80 }} onChange={(e) => setAfter(e.target.value)} />
          </div>
          <div className="settings-row">
            <div className="settings-row-label">Fluid drunk during</div>
            <input type="number" inputMode="decimal" value={drunk} placeholder={units === 'lb' ? 'fl oz' : 'ml'} style={{ width: 80 }} onChange={(e) => setDrunk(e.target.value)} />
          </div>
          <div className="settings-row">
            <div className="settings-row-label">Session length (hours)</div>
            <input type="number" inputMode="decimal" value={hours} style={{ width: 80 }} onChange={(e) => setHours(e.target.value)} />
          </div>
          <button className="btn" style={{ marginTop: 8 }} onClick={compute}>
            Save
          </button>
        </div>
      )}
    </div>
  );
}

export function HydrationCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);
  const waterLog = useStore((s) => s.waterLog);
  const sessions = useStore((s) => s.sessions);
  const addWater = useStore((s) => s.addWater);
  const clearWaterToday = useStore((s) => s.clearWaterToday);
  const deleteWaterEntry = useStore((s) => s.deleteWaterEntry);
  const confirm = useStore((s) => s.confirm);
  const units = useStore((s) => s.settings.units);
  const [customValue, setCustomValue] = useState('');

  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));
  const today = todayIso();

  const todaySessionMinutes = useMemo(() => todaysTrainingMinutes(sessions), [sessions]);

  const target = useMemo(() => {
    if (!latestWeightKg) return null;
    return hydrationTarget(latestWeightKg, bodyProfile.climate, todaySessionMinutes, bodyProfile.sweatRateMlH);
  }, [latestWeightKg, bodyProfile.climate, bodyProfile.sweatRateMlH, todaySessionMinutes]);

  const todayEntries = useMemo(() => waterLog.filter((w) => w.loggedOn === today), [waterLog, today]);
  const todayTotalMl = todayEntries.reduce((a, w) => a + w.amountMl, 0);

  const last7 = useMemo(() => {
    // Bucketed once instead of re-filtering the whole log per day — see
    // TodayCard.tsx's identical fix for the same O(7n) pattern.
    const totalsByDay = new Map<string, number>();
    waterLog.forEach((w) => totalsByDay.set(w.loggedOn, (totalsByDay.get(w.loggedOn) ?? 0) + w.amountMl));
    const days: WeekBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      days.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), value: toDisplayVolume(totalsByDay.get(iso) ?? 0, units) });
    }
    return days;
  }, [waterLog, units]);

  function addCustom() {
    const parsed = Number(customValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    addWater(fromDisplayVolume(parsed, units));
    setCustomValue('');
  }

  function clearToday() {
    confirm("Clear today's logged water?", 'Yes, clear', () => clearWaterToday(), true);
  }

  if (!target) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="section-h" style={{ margin: 0 }}>
          Hydration
        </div>
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>Log today's weight to see your hydration target.</p>
      </div>
    );
  }

  const pct = todayTotalMl / target.totalMl;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: 0 }}>
        Hydration
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10 }}>
        <div style={{ position: 'relative', width: 88, height: 88, flexShrink: 0 }}>
          <ProgressRing pct={pct} />
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 16 }}>{Math.round(pct * 100)}%</div>
          </div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>
            {formatVolume(todayTotalMl, units)} <span style={{ color: 'var(--faint)', fontWeight: 400 }}>of {formatVolume(target.totalMl, units)}</span>
          </div>
          <div style={{ color: 'var(--faint)', fontSize: 11, marginTop: 4 }}>
            {formatVolume(target.baseMl, units)} base
            {target.climateBonusMl > 0 && ` + ${formatVolume(target.climateBonusMl, units)} climate`}
            {target.trainingBonusMl > 0 && ` + ${formatVolume(target.trainingBonusMl, units)} training`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {QUICK_ADD_ML.map((ml) => (
          <button key={ml} className="btn sec" style={{ width: 'auto', flex: 1 }} onClick={() => addWater(ml)}>
            +{formatVolume(ml, units)}
          </button>
        ))}
        <input
          type="number"
          inputMode="decimal"
          value={customValue}
          placeholder="custom"
          style={{ width: 84, minWidth: 0 }}
          onChange={(e) => setCustomValue(e.target.value)}
        />
        <button className="btn sec" style={{ width: 'auto', padding: '0 14px' }} onClick={addCustom}>
          Add
        </button>
      </div>

      <p style={{ color: 'var(--faint)', fontSize: 11, marginTop: 10, marginBottom: 0 }}>
        A starting point, not a race — thirst and pale-straw urine colour are good real-world guides too.
      </p>

      {todayEntries.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {todayEntries.map((w) => (
            <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: 'var(--faint)' }}>{formatVolume(w.amountMl, units)}</span>
              <button
                aria-label="Delete this entry"
                onClick={() => deleteWaterEntry(w.id)}
                style={{ background: 'transparent', border: 'none', color: 'var(--faint)', fontSize: 15, lineHeight: 1, padding: '2px 4px', cursor: 'pointer' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {todayTotalMl > 0 && (
        <button
          onClick={clearToday}
          style={{ background: 'transparent', border: 'none', color: 'var(--faint)', fontSize: 12, padding: 0, marginTop: 8, cursor: 'pointer' }}
        >
          Clear today's water
        </button>
      )}

      <div style={{ marginTop: 14 }}>
        <BarChart weeks={last7} />
      </div>

      <SweatRateCalibration defaultHours={todaySessionMinutes / 60} />
    </div>
  );
}
