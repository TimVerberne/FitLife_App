import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor, todayIso, todaysTrainingMinutes } from '../../lib/bodyMetrics';
import { hydrationTarget } from '../../lib/hydration';
import { formatVolume } from '../../lib/units';
import { ProgressRing } from '../../components/ProgressRing';
import { TapIcon } from '../../components/TapIcon';
import { activateOnKey } from '../../lib/a11y';

const QUICK_ADD_ML = [250, 500];

// Compact companion to the full HydrationCard further down the screen —
// same target/total computation, condensed to ring + quick-add only. The
// full card (custom amount, 7-day history, sweat-rate calibration) is
// untouched below.
export function HydrationMiniCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);
  const waterLog = useStore((s) => s.waterLog);
  const sessions = useStore((s) => s.sessions);
  const addWater = useStore((s) => s.addWater);
  const units = useStore((s) => s.settings.units);
  const openHydrationDetail = useStore((s) => s.openHydrationDetail);

  const today = todayIso();
  const latestWeightKg = latestValue(seriesFor(bodyLog, 'weightKg'));
  const todaySessionMinutes = useMemo(() => todaysTrainingMinutes(sessions), [sessions]);

  const target = useMemo(() => {
    if (!latestWeightKg) return null;
    return hydrationTarget(latestWeightKg, bodyProfile.climate, todaySessionMinutes, bodyProfile.sweatRateMlH);
  }, [latestWeightKg, bodyProfile.climate, bodyProfile.sweatRateMlH, todaySessionMinutes]);

  const todayTotalMl = useMemo(() => waterLog.filter((w) => w.loggedOn === today).reduce((a, w) => a + w.amountMl, 0), [waterLog, today]);

  return (
    <div
      className="card"
      style={{ position: 'relative', cursor: 'pointer' }}
      role="button"
      tabIndex={0}
      onClick={openHydrationDetail}
      onKeyDown={activateOnKey(openHydrationDetail)}
    >
      <TapIcon />
      <div className="section-h" style={{ margin: 0 }}>
        Hydration
      </div>
      {!target ? (
        <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 8 }}>Log weight to see this.</p>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 10 }}>
            <ProgressRing pct={todayTotalMl / target.totalMl} size={72} stroke={7} />
          </div>
          <div style={{ textAlign: 'center', marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--faint)' }}>
            {formatVolume(todayTotalMl, units)} / {formatVolume(target.totalMl, units)}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10 }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            {QUICK_ADD_ML.map((ml) => (
              <button key={ml} className="btn sec" style={{ width: 'auto', flex: 1, padding: '6px 4px', fontSize: 11 }} onClick={() => addWater(ml)}>
                +{ml}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
