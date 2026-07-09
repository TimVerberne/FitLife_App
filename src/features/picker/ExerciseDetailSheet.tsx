import { useStore } from '../../store/useStore';
import { exerciseById } from '../../lib/exercises';
import { Thumb } from '../../components/Thumb';

export function ExerciseDetailSheet() {
  const detailExerciseId = useStore((s) => s.detailExerciseId);
  const active = useStore((s) => s.active);
  const closeSheet = useStore((s) => s.closeSheet);
  const addExerciseToSession = useStore((s) => s.addExerciseToSession);

  const ex = detailExerciseId ? exerciseById(detailExerciseId) : undefined;
  if (!ex) return null;

  return (
    <div className="sheet-in">
      <div className="detail-hero">
        <Thumb className="anim" src={ex.gif_url} alt={ex.name} />
        <button className="icon-btn" style={{ left: 18 }} aria-label="Close" onClick={closeSheet}>
          ←
        </button>
      </div>
      <div className="d-name">{ex.name}</div>
      <div className="meta-grid">
        <div>
          <div className="k">Target</div>
          <div className="v">{ex.target}</div>
        </div>
        <div>
          <div className="k">Region</div>
          <div className="v">{ex.body_part}</div>
        </div>
        <div>
          <div className="k">Equipment</div>
          <div className="v">{ex.equipment}</div>
        </div>
      </div>
      <div className="section-h" style={{ margin: '18px 2px 4px' }}>
        Instructions
      </div>
      <div className="steps">
        {ex.instruction_steps.map((step, i) => (
          <div className="step" key={i}>
            <div className="step-n">{i + 1}</div>
            <div className="step-t">{step}</div>
          </div>
        ))}
      </div>
      <div className="attribution">{ex.attribution}</div>
      {active && (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => addExerciseToSession(ex.id)}>
          + Add to workout
        </button>
      )}
    </div>
  );
}
