import { useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { latestValue, seriesFor } from '../../lib/bodyMetrics';
import { bmi, bmiLabel, waistToHeightRatio } from '../../lib/bodyComposition';
import { TapIcon } from '../../components/TapIcon';

// `onOpen`, when given, makes the whole card tappable to open a bigger
// detail sheet showing this same content — the sheet's own instance omits
// it so it isn't tappable again inside itself.
export function BodyCompositionCard({ onOpen }: { onOpen?: () => void } = {}) {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const bodyLog = useStore((s) => s.bodyLog);

  const weightSeries = useMemo(() => seriesFor(bodyLog, 'weightKg'), [bodyLog]);
  const waistSeries = useMemo(() => seriesFor(bodyLog, 'waistCm'), [bodyLog]);
  const latestWeightKg = latestValue(weightSeries);
  const latestWaistCm = latestValue(waistSeries);
  const heightCm = bodyProfile.heightCm;

  const bmiValue = heightCm && latestWeightKg ? bmi(latestWeightKg, heightCm) : null;
  const waistRatio = heightCm && latestWaistCm ? waistToHeightRatio(latestWaistCm, heightCm) : null;

  if (!heightCm) return null;

  return (
    <div
      className="card"
      style={{ marginTop: 16, position: 'relative', cursor: onOpen ? 'pointer' : undefined }}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={onOpen ? (e) => (e.key === 'Enter' || e.key === ' ') && onOpen() : undefined}
    >
      {onOpen && <TapIcon />}
      <div className="section-h" style={{ margin: 0 }}>
        Body composition
      </div>

      {bmiValue != null ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 24 }}>{bmiValue.toFixed(1)}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--faint)' }}>BMI · {bmiLabel(bmiValue)}</span>
          </div>
          <p style={{ color: 'var(--faint)', fontSize: 12, marginTop: 6, marginBottom: 0 }}>
            BMI can't tell muscle from fat, so it routinely misclassifies lifters — a muscular
            person often lands in "above typical" while being perfectly healthy. Treat this as one
            data point, not a grade. The waist-to-height trend below is more meaningful for a
            trained lifter.
          </p>
        </div>
      ) : (
        <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 8 }}>Log today's weight to see your BMI.</p>
      )}

      <div style={{ borderTop: '1px solid var(--line)', marginTop: 12, paddingTop: 12 }}>
        {waistRatio != null ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--faint)' }}>Waist-to-height</span>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>
              {waistRatio.toFixed(2)}
              {waistRatio >= 0.5 && <span style={{ color: 'var(--faint)', fontWeight: 400, fontSize: 11 }}> · above the 0.5 guideline</span>}
            </span>
          </div>
        ) : (
          <p style={{ color: 'var(--faint)', fontSize: 13, margin: 0 }}>Log your waist measurement to see this.</p>
        )}
      </div>
    </div>
  );
}
