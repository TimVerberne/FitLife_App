import type { HeatmapDay } from '../lib/records';

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', ''];
const CELL = 15;
const GAP = 4;

function levelFor(volume: number, max: number): number {
  if (volume <= 0) return 0;
  const ratio = volume / max;
  if (ratio > 0.66) return 3;
  if (ratio > 0.33) return 2;
  return 1;
}

const LEVEL_COLOR = ['rgba(255,255,255,.07)', 'rgba(116,224,174,.32)', 'rgba(116,224,174,.64)', 'var(--accent)'];
const LEVEL_BORDER = ['1px solid rgba(255,255,255,.09)', 'none', 'none', 'none'];

export function TrainingHeatmap({ weeks }: { weeks: HeatmapDay[][] }) {
  const allDays = weeks.flat();
  const max = Math.max(1, ...allDays.map((d) => d.volume));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();
  const activeDays = allDays.filter((d) => d.date <= todayTime && d.volume > 0).length;

  const first = weeks[0]?.[0]?.date;
  const last = weeks[weeks.length - 1]?.[6]?.date;
  const rangeLabel =
    first && last
      ? `${new Date(first).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${new Date(last).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
      : '';

  // month label per column: show when the month changes vs the previous column
  let prevMonth = -1;
  const monthLabels = weeks.map((col) => {
    const d = new Date(col[0].date);
    const m = d.getMonth();
    if (m !== prevMonth) {
      prevMonth = m;
      return d.toLocaleDateString('en-US', { month: 'short' });
    }
    return '';
  });

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="chart-big" style={{ fontSize: 22 }}>{activeDays}</div>
          <div style={{ fontSize: 11, color: 'var(--faint)' }}>active days · last {weeks.length} weeks</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: GAP, overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 2, flex: 'none' }}>
          <div style={{ height: 14 }} />
          {DAY_LABELS.map((l, i) => (
            <div
              key={i}
              style={{
                height: CELL,
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                color: 'var(--faint)',
                display: 'flex',
                alignItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: GAP }}>
          {weeks.map((col, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
              <div
                style={{
                  height: 14,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--faint)',
                  whiteSpace: 'nowrap',
                }}
              >
                {monthLabels[wi]}
              </div>
              {col.map((day, di) => {
                const isToday = day.date === todayTime;
                const isFuture = day.date > todayTime;
                const level = levelFor(day.volume, max);
                return (
                  <div
                    key={di}
                    title={new Date(day.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 3,
                      background: isFuture ? 'transparent' : LEVEL_COLOR[level],
                      border: isFuture ? 'none' : LEVEL_BORDER[level],
                      boxShadow: isToday ? 'inset 0 0 0 1.5px var(--accent)' : 'none',
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--faint)' }}>{rangeLabel}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 10, color: 'var(--faint)', marginRight: 2 }}>Less</span>
          {LEVEL_COLOR.map((c, i) => (
            <div key={i} style={{ width: 10, height: 10, borderRadius: 2, background: c, border: LEVEL_BORDER[i] }} />
          ))}
          <span style={{ fontSize: 10, color: 'var(--faint)', marginLeft: 2 }}>More</span>
        </div>
      </div>
    </div>
  );
}
