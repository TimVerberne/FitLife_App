import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { seriesFor } from '../../lib/bodyMetrics';
import { bmi, waistToHeightRatio } from '../../lib/bodyComposition';
import { MiniSparkline } from '../../components/MiniSparkline';
import { BodyCompositionCard } from './BodyCompositionCard';

const TREND_DAYS = 30;

// Beyond what the inline card shows (today's BMI/waist numbers only), the
// detail view adds the trend over time — derived from the same logged
// weight/waist entries, not a new measurement.
export function BodyCompositionDetailSheet() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);
  const heightCm = bodyProfile.heightCm;

  const bmiSeries = useMemo(() => {
    if (!heightCm) return [];
    return seriesFor(bodyLog, 'weightKg')
      .slice(-TREND_DAYS)
      .map((p) => bmi(p.value, heightCm));
  }, [bodyLog, heightCm]);

  const waistSeries = useMemo(() => {
    if (!heightCm) return [];
    return seriesFor(bodyLog, 'waistCm')
      .slice(-TREND_DAYS)
      .map((p) => waistToHeightRatio(p.value, heightCm));
  }, [bodyLog, heightCm]);

  return (
    <div className="sheet-in">
      <div className="sheet-h">Body composition</div>
      <BodyCompositionCard />

      {bmiSeries.length >= 2 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-h" style={{ margin: 0 }}>
            BMI trend
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <MiniSparkline values={bmiSeries} width={280} height={50} />
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Last {bmiSeries.length} logged days.
          </p>
        </div>
      )}

      {waistSeries.length >= 2 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="section-h" style={{ margin: 0 }}>
            Waist-to-height trend
          </div>
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <MiniSparkline values={waistSeries} width={280} height={50} />
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 11, marginTop: 8, marginBottom: 0 }}>
            Last {waistSeries.length} logged days — falling is the direction that matters here, not any single day's value.
          </p>
        </div>
      )}
    </div>
  );
}
