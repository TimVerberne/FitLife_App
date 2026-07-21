import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { exerciseById } from '../../lib/exercises';
import { Thumb } from '../../components/Thumb';
import { ProgressChart } from '../../components/ProgressChart';
import { exerciseHistory, exercisePR, periodCutoff, STAT_PERIOD_LABEL, type StatPeriod } from '../../lib/records';
import { formatWeight, toDisplayWeight } from '../../lib/units';

type Metric = 'weight' | 'oneRM' | 'volume';

const METRICS: { id: Metric; label: string }[] = [
  { id: 'weight', label: 'Heaviest weight' },
  { id: 'oneRM', label: 'One rep max' },
  { id: 'volume', label: 'Best set volume' },
];

const PERIODS: StatPeriod[] = ['month', '3months', 'all'];

export function ExerciseDetailSheet() {
  const detailExerciseId = useStore((s) => s.detailExerciseId);
  const active = useStore((s) => s.active);
  const pickerTargetSessionId = useStore((s) => s.pickerTargetSessionId);
  const sessions = useStore((s) => s.sessions);
  const units = useStore((s) => s.settings.units);
  const closeSheet = useStore((s) => s.closeSheet);
  const addExerciseToSession = useStore((s) => s.addExerciseToSession);

  const [metric, setMetric] = useState<Metric>('weight');
  const [period, setPeriod] = useState<StatPeriod>('3months');

  const ex = detailExerciseId ? exerciseById(detailExerciseId) : undefined;
  const history = useMemo(() => (ex ? exerciseHistory(sessions, ex.id) : []), [sessions, ex]);

  if (!ex) return null;

  const pr = exercisePR(history);
  const cutoff = periodCutoff(period);
  const chartPoints = history
    .filter((p) => p.ts >= cutoff)
    .map((p) => ({
      ts: p.ts,
      value: toDisplayWeight(metric === 'weight' ? p.maxWeight : metric === 'oneRM' ? p.oneRM : p.bestSetVolume, units),
    }));

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

      {history.length > 0 && (
        <>
          <div className="section-h" style={{ margin: '18px 2px 4px' }}>
            Progress
          </div>
          <div className="metric-tabs">
            {METRICS.map((m) => (
              <button key={m.id} className={`metric-tab${metric === m.id ? ' on' : ''}`} onClick={() => setMetric(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="metric-tabs">
            {PERIODS.map((p) => (
              <button key={p} className={`metric-tab${period === p ? ' on' : ''}`} onClick={() => setPeriod(p)}>
                {STAT_PERIOD_LABEL[p]}
              </button>
            ))}
          </div>
          <ProgressChart
            points={chartPoints}
            formatValue={(v) => (metric === 'volume' ? Math.round(v).toLocaleString() : `${Math.round(v)} ${units}`)}
            formatDate={(ts) => new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
          />

          <div className="pr-grid">
            <div className="pr-tile">
              <div className="k">Heaviest</div>
              <div className="v">{formatWeight(pr.maxWeight, units)}{units}</div>
              <div className="sub">× {pr.maxWeightReps}</div>
            </div>
            <div className="pr-tile">
              <div className="k">Best 1RM</div>
              <div className="v">{Math.round(toDisplayWeight(pr.oneRM, units))}{units}</div>
              <div className="sub">estimated</div>
            </div>
            <div className="pr-tile">
              <div className="k">Best set</div>
              <div className="v">{formatWeight(pr.bestSetWeight, units)}{units}</div>
              <div className="sub">× {pr.bestSetReps}</div>
            </div>
          </div>
        </>
      )}

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
      {(active || pickerTargetSessionId) && (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => addExerciseToSession(ex.id)}>
          + Add to workout
        </button>
      )}
    </div>
  );
}
