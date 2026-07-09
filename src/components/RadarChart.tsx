export function RadarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const cx = 110;
  const cy = 100;
  const R = 70;
  const n = labels.length;
  const max = Math.max(1, ...values);
  const ang = (i: number) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const pt = (i: number, r: number): [number, number] => [cx + Math.cos(ang(i)) * r, cy + Math.sin(ang(i)) * r];

  const gridRings = [0.34, 0.67, 1].map((f, gi) => (
    <polygon
      key={gi}
      points={labels.map((_, i) => pt(i, R * f).join(',')).join(' ')}
      fill="none"
      stroke="var(--line-dash)"
      strokeWidth={1}
    />
  ));

  const spokes = labels.map((_, i) => {
    const [x, y] = pt(i, R);
    return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--line-dash)" strokeWidth={1} />;
  });

  const labelEls = labels.map((lab, i) => {
    const [lx, ly] = pt(i, R + 15);
    const anchor = Math.abs(lx - cx) < 5 ? 'middle' : lx < cx ? 'end' : 'start';
    return (
      <text key={i} x={lx} y={ly + 4} textAnchor={anchor} fill="var(--muted)" fontSize={11} fontFamily="Barlow Condensed" fontWeight={700}>
        {lab}
      </text>
    );
  });

  const poly = values.map((v, i) => pt(i, (R * v) / max).join(',')).join(' ');
  const dots = values.map((v, i) => {
    const [x, y] = pt(i, (R * v) / max);
    return <circle key={i} cx={x} cy={y} r={2.6} fill="var(--accent)" />;
  });

  return (
    <svg viewBox="0 0 220 200" width="100%" height={205}>
      {gridRings}
      {spokes}
      <polygon points={poly} fill="var(--accent)" fillOpacity={0.24} stroke="var(--accent)" strokeWidth={2} />
      {dots}
      {labelEls}
    </svg>
  );
}
