import { useRef, useState } from 'react';

export interface ChartPoint {
  ts: number;
  value: number;
}

const WIDTH = 400;
const HEIGHT = 160;
// The plotted line/dots start exactly at PAD_LEFT, so reserving a left
// gutter wider than the y-axis label text keeps those labels from ever
// sitting underneath the first point on the line (they used to render at
// the same x as the leftmost dot and collide with it).
const PAD_LEFT = 34;
const PAD_RIGHT = 8;
const PAD_TOP = 26;
const PAD_BOTTOM = 22;

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const steps = [1, 2, 2.5, 5, 10];
  for (const step of steps) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

export function ProgressChart({
  points,
  formatValue,
  formatDate,
}: {
  points: ChartPoint[];
  formatValue: (v: number) => string;
  formatDate: (ts: number) => string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  if (points.length < 2) {
    return (
      <div className="chart-empty">Log this exercise a couple more times to see your progress here.</div>
    );
  }

  const minTs = points[0].ts;
  const maxTs = points[points.length - 1].ts;
  const tsSpan = Math.max(1, maxTs - minTs);
  const maxVal = niceCeiling(Math.max(...points.map((p) => p.value)));

  const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const xFor = (ts: number) => PAD_LEFT + ((ts - minTs) / tsSpan) * plotW;
  const yFor = (v: number) => PAD_TOP + plotH - (v / maxVal) * plotH;

  const coords = points.map((p) => ({ x: xFor(p.ts), y: yFor(p.value), p }));
  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

  function nearestIndex(clientX: number) {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const relX = ((clientX - rect.left) / rect.width) * WIDTH;
    let best = 0;
    let bestDist = Infinity;
    coords.forEach((c, i) => {
      const d = Math.abs(c.x - relX);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    return best;
  }

  function onPointerMove(e: React.PointerEvent) {
    if (e.buttons === 0 && e.pointerType !== 'touch') return;
    setActiveIdx(nearestIndex(e.clientX));
  }

  function onPointerDown(e: React.PointerEvent) {
    setActiveIdx(nearestIndex(e.clientX));
  }

  const active = activeIdx !== null ? coords[activeIdx] : null;
  const last = coords[coords.length - 1];

  // Keep the tooltip's own box inside the chart's horizontal bounds instead
  // of anchoring it dead-center on the point, which would clip off-canvas
  // for points near either edge.
  const tooltipX = active ? Math.min(Math.max(active.x, 46), WIDTH - 46) : 0;

  return (
    <div className="progress-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="progress-chart-svg"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => setActiveIdx(null)}
        onPointerLeave={() => setActiveIdx(null)}
      >
        {[0, 0.5, 1].map((f) => {
          const y = PAD_TOP + plotH * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD_LEFT} x2={WIDTH - PAD_RIGHT} y1={y} y2={y} className="chart-grid" />
              <text x={0} y={y - 4} className="chart-axis-label">
                {formatValue(maxVal * f)}
              </text>
            </g>
          );
        })}

        <path d={linePath} className="chart-line" fill="none" />

        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={i === coords.length - 1 ? 5 : 4} className="chart-dot" />
        ))}

        <text x={last.x} y={last.y - 12} textAnchor="end" className="chart-end-label">
          {formatValue(last.p.value)}
        </text>

        <text x={PAD_LEFT} y={HEIGHT - 4} className="chart-axis-label">
          {formatDate(points[0].ts)}
        </text>
        <text x={WIDTH - PAD_RIGHT} y={HEIGHT - 4} textAnchor="end" className="chart-axis-label">
          {formatDate(points[points.length - 1].ts)}
        </text>

        {active && (
          <g>
            <line x1={active.x} x2={active.x} y1={PAD_TOP} y2={PAD_TOP + plotH} className="chart-crosshair" />
            <circle cx={active.x} cy={active.y} r={6} className="chart-dot active" />
          </g>
        )}
      </svg>

      {active && (
        <div className="chart-tooltip" style={{ left: `${(tooltipX / WIDTH) * 100}%` }}>
          <div className="chart-tooltip-val">{formatValue(active.p.value)}</div>
          <div className="chart-tooltip-date">{formatDate(active.p.ts)}</div>
        </div>
      )}
    </div>
  );
}
