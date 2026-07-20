import { useState } from 'react';
import { useStore } from '../../store/useStore';
import type { Activity, Climate, NutritionGoal, SexAtBirth } from '../../lib/types';
import { formatHeight, fromDisplayHeightFtIn, toDisplayLength } from '../../lib/units';
import { chipStyle } from './chipStyle';

const ACTIVITY_OPTIONS: { id: Activity; label: string; desc: string }[] = [
  { id: 'sedentary', label: 'Sedentary', desc: 'Desk job, no training' },
  { id: 'light', label: 'Light', desc: '1–3 sessions/week' },
  { id: 'moderate', label: 'Moderate', desc: '3–5 sessions/week' },
  { id: 'very', label: 'Very active', desc: '6–7 sessions/week' },
  { id: 'extra', label: 'Extra active', desc: 'Physical job + training' },
];

const GOAL_OPTIONS: { id: NutritionGoal; label: string }[] = [
  { id: 'lose', label: 'Lose' },
  { id: 'maintain', label: 'Maintain' },
  { id: 'gain', label: 'Gain' },
];

// Shown whenever height/birth year/sex are missing — every calorie/macro
// estimate downstream is skipped entirely rather than guessed until this is
// filled in (sex is a real Mifflin-St Jeor input, not cosmetic).
export function BodyProfileSetup({ onSaved }: { onSaved?: () => void }) {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const saveBodyProfile = useStore((s) => s.saveBodyProfile);
  const units = useStore((s) => s.settings.units);

  const [heightCm, setHeightCm] = useState(bodyProfile.heightCm ?? 0);
  const [birthYear, setBirthYear] = useState(bodyProfile.birthYear ?? '');
  const [sexAtBirth, setSexAtBirth] = useState<SexAtBirth | null>(bodyProfile.sexAtBirth);
  const [activity, setActivity] = useState<Activity>(bodyProfile.activity);
  const [goal, setGoal] = useState<NutritionGoal>(bodyProfile.goal);
  const [rateKgWeek, setRateKgWeek] = useState(bodyProfile.rateKgWeek);
  const [climate, setClimate] = useState<Climate>(bodyProfile.climate);

  // Round the total inches first, then split into feet/inches — rounding
  // each half separately can produce "5'12"" instead of rolling over to "6'0"".
  const totalIn = Math.round(toDisplayLength(heightCm, units));
  const feet = units === 'lb' ? Math.floor(totalIn / 12) : 0;
  const inches = units === 'lb' ? totalIn % 12 : 0;

  function save() {
    const year = typeof birthYear === 'number' ? birthYear : parseInt(String(birthYear), 10);
    saveBodyProfile({
      heightCm: heightCm > 0 ? heightCm : null,
      birthYear: Number.isFinite(year) && year > 1900 ? year : null,
      sexAtBirth,
      activity,
      goal,
      // Clamped 0.1–1.0 kg/week — a slider max of 1.0 with a soft warning
      // above 0.75, matching the spec's guardrail (enforced again in
      // nutrition.ts regardless of what reaches the client).
      rateKgWeek: Math.min(1, Math.max(0.1, rateKgWeek)),
      climate,
    });
    onSaved?.();
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="section-h" style={{ margin: '0 0 4px' }}>
        Set up your Life profile
      </div>
      <p style={{ color: 'var(--faint)', fontSize: 13, marginTop: 0 }}>
        Used only to estimate calorie and hydration needs — every number stays a starting
        point, never a verdict, and none of this is ever visible to friends.
      </p>

      <div className="settings-row">
        <div className="settings-row-label">Height</div>
        {units === 'lb' ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              value={feet || ''}
              placeholder="ft"
              style={{ width: 56 }}
              onChange={(e) => setHeightCm(fromDisplayHeightFtIn(Number(e.target.value) || 0, inches))}
            />
            <input
              type="number"
              value={inches || ''}
              placeholder="in"
              style={{ width: 56 }}
              onChange={(e) => setHeightCm(fromDisplayHeightFtIn(feet, Number(e.target.value) || 0))}
            />
          </div>
        ) : (
          <input
            type="number"
            value={heightCm || ''}
            placeholder="cm"
            style={{ width: 90 }}
            onChange={(e) => setHeightCm(Number(e.target.value) || 0)}
          />
        )}
      </div>
      {heightCm > 0 && (
        <div style={{ color: 'var(--faint)', fontSize: 12, marginTop: -6, marginBottom: 8 }}>{formatHeight(heightCm, units)}</div>
      )}

      <div className="settings-row">
        <div className="settings-row-label">Birth year</div>
        <input
          type="number"
          value={birthYear}
          placeholder="e.g. 1994"
          style={{ width: 90 }}
          onChange={(e) => setBirthYear(e.target.value === '' ? '' : Number(e.target.value))}
        />
      </div>

      <div className="settings-row" style={{ alignItems: 'flex-start' }}>
        <div>
          <div className="settings-row-label">Sex at birth</div>
          <div className="settings-row-desc">Used only to estimate calorie needs</div>
        </div>
        <div className="seg" style={{ width: 150 }}>
          <button className={sexAtBirth === 'male' ? 'on' : ''} onClick={() => setSexAtBirth('male')}>
            Male
          </button>
          <button className={sexAtBirth === 'female' ? 'on' : ''} onClick={() => setSexAtBirth('female')}>
            Female
          </button>
        </div>
      </div>

      <div className="section-h" style={{ margin: '14px 2px 6px' }}>
        Activity level
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ACTIVITY_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => setActivity(opt.id)}
            style={{ ...chipStyle(activity === opt.id), display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' }}
          >
            <span>{opt.label}</span>
            <span style={{ fontWeight: 500, fontSize: 11, opacity: 0.8 }}>{opt.desc}</span>
          </button>
        ))}
      </div>

      <div className="section-h" style={{ margin: '14px 2px 6px' }}>
        Goal
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {GOAL_OPTIONS.map((opt) => (
          <button key={opt.id} onClick={() => setGoal(opt.id)} style={{ ...chipStyle(goal === opt.id), flex: 1 }}>
            {opt.label}
          </button>
        ))}
      </div>

      {goal !== 'maintain' && (
        <div className="settings-row">
          <div>
            <div className="settings-row-label">Target rate</div>
            <div className="settings-row-desc">
              {rateKgWeek.toFixed(1)} kg/week{rateKgWeek > 0.75 ? ' — fairly aggressive' : ''}
            </div>
          </div>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.1}
            value={rateKgWeek}
            onChange={(e) => setRateKgWeek(Number(e.target.value))}
            style={{ width: 110 }}
          />
        </div>
      )}

      <div className="settings-row">
        <div className="settings-row-label">Climate</div>
        <div className="seg" style={{ width: 150 }}>
          <button className={climate === 'temperate' ? 'on' : ''} onClick={() => setClimate('temperate')}>
            Temperate
          </button>
          <button className={climate === 'hot' ? 'on' : ''} onClick={() => setClimate('hot')}>
            Hot
          </button>
        </div>
      </div>

      <button className="btn" style={{ marginTop: 14, width: '100%' }} onClick={save}>
        Save
      </button>
    </div>
  );
}
