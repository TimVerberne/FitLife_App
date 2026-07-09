import type { WeekBucket } from '../lib/records';

export function BarChart({ weeks }: { weeks: WeekBucket[] }) {
  const w = weeks.length;
  const max = Math.max(1, ...weeks.map((x) => x.value));
  const H = 52;
  const gap = 2.4;
  const bw = (100 - gap * (w - 1)) / w;

  return (
    <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" width="100%" height="118">
      <defs>
        <linearGradient id="gBar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a3630" />
          <stop offset="1" stopColor="#181f1c" />
        </linearGradient>
        <linearGradient id="gAcc" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--accent)" stopOpacity="0.75" />
          <stop offset="1" stopColor="var(--accent)" stopOpacity="1" />
        </linearGradient>
      </defs>
      {weeks.map((wk, i) => {
        const bh = Math.max((wk.value / max) * H, 0.8);
        const x = i * (bw + gap);
        const isCurrent = i === w - 1;
        return <rect key={i} x={x} y={H - bh} width={bw} height={bh} rx={1} fill={isCurrent ? 'url(#gAcc)' : 'url(#gBar)'} />;
      })}
    </svg>
  );
}
