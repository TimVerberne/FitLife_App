import { useStore } from '../../store/useStore';
import { useNutritionPlan } from '../../lib/useNutritionPlan';

function round(n: number): number {
  return Math.round(n);
}

export function MacrosCard() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const plan = useNutritionPlan();

  if (!bodyProfile.sexAtBirth || !plan) return null;
  const { macroResult } = plan;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: 0 }}>
        Macros
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>Protein</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>{round(macroResult.proteinG)} g</span>
          </div>
          <div style={{ color: 'var(--faint)', fontSize: 11, marginTop: 2 }}>
            {round(macroResult.proteinRangeG[0])}-{round(macroResult.proteinRangeG[1])} g range · ≈{macroResult.proteinPortions} palm-sized
            portions · based on {macroResult.proteinBasis === 'lean-mass' ? 'lean mass (body fat % logged)' : 'bodyweight'}
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>Fat</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>{round(macroResult.fatG)} g</span>
          </div>
          <div style={{ color: 'var(--faint)', fontSize: 11, marginTop: 2 }}>
            {round(macroResult.fatRangeG[0])}-{round(macroResult.fatRangeG[1])} g range
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14 }}>Carbs</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14 }}>{round(macroResult.carbsG)} g</span>
          </div>
          <div style={{ color: 'var(--faint)', fontSize: 11, marginTop: 2 }}>Whatever's left after protein and fat — your main training fuel.</div>
          {macroResult.carbCrashWarning && (
            <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: 4 }}>
              That's quite low for carbs — a sign the deficit itself may be too aggressive rather than a
              deliberate low-carb plan. Consider a slower rate.
            </div>
          )}
        </div>

        <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--faint)' }}>Fibre</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>≈{round(macroResult.fibreG)} g</span>
        </div>
      </div>
    </div>
  );
}
