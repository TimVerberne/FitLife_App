import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor } from '../../lib/bodyMetrics';
import { relativeStrength } from '../../lib/bodyComposition';
import { personalRecords } from '../../lib/records';
import { exerciseById } from '../../lib/exercises';
import { formatWeight } from '../../lib/units';
import { TapIcon } from '../../components/TapIcon';
import { activateOnKey } from '../../lib/a11y';

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
// instance omits it so it isn't tappable again inside itself. `showOneRepMax`
// adds the estimated 1RM weight under each bar — real derived numbers the
// dashboard's compact ratio-only view doesn't have room for.
export function RelativeStrengthCard({
  limit = TOP_LIFTS,
  onOpen,
  showOneRepMax = false,
}: {
  limit?: number | null;
  onOpen?: () => void;
  showOneRepMax?: boolean;
}) {
  const bodyLog = useStore((s) => s.bodyLog);
  const sessions = useStore((s) => s.sessions);
  const units = useStore((s) => s.settings.units);

  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));

  const topLifts = useMemo(() => {
    if (!latestWeightKg) return [];
    const all = personalRecords(sessions);
    return (limit != null ? all.slice(0, limit) : all).map((pr) => ({
      name: exerciseById(pr.exerciseId)?.name ?? pr.exerciseId,
      ratio: relativeStrength(pr.estOneRepMax, latestWeightKg),
      oneRepMaxKg: pr.estOneRepMax,
    }));
  }, [sessions, latestWeightKg, limit]);

  if (topLifts.length === 0) return null;
  const maxRatio = Math.max(...topLifts.map((l) => l.ratio));

  return (
    <div
      className="card"
      style={{ marginTop: 16, position: 'relative', cursor: onOpen ? 'pointer' : undefined }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? activateOnKey(onOpen) : undefined}
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
            {showOneRepMax && (
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--faint)', marginTop: 4 }}>
                est. 1RM {formatWeight(lift.oneRepMaxKg, units)} {units}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
