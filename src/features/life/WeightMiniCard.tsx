import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, rollingAverage, seriesFor, todayIso } from '../../lib/bodyMetrics';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../../lib/units';
import { MiniSparkline } from '../../components/MiniSparkline';
import { TapIcon } from '../../components/TapIcon';

// Compact companion to the full WeightCard further down the screen — same
// underlying data, condensed to number + 7-day avg + a tiny trend + a
// single log button. The full card (period picker, rolling-average chart)
// is untouched below.
export function WeightMiniCard() {
  const bodyLog = useStore((s) => s.bodyLog);
  const units = useStore((s) => s.settings.units);
  const logBodyMetrics = useStore((s) => s.logBodyMetrics);
  const openWeightDetail = useStore((s) => s.openWeightDetail);
  const [logging, setLogging] = useState(false);
  const [inputValue, setInputValue] = useState('');

  const today = todayIso();
  const todayEntry = bodyLog.find((e) => e.loggedOn === today);

  const fullSeries = useMemo(() => seriesFor(bodyLog, 'weightKg'), [bodyLog]);
  const latestKg = latestValue(fullSeries);
  const avgKg = latestValue(rollingAverage(fullSeries));
  const sparkValues = useMemo(() => fullSeries.slice(-14).map((p) => toDisplayWeight(p.value, units)), [fullSeries, units]);

  // Computed fresh at the moment the form opens (see WeightCard.tsx for why
  // a lazy useState initializer here would go stale).
  function toggleLogging() {
    if (!logging) setInputValue(todayEntry?.weightKg != null ? String(toDisplayWeight(todayEntry.weightKg, units)) : '');
    setLogging((v) => !v);
  }

  function save() {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    logBodyMetrics({ loggedOn: today, weightKg: fromDisplayWeight(parsed, units) });
    setLogging(false);
  }

  return (
    <div
      className="card"
      style={{ position: 'relative', cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      onClick={openWeightDetail}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openWeightDetail()}
    >
      <TapIcon />
      <div className="section-h" style={{ margin: 0 }}>
        Weight
      </div>
      {latestKg != null ? (
        <>
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26 }}>{formatWeight(latestKg, units)}</span>
            <span style={{ fontSize: 13, color: 'var(--faint)' }}>{units}</span>
          </div>
          {avgKg != null && <div style={{ color: 'var(--faint)', fontSize: 11, marginTop: 2 }}>7-day avg {formatWeight(avgKg, units)}</div>}
          {sparkValues.length >= 2 && (
            <div style={{ marginTop: 8 }}>
              <MiniSparkline values={sparkValues} width={130} height={30} />
            </div>
          )}
        </>
      ) : (
        <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 8 }}>No entries yet</p>
      )}

      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        {logging ? (
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
            <input
              type="number"
              inputMode="decimal"
              autoFocus
              value={inputValue}
              placeholder={units}
              style={{ flex: 1, minWidth: 0 }}
              onChange={(e) => setInputValue(e.target.value)}
            />
            <button className="btn" style={{ width: 'auto', padding: '0 12px' }} onClick={save}>
              Save
            </button>
          </div>
        ) : (
          <button className="btn" style={{ marginTop: 10 }} onClick={toggleLogging}>
            Log today
          </button>
        )}
      </div>
    </div>
  );
}
