import { useState } from 'react';
import { useStore } from '../store/useStore';
import { BodyProfileSetup } from '../features/life/BodyProfileSetup';
import { WeightCard } from '../features/life/WeightCard';
import { MeasurementsCard } from '../features/life/MeasurementsCard';
import { BodyCompositionCard } from '../features/life/BodyCompositionCard';
import { NutritionCard } from '../features/life/NutritionCard';
import { MacrosCard } from '../features/life/MacrosCard';
import { HydrationCard } from '../features/life/HydrationCard';
import { formatHeight } from '../lib/units';
import type { BodyProfile } from '../lib/types';

function isProfileComplete(profile: BodyProfile): boolean {
  return profile.heightCm != null && profile.birthYear != null && profile.sexAtBirth != null;
}

const ACTIVITY_LABEL: Record<BodyProfile['activity'], string> = {
  sedentary: 'Sedentary',
  light: 'Light activity',
  moderate: 'Moderate activity',
  very: 'Very active',
  extra: 'Extra active',
};

const GOAL_LABEL: Record<BodyProfile['goal'], string> = {
  lose: 'Losing',
  maintain: 'Maintaining',
  gain: 'Gaining',
};

export function LifeScreen() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const units = useStore((s) => s.settings.units);
  const [editing, setEditing] = useState(false);
  const complete = isProfileComplete(bodyProfile);

  return (
    <div className="screen">
      <div className="top">
        <div className="h1" style={{ fontSize: 28 }}>
          Life
        </div>
        <div style={{ color: 'var(--faint)', fontSize: 13, marginTop: 4 }}>Fuel for training, not a food diary.</div>
      </div>

      {(!complete || editing) && <BodyProfileSetup onSaved={() => setEditing(false)} />}

      {complete && !editing && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div className="section-h" style={{ margin: 0 }}>
              Profile
            </div>
            <button className="btn sec" style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }} onClick={() => setEditing(true)}>
              Edit
            </button>
          </div>
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--faint)' }}>
            <div>Height: {formatHeight(bodyProfile.heightCm!, units)}</div>
            <div>Birth year: {bodyProfile.birthYear}</div>
            <div>{ACTIVITY_LABEL[bodyProfile.activity]}</div>
            <div>
              {GOAL_LABEL[bodyProfile.goal]}
              {bodyProfile.goal !== 'maintain' ? ` · ${bodyProfile.rateKgWeek.toFixed(1)} kg/week` : ''}
            </div>
          </div>
        </div>
      )}

      {complete && !editing && (
        <>
          <WeightCard />
          <MeasurementsCard />
          <BodyCompositionCard />
          <NutritionCard />
          <MacrosCard />
          <HydrationCard />
        </>
      )}
    </div>
  );
}
