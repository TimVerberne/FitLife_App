import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor, todayIso } from '../../lib/bodyMetrics';
import { periodCutoff, type StatPeriod } from '../../lib/records';
import { formatLength, fromDisplayLength, toDisplayLength } from '../../lib/units';
import { PeriodPicker } from '../../components/PeriodPicker';
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

function MeasurementRow({ site }: { site: (typeof SITES)[number] }) {
  const bodyLog = useStore((s) => s.bodyLog);
  const units = useStore((s) => s.settings.units);
  const logBodyMetrics = useStore((s) => s.logBodyMetrics);
  const today = todayIso();
  const [expanded, setExpanded] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [logDate, setLogDate] = useState(today);
  const [period, setPeriod] = useState<StatPeriod>('month');

  const series = useMemo(() => seriesFor(bodyLog, site.key), [bodyLog, site.key]);
  const latestCm = latestValue(series);
  const cutoff = periodCutoff(period);
  const inRange = useMemo(() => series.filter((p) => p.ts >= cutoff), [series, cutoff]);
  const points: ChartPoint[] = inRange.map((p) => ({ ts: p.ts, value: toDisplayLength(p.value, units) }));
  const panelId = `measurement-panel-${site.key}`;

  function save() {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    logBodyMetrics({ loggedOn: logDate, [site.key]: fromDisplayLength(parsed, units) });
    setInputValue('');
    setLogDate(today);
  }

  return (
    <div style={{ borderTop: '1px solid var(--line)', paddingTop: 10, marginTop: 10 }}>
      <button
        aria-expanded={expanded}
        aria-controls={panelId}
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
        <div id={panelId} style={{ marginTop: 8 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="date" value={logDate} max={today} onChange={(e) => setLogDate(e.target.value)} style={{ flex: 'none' }} />
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
          {series.length >= 2 && (
            <>
              <div style={{ marginTop: 10 }}>
                <PeriodPicker value={period} onChange={setPeriod} />
              </div>
              <ProgressChart
                points={points}
                formatValue={(v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units === 'lb' ? 'in' : 'cm'}`}
                formatDate={(ts) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
              />
            </>
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
