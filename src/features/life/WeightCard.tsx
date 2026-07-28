import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import {
  latestValue,
  loggingStreakDays,
  periodStats,
  rollingAverage,
  seriesFor,
  todayIso,
  trendDelta,
  withDeltas,
} from '../../lib/bodyMetrics';
import { periodCutoff, STAT_PERIOD_LABEL, type StatPeriod } from '../../lib/records';
import { formatWeight, fromDisplayWeight, toDisplayWeight } from '../../lib/units';
import { useCollapsedList } from '../../lib/useCollapsedList';
import { PeriodPicker } from '../../components/PeriodPicker';
import { ShowMoreButton } from '../../components/ShowMoreButton';
import { ProgressChart, type ChartPoint } from '../../components/ProgressChart';

export function WeightCard() {
  const bodyLog = useStore((s) => s.bodyLog);
  const bodyProfile = useStore((s) => s.bodyProfile);
  const units = useStore((s) => s.settings.units);
  const logBodyMetrics = useStore((s) => s.logBodyMetrics);
  const [period, setPeriod] = useState<StatPeriod>('month');
  const [logging, setLogging] = useState(false);

  const today = todayIso();
  const todayEntry = bodyLog.find((e) => e.loggedOn === today);
  const [inputValue, setInputValue] = useState('');
  const [logDate, setLogDate] = useState(today);

  const fullSeries = useMemo(() => seriesFor(bodyLog, 'weightKg'), [bodyLog]);
  const latestKg = latestValue(fullSeries);
  const deltaKg = trendDelta(fullSeries);
  const avgKg = latestValue(rollingAverage(fullSeries));
  const loggingStreak = useMemo(() => {
    const dates = new Set(bodyLog.filter((e) => e.weightKg != null).map((e) => e.loggedOn));
    return loggingStreakDays(dates);
  }, [bodyLog]);

  const cutoff = periodCutoff(period);
  const inRange = useMemo(() => fullSeries.filter((p) => p.ts >= cutoff), [fullSeries, cutoff]);
  const points: ChartPoint[] = inRange.map((p) => ({ ts: p.ts, value: toDisplayWeight(p.value, units) }));
  const avgPoints: ChartPoint[] = useMemo(
    () => rollingAverage(inRange).map((p) => ({ ts: p.ts, value: toDisplayWeight(p.value, units) })),
    [inRange, units],
  );

  // Everything the headline numbers and the dated list below are built from,
  // all scoped to the selected period so they agree with the chart above them.
  const stats = useMemo(() => periodStats(inRange), [inRange]);
  const history = useMemo(() => withDeltas(inRange), [inRange]);
  const historyList = useCollapsedList(history);
  const fmt = (kg: number) => `${formatWeight(kg, units)} ${units}`;
  // Which direction counts as progress depends on the goal — losing 2 kg is
  // good on a cut and bad on a bulk, so the accent can't just mean "down".
  // On 'maintain' neither direction is praised; movement is movement.
  const goal = bodyProfile.goal;
  function changeColor(kg: number): string {
    if (Math.abs(kg) < 0.05 || goal === 'maintain') return 'var(--ink)';
    const towardGoal = goal === 'lose' ? kg < 0 : kg > 0;
    return towardGoal ? 'var(--accent)' : 'var(--muted)';
  }
  // Signed, in display units — "+1.2 kg" / "−0.4 kg". Uses a real minus sign
  // so it lines up with the figures rather than reading as a hyphen.
  const fmtDelta = (kg: number) => `${kg >= 0 ? '+' : '−'}${formatWeight(Math.abs(kg), units)} ${units}`;
  const dateLabel = (ts: number) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' });

  function save() {
    const parsed = Number(inputValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    // Avoid lb→kg→lb rounding drift: if the entered display value matches
    // what the existing entry for this date already shows (an unchanged
    // re-save), keep the original stored kg instead of round-tripping it back
    // through the conversion (80 kg → 176.4 lb → 80.014 kg).
    const existing = bodyLog.find((e) => e.loggedOn === logDate);
    const unchanged = existing?.weightKg != null && Math.abs(toDisplayWeight(existing.weightKg, units) - parsed) < 0.05;
    const weightKg = unchanged ? existing!.weightKg! : fromDisplayWeight(parsed, units);
    logBodyMetrics({ loggedOn: logDate, weightKg });
    setLogging(false);
  }

  // Computed fresh at the moment the form opens rather than on mount — a
  // lazy useState initializer here would freeze whatever today's entry
  // looked like when the card first rendered, going stale if bodyLog is
  // still loading in (e.g. a cloud fetch resolving after mount).
  function toggleLogging() {
    if (!logging) {
      setInputValue(todayEntry?.weightKg != null ? String(toDisplayWeight(todayEntry.weightKg, units)) : '');
      setLogDate(today);
    }
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
          {loggingStreak >= 2 && (
            <div style={{ color: 'var(--accent)', fontSize: 12, marginTop: 2 }}>🔥 {loggingStreak}-day logging streak</div>
          )}
        </div>
        <button className="btn sec" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={toggleLogging}>
          {logging ? 'Cancel' : 'Log today'}
        </button>
      </div>

      {logging && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <input type="date" value={logDate} max={today} onChange={(e) => setLogDate(e.target.value)} style={{ flex: 'none' }} />
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

          {stats && stats.count >= 2 ? (
            <>
              {/* The headline the chart alone can't give you: how much, over
                  what span, and how fast. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 8,
                  flexWrap: 'wrap',
                  marginTop: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 900,
                    fontSize: 26,
                    color: changeColor(stats.change),
                  }}
                >
                  {stats.change === 0 ? 'No change' : fmtDelta(stats.change)}
                </span>
                <span style={{ fontSize: 12, color: 'var(--faint)' }}>
                  {STAT_PERIOD_LABEL[period].toLowerCase()} · {dateLabel(stats.first.ts)} → {dateLabel(stats.last.ts)}
                </span>
              </div>

              <div className="stat-grid" style={{ marginTop: 10 }}>
                <div className="stat-tile">
                  <div className="n" style={{ fontSize: 18 }}>{fmt(stats.first.value)}</div>
                  <div className="l">Start</div>
                </div>
                <div className="stat-tile">
                  <div className="n" style={{ fontSize: 18 }}>{fmt(stats.last.value)}</div>
                  <div className="l">Now</div>
                </div>
                <div className="stat-tile">
                  <div className="n" style={{ fontSize: 18 }}>
                    {stats.perWeek === null ? '—' : fmtDelta(stats.perWeek)}
                  </div>
                  <div className="l">Per week</div>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 8 }}>
                Low {fmt(stats.min.value)} ({dateLabel(stats.min.ts)}) · High {fmt(stats.max.value)} ({dateLabel(stats.max.ts)}) ·{' '}
                {stats.count} {stats.count === 1 ? 'entry' : 'entries'}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 10 }}>
              Only one entry in this range — pick a longer period to see a trend.
            </div>
          )}

          <ProgressChart
            points={points}
            avgPoints={avgPoints}
            // Body weight never approaches zero, so a 0-based axis flattens
            // months of real change into a straight line.
            fitToData
            formatValue={(v) => `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units}`}
            formatDate={dateLabel}
          />

          {/* Two series are plotted, so they're named rather than left to be
              told apart by dash pattern alone. */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', fontSize: 11, color: 'var(--faint)', marginTop: -4 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 2, background: 'var(--accent)', borderRadius: 1 }} /> Logged
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ width: 14, height: 2, background: 'var(--faint)', borderRadius: 1, opacity: 0.8 }} /> 7-day trend
            </span>
          </div>

          {history.length > 0 && (
            <>
              <div className="section-h" style={{ marginTop: 18 }}>Entries</div>
              {historyList.visible.map((h) => (
                <div
                  key={h.ts}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '8px 2px',
                    borderBottom: '1px solid var(--line-soft)',
                  }}
                >
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>
                    {new Date(h.ts).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
                      {fmt(h.value)}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: 62,
                        textAlign: 'right',
                        color: h.delta == null || Math.abs(h.delta) < 0.05 ? 'var(--faint-2)' : changeColor(h.delta),
                      }}
                    >
                      {h.delta == null ? '—' : Math.abs(h.delta) < 0.05 ? '±0' : fmtDelta(h.delta)}
                    </span>
                  </span>
                </div>
              ))}
              <ShowMoreButton hiddenCount={historyList.hiddenCount} expanded={historyList.expanded} onToggle={historyList.toggle} />
            </>
          )}
        </>
      )}
    </div>
  );
}
