import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor } from '../../lib/bodyMetrics';
import { hydrationTarget } from '../../lib/hydration';
import { formatVolume, fromDisplayVolume, toDisplayVolume } from '../../lib/units';
import { BarChart } from '../../components/BarChart';
import type { WeekBucket } from '../../lib/records';

// Fixed canonical amounts (a "glass" and a "bottle" are roughly fixed
// real-world quantities) — displayed converted to the user's unit setting,
// but the underlying add is always exactly 250/500 ml.
const QUICK_ADD_ML = [250, 500];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ProgressRing({ pct }: { pct: number }) {
  const size = 88;
  const stroke = 8;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const clamped = Math.min(1, Math.max(0, pct));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped)}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

export function HydrationCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);
  const waterLog = useStore((s) => s.waterLog);
  const sessions = useStore((s) => s.sessions);
  const addWater = useStore((s) => s.addWater);
  const units = useStore((s) => s.settings.units);
  const [customValue, setCustomValue] = useState('');

  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));
  const today = todayIso();

  const todaySessionMinutes = useMemo(
    () =>
      sessions
        .filter((s) => s.person === 'You' && new Date(s.startedAt).toISOString().slice(0, 10) === today)
        .reduce((a, s) => a + s.durationMin, 0),
    [sessions, today],
  );

  const target = useMemo(() => {
    if (!latestWeightKg) return null;
    return hydrationTarget(latestWeightKg, bodyProfile.climate, todaySessionMinutes, bodyProfile.sweatRateMlH);
  }, [latestWeightKg, bodyProfile.climate, bodyProfile.sweatRateMlH, todaySessionMinutes]);

  const todayTotalMl = useMemo(() => waterLog.filter((w) => w.loggedOn === today).reduce((a, w) => a + w.amountMl, 0), [waterLog, today]);

  const last7 = useMemo(() => {
    const days: WeekBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      const iso = d.toISOString().slice(0, 10);
      const total = waterLog.filter((w) => w.loggedOn === iso).reduce((a, w) => a + w.amountMl, 0);
      days.push({ label: d.toLocaleDateString('en-US', { weekday: 'short' }), value: toDisplayVolume(total, units) });
    }
    return days;
  }, [waterLog, units]);

  function addCustom() {
    const parsed = Number(customValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    addWater(fromDisplayVolume(parsed, units));
    setCustomValue('');
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

      <div style={{ marginTop: 14 }}>
        <BarChart weeks={last7} />
      </div>
    </div>
  );
}
