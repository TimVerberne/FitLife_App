import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor } from '../../lib/bodyMetrics';
import { relativeStrength } from '../../lib/bodyComposition';
import { personalRecords } from '../../lib/records';
import { exerciseById } from '../../lib/exercises';
import { TapIcon } from '../../components/TapIcon';

const TOP_LIFTS = 3;

// Extracted from BodyCompositionCard, which used to show this as a plain
// text list — now its own section with horizontal bars. Bar length is each
// lift's ratio scaled against the strongest lift shown (so the top lift's
// bar is full) — a relative comparison between your own lifts, not a
// fabricated "progress toward a goal." `limit` caps how many lifts show
// (the dashboard keeps the top 3; the detail sheet passes `null` for all of
// them — explicitly `null`, not omitted, since an omitted/undefined prop
// would just fall back to the default below). `onOpen`, when given, makes
// the whole card tappable to open that detail sheet — the sheet's own
// instance omits it so it isn't tappable again inside itself.
export function RelativeStrengthCard({ limit = TOP_LIFTS, onOpen }: { limit?: number | null; onOpen?: () => void }) {
  const bodyLog = useStore((s) => s.bodyLog);
  const sessions = useStore((s) => s.sessions);

  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));

  const topLifts = useMemo(() => {
    if (!latestWeightKg) return [];
    const all = personalRecords(sessions);
    return (limit != null ? all.slice(0, limit) : all).map((pr) => ({
      name: exerciseById(pr.exerciseId)?.name ?? pr.exerciseId,
      ratio: relativeStrength(pr.estOneRepMax, latestWeightKg),
    }));
  }, [sessions, latestWeightKg, limit]);

  if (topLifts.length === 0) return null;
  const maxRatio = Math.max(...topLifts.map((l) => l.ratio));

  return (
    <div
      className="card"
      style={{ marginTop: 16, position: 'relative', cursor: onOpen ? 'pointer' : undefined }}
      onClick={onOpen}
    >
      {onOpen && <TapIcon />}
      <div className="section-h" style={{ margin: 0 }}>
        Relative strength
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
        {topLifts.map((lift) => (
          <div key={lift.name}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--faint)' }}>
                {lift.name}
              </span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14 }}>{lift.ratio.toFixed(2)}×</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${(lift.ratio / maxRatio) * 100}%`, background: 'var(--accent)', borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
