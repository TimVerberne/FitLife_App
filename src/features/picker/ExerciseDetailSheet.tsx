import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { exerciseById, isCustomExercise } from '../../lib/exercises';
import { getCurrentUserId } from '../../lib/supabase';
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
  const openCustomExerciseForm = useStore((s) => s.openCustomExerciseForm);
  // Subscribed to (rather than read once) so an edit made in the form is
  // reflected here the moment the form closes back onto this sheet.
  const customExercises = useStore((s) => s.customExercises);
  const isLibraryAdmin = useStore((s) => s.isLibraryAdmin);
  const archiveCustomExercise = useStore((s) => s.archiveCustomExercise);

  const [metric, setMetric] = useState<Metric>('weight');
  const [period, setPeriod] = useState<StatPeriod>('3months');

  const ex = detailExerciseId ? exerciseById(detailExerciseId) : undefined;
  const history = useMemo(() => (ex ? exerciseHistory(sessions, ex.id) : []), [sessions, ex]);

  if (!ex) return null;

  const custom = isCustomExercise(ex) ? customExercises.find((c) => c.id === ex.id) : undefined;
  // Only the author may edit a shared entry — the server enforces this too
  // (see the RLS update policy), so hiding the button just avoids offering
  // an action that would fail.
  const canEdit = !!custom && custom.createdBy !== null && custom.createdBy === getCurrentUserId();
  // Archiving is wider than editing: an admin can hide anyone's exercise
  // (that's the moderation path for a global library), but still can't
  // rename one, since that would rewrite what everyone's history says.
  const canArchive = !!custom && (canEdit || isLibraryAdmin);

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
      {custom && (
        <div className="cx-badge-row">
          <span className="cx-badge">Custom</span>
          <span style={{ color: 'var(--faint)', fontSize: 12 }}>
            {canEdit ? 'Added by you — shared with everyone' : 'Added by someone in the community'}
          </span>
        </div>
      )}
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
              <button
                key={m.id}
                className={`metric-tab${metric === m.id ? ' on' : ''}`}
                aria-pressed={metric === m.id}
                onClick={() => setMetric(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="metric-tabs">
            {PERIODS.map((p) => (
              <button
                key={p}
                className={`metric-tab${period === p ? ' on' : ''}`}
                aria-pressed={period === p}
                onClick={() => setPeriod(p)}
              >
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

      {/* Both are optional on a user-authored exercise — an empty heading
          over nothing reads as a loading failure, so omit the section. */}
      {ex.instruction_steps.length > 0 && (
        <>
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
        </>
      )}
      {ex.attribution && <div className="attribution">{ex.attribution}</div>}
      {(active || pickerTargetSessionId) && (
        <button className="btn" style={{ marginTop: 16 }} onClick={() => addExerciseToSession(ex.id)}>
          + Add to workout
        </button>
      )}
      {canEdit && custom && (
        <button className="btn sec" style={{ marginTop: 8 }} onClick={() => openCustomExerciseForm(custom.id)}>
          Edit exercise
        </button>
      )}
      {/* Author removal already lives inside the edit form; this is the
          moderation route for an exercise somebody else wrote. */}
      {canArchive && !canEdit && custom && (
        <button className="btn danger" style={{ marginTop: 8 }} onClick={() => archiveCustomExercise(custom.id)}>
          Remove from library
        </button>
      )}
    </div>
  );
}
