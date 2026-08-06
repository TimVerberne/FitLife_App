import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { bodyParts, equipmentOptions, targetOptions } from '../../lib/exercises';
import { chipStyle } from '../life/chipStyle';

// Body part is chosen from the same chip vocabulary the picker filters by,
// including the biceps/triceps split that `bodyParts()` synthesises out of
// "upper arms" — so the two have to be mapped back to a real body_part +
// target pair before saving, exactly as searchExercises unpacks them.
function resolveBodyPart(chip: string): { body_part: string; target: string | null } {
  if (chip === 'biceps' || chip === 'triceps') return { body_part: 'upper arms', target: chip };
  return { body_part: chip, target: null };
}

export function CustomExerciseSheet() {
  const editingId = useStore((s) => s.editingCustomExerciseId);
  const customExercises = useStore((s) => s.customExercises);
  const pickQuery = useStore((s) => s.pickQuery);
  const saveCustomExercise = useStore((s) => s.saveCustomExercise);
  const archiveCustomExercise = useStore((s) => s.archiveCustomExercise);
  const closeSheet = useStore((s) => s.closeSheet);

  const editing = editingId ? customExercises.find((e) => e.id === editingId) : undefined;

  // Opened from a search that came up empty, the typed query is almost
  // always the name the user wants — carry it straight into the field.
  const [name, setName] = useState(editing?.name ?? pickQuery.trim());
  const [bodyPartChip, setBodyPartChip] = useState(() => {
    if (!editing) return 'chest';
    return editing.body_part === 'upper arms' ? editing.target : editing.body_part;
  });
  const [equipment, setEquipment] = useState(editing?.equipment ?? 'barbell');
  const [target, setTarget] = useState(editing?.target ?? '');
  const [steps, setSteps] = useState((editing?.instruction_steps ?? []).join('\n'));
  const [saving, setSaving] = useState(false);

  const chips = useMemo(() => bodyParts(), []);
  const equipment_ = useMemo(() => equipmentOptions(), []);
  const targets = useMemo(() => targetOptions(bodyPartChip), [bodyPartChip]);

  // The target list is body-part dependent, so a target picked for "chest"
  // is meaningless once the body part changes to "legs". Rather than hold a
  // now-invalid value, fall back to the first target of the new list.
  const effectiveTarget = targets.includes(target) ? target : targets[0];

  const isCardio = resolveBodyPart(bodyPartChip).body_part === 'cardio';

  async function save() {
    if (saving) return;
    setSaving(true);
    const resolved = resolveBodyPart(bodyPartChip);
    try {
      await saveCustomExercise({
        name,
        body_part: resolved.body_part,
        equipment,
        target: resolved.target ?? effectiveTarget,
        instruction_steps: steps
          .split('\n')
          .map((s) => s.trim())
          .filter(Boolean),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="sheet-in">
      <div className="sheet-h">{editing ? 'Edit exercise' : 'New exercise'}</div>
      <p style={{ color: 'var(--faint)', fontSize: 13, margin: '0 0 14px' }}>
        {editing
          ? 'Everyone sees these changes — this exercise is part of the shared library.'
          : 'Added to the shared library, so everyone can find and log it. It tracks records, volume and badges exactly like the built-in exercises.'}
      </p>

      <div className="cx-field">
        <label className="cx-label" htmlFor="cx-name">
          Name
        </label>
        <input
          id="cx-name"
          className="cx-input"
          value={name}
          placeholder="e.g. Reverse Hyper"
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div className="cx-field">
        <span className="cx-label">Body part</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {chips.map((bp) => (
            <button
              key={bp}
              type="button"
              aria-pressed={bodyPartChip === bp}
              style={chipStyle(bodyPartChip === bp)}
              onClick={() => setBodyPartChip(bp)}
            >
              {bp}
            </button>
          ))}
        </div>
        {isCardio && (
          <p className="cx-hint">Cardio exercises log duration and distance instead of weight and reps.</p>
        )}
      </div>

      {/* Biceps and triceps ARE the target — asking again would be asking the
          same question twice. */}
      {!isCardio && resolveBodyPart(bodyPartChip).target === null && (
        <div className="cx-field">
          <label className="cx-label" htmlFor="cx-target">
            Main muscle
          </label>
          <select
            id="cx-target"
            className="cx-input"
            value={effectiveTarget}
            onChange={(e) => setTarget(e.target.value)}
          >
            {targets.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="cx-field">
        <label className="cx-label" htmlFor="cx-equipment">
          Equipment
        </label>
        <select
          id="cx-equipment"
          className="cx-input"
          value={equipment}
          onChange={(e) => setEquipment(e.target.value)}
        >
          {equipment_.map((eq) => (
            <option key={eq} value={eq}>
              {eq}
            </option>
          ))}
        </select>
      </div>

      <div className="cx-field">
        <label className="cx-label" htmlFor="cx-steps">
          How to do it <span style={{ color: 'var(--faint-2)', fontWeight: 400 }}>· optional</span>
        </label>
        <textarea
          id="cx-steps"
          className="cx-input cx-textarea"
          value={steps}
          rows={4}
          placeholder={'One step per line.\nSet up with your hips on the pad.\nDrive your legs up to lockout.'}
          onChange={(e) => setSteps(e.target.value)}
        />
      </div>

      {editing && (
        <button
          className="btn danger"
          style={{ marginTop: 4 }}
          onClick={() => archiveCustomExercise(editing.id)}
        >
          Remove from library
        </button>
      )}

      <div className="sheet-footer" style={{ display: 'flex', gap: 8 }}>
        <button className="btn sec" style={{ flex: 1 }} onClick={closeSheet}>
          Cancel
        </button>
        <button className="btn" style={{ flex: 2 }} disabled={!name.trim() || saving} onClick={() => void save()}>
          {editing ? 'Save changes' : 'Add exercise'}
        </button>
      </div>
    </div>
  );
}
