import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor } from '../../lib/bodyMetrics';
import { ProgressChart, type ChartPoint } from '../../components/ProgressChart';
import type { BodyLogEntry } from '../../lib/types';

const FIELDS: { key: keyof Pick<BodyLogEntry, 'sleepHours' | 'restingHr' | 'energy'>; label: string; unit: string; placeholder: string; max?: number }[] = [
  { key: 'sleepHours', label: 'Sleep', unit: 'hrs', placeholder: 'hrs' },
  { key: 'restingHr', label: 'Resting HR', unit: 'bpm', placeholder: 'bpm' },
  { key: 'energy', label: 'Energy', unit: '/5', placeholder: '1-5', max: 5 },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function WellnessRow({ field }: { field: (typeof FIELDS)[number] }) {
  const bodyLog = useStore((s) => s.bodyLog);
  const logBodyMetrics = useStore((s) => s.logBodyMetrics);
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const series = useMemo(() => seriesFor(bodyLog, field.key), [bodyLog, field.key]);
  const latest = latestValue(series);
  const points: ChartPoint[] = series;

  function save() {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const value = field.max ? Math.min(field.max, Math.round(parsed)) : parsed;
    logBodyMetrics({ loggedOn: todayIso(), [field.key]: value });
    setInputValue('');
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'transparent',
          border: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          padding: 0,
        }}
      >
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>{field.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--faint)', fontSize: 13 }}>{latest != null ? `${latest}${field.unit}` : '—'}</span>
          <span style={{ color: 'var(--faint)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              inputMode="decimal"
              max={field.max}
              value={inputValue}
              placeholder={field.placeholder}
              style={{ flex: 1 }}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <button className="btn" style={{ width: 'auto', padding: '0 18px' }} onClick={save}>
              Log
            </button>
          </div>
          {points.length >= 2 && (
            <ProgressChart
              points={points}
              formatValue={(v) => `${Math.round(v * 10) / 10}${field.unit}`}
              formatDate={(ts) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Optional and light-touch by design — no streaks, no scores, just a place
// to log and see the trend.
export function WellnessCard() {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: 0 }}>
        Wellness
      </div>
      {FIELDS.map((field) => (
        <WellnessRow key={field.key} field={field} />
      ))}
    </div>
  );
}
