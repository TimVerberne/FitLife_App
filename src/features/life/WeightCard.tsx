import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, rollingAverage, seriesFor, trendDelta } from '../../lib/bodyMetrics';
import { periodCutoff, type StatPeriod } from '../../lib/records';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../../lib/units';
import { PeriodPicker } from '../../components/PeriodPicker';
import { ProgressChart, type ChartPoint } from '../../components/ProgressChart';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function WeightCard() {
  const bodyLog = useStore((s) => s.bodyLog);
  const units = useStore((s) => s.settings.units);
  const logBodyMetrics = useStore((s) => s.logBodyMetrics);
  const [period, setPeriod] = useState<StatPeriod>('month');
  const [logging, setLogging] = useState(false);

  const today = todayIso();
  const todayEntry = bodyLog.find((e) => e.loggedOn === today);
  const [inputValue, setInputValue] = useState('');

  const fullSeries = useMemo(() => seriesFor(bodyLog, 'weightKg'), [bodyLog]);
  const latestKg = latestValue(fullSeries);
  const deltaKg = trendDelta(fullSeries);
  const avgKg = latestValue(rollingAverage(fullSeries));

  const cutoff = periodCutoff(period);
  const inRange = useMemo(() => fullSeries.filter((p) => p.ts >= cutoff), [fullSeries, cutoff]);
  const points: ChartPoint[] = inRange.map((p) => ({ ts: p.ts, value: toDisplayWeight(p.value, units) }));
  const avgPoints: ChartPoint[] = useMemo(
    () => rollingAverage(inRange).map((p) => ({ ts: p.ts, value: toDisplayWeight(p.value, units) })),
    [inRange, units],
  );

  function save() {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    logBodyMetrics({ loggedOn: today, weightKg: fromDisplayWeight(parsed, units) });
    setLogging(false);
  }

  // Computed fresh at the moment the form opens rather than on mount — a
  // lazy useState initializer here would freeze whatever today's entry
  // looked like when the card first rendered, going stale if bodyLog is
  // still loading in (e.g. a cloud fetch resolving after mount).
  function toggleLogging() {
    if (!logging) setInputValue(todayEntry?.weightKg != null ? String(toDisplayWeight(todayEntry.weightKg, units)) : '');
    setLogging((v) => !v);
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div className="section-h" style={{ margin: 0 }}>
            Weight
          </div>
          {latestKg != null ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 6 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30 }}>
                {formatWeight(latestKg, units)} {units}
              </span>
              {deltaKg != null && Math.abs(deltaKg) >= 0.1 && (
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--faint)' }}>
                  {deltaKg > 0 ? '▲' : '▼'} {formatWeight(Math.abs(deltaKg), units)} / 7d
                </span>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--faint)', fontSize: 13, marginTop: 6 }}>No entries yet</div>
          )}
          {avgKg != null && (
            <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 2 }}>7-day avg: {formatWeight(avgKg, units)} {units}</div>
          )}
        </div>
        <button className="btn sec" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={toggleLogging}>
          {logging ? 'Cancel' : 'Log today'}
        </button>
      </div>

      {logging && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input
            type="number"
            inputMode="decimal"
            autoFocus
            value={inputValue}
            placeholder={units}
            style={{ flex: 1 }}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button className="btn" style={{ width: 'auto', padding: '0 18px' }} onClick={save}>
            Save
          </button>
        </div>
      )}

      {fullSeries.length >= 2 && (
        <>
          <div style={{ marginTop: 14 }}>
            <PeriodPicker value={period} onChange={setPeriod} />
          </div>
          <ProgressChart
            points={points}
            avgPoints={avgPoints}
            formatValue={(v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units}`}
            formatDate={(ts) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
          />
        </>
      )}
    </div>
  );
}
