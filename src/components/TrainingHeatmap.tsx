import type { HeatmapDay } from '../lib/records';

const DAY_LABELS = ['M', '', 'W', '', 'F', '', ''];
const CELL = 11;
const GAP = 3;

function levelFor(volume: number, max: number): number {
  if (volume <= 0) return 0;
  const ratio = volume / max;
  if (ratio > 0.66) return 3;
  if (ratio > 0.33) return 2;
  return 1;
}

const LEVEL_COLOR = ['var(--surface-2)', 'rgba(116,224,174,.28)', 'rgba(116,224,174,.6)', 'var(--accent)'];

export function TrainingHeatmap({ weeks }: { weeks: HeatmapDay[][] }) {
  const max = Math.max(1, ...weeks.flat().map((d) => d.volume));
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  const first = weeks[0]?.[0]?.date;
  const last = weeks[weeks.length - 1]?.[6]?.date;
  const rangeLabel =
    first && last
      ? `${new Date(first).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} – ${new Date(last).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`
      : '';

  return (
    <div>
      <div style={{ display: 'flex', gap: GAP }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: GAP, marginRight: 2 }}>
          {DAY_LABELS.map((l, i) => (
            <div
              key={i}
              style={{
                width: 12,
                height: CELL,
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: 'var(--faint)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              {l}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: GAP, overflowX: 'auto' }}>
          {weeks.map((col, wi) => (
            <div key={wi} style={{ display: 'flex', flexDirection: 'column', gap: GAP }}>
              {col.map((day, di) => {
                const isToday = day.date === todayTime;
                return (
                  <div
                    key={di}
                    title={new Date(day.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                    style={{
                      width: CELL,
                      height: CELL,
                      borderRadius: 2,
                      background: day.date > todayTime ? 'transparent' : LEVEL_COLOR[levelFor(day.volume, max)],
                      outline: isToday ? '1px solid var(--accent)' : 'none',
                      outlineOffset: -1,
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--faint)', marginTop: 8 }}>{rangeLabel}</div>
    </div>
  );
}
