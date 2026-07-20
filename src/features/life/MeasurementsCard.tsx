import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor } from '../../lib/bodyMetrics';
import { formatLength, fromDisplayLength, toDisplayLength } from '../../lib/units';
import { ProgressChart, type ChartPoint } from '../../components/ProgressChart';
import type { BodyLogEntry } from '../../lib/types';

const SITES: { key: keyof Pick<BodyLogEntry, 'waistCm' | 'chestCm' | 'armCm' | 'thighCm' | 'hipCm' | 'neckCm'>; label: string }[] = [
  { key: 'waistCm', label: 'Waist' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'armCm', label: 'Arm' },
  { key: 'thighCm', label: 'Thigh' },
  { key: 'hipCm', label: 'Hip' },
  { key: 'neckCm', label: 'Neck' },
];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function MeasurementRow({ site }: { site: (typeof SITES)[number] }) {
  const bodyLog = useStore((s) => s.bodyLog);
  const units = useStore((s) => s.settings.units);
  const logBodyMetrics = useStore((s) => s.logBodyMetrics);
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const series = useMemo(() => seriesFor(bodyLog, site.key), [bodyLog, site.key]);
  const latestCm = latestValue(series);
  const points: ChartPoint[] = series.map((p) => ({ ts: p.ts, value: toDisplayLength(p.value, units) }));

  function save() {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    logBodyMetrics({ loggedOn: todayIso(), [site.key]: fromDisplayLength(parsed, units) });
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
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>{site.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'var(--faint)', fontSize: 13 }}>{latestCm != null ? formatLength(latestCm, units) : '—'}</span>
          <span style={{ color: 'var(--faint)', fontSize: 11 }}>{expanded ? '▲' : '▼'}</span>
        </span>
      </button>

      {expanded && (
        <div style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="number"
              inputMode="decimal"
              value={inputValue}
              placeholder={units === 'lb' ? 'in' : 'cm'}
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
              formatValue={(v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units === 'lb' ? 'in' : 'cm'}`}
              formatDate={(ts) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
            />
          )}
        </div>
      )}
    </div>
  );
}

export function MeasurementsCard() {
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: 0 }}>
        Measurements
      </div>
      {SITES.map((site) => (
        <MeasurementRow key={site.key} site={site} />
      ))}
    </div>
  );
}
