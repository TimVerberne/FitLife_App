import { useState } from 'react';
import { useStore } from '../store/useStore';
import { BodyProfileSetup } from '../features/life/BodyProfileSetup';
import { TodayCard } from '../features/life/TodayCard';
import { MeasurementsCard } from '../features/life/MeasurementsCard';
import { BodyCompositionCard } from '../features/life/BodyCompositionCard';
import { WellnessCard } from '../features/life/WellnessCard';
import { HydrationMiniCard } from '../features/life/HydrationMiniCard';
import { WeightMiniCard } from '../features/life/WeightMiniCard';
import { RelativeStrengthCard } from '../features/life/RelativeStrengthCard';
import { ProfileSummaryRows } from '../features/life/ProfileSummaryRows';
import type { BodyProfile } from '../lib/types';

function isProfileComplete(profile: BodyProfile): boolean {
  return profile.heightCm != null && profile.birthYear != null && profile.sexAtBirth != null;
}

export function LifeScreen() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const openProfileDetail = useStore((s) => s.openProfileDetail);
  const openBodyCompositionDetail = useStore((s) => s.openBodyCompositionDetail);
  const openStrengthDetail = useStore((s) => s.openStrengthDetail);
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
        <>
          <TodayCard />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <HydrationMiniCard />
            <WeightMiniCard />
          </div>

          <RelativeStrengthCard onOpen={openStrengthDetail} />

          {/* No TapIcon here — the "Edit" button already sits in this card's
              top-right corner and would visually collide with it. */}
          <div
            className="card"
            style={{ marginTop: 16, cursor: 'pointer' }}
            role="button"
            tabIndex={0}
            onClick={openProfileDetail}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && openProfileDetail()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div className="section-h" style={{ margin: 0 }}>
                Profile
              </div>
              <button
                className="btn sec"
                style={{ width: 'auto', padding: '6px 12px', fontSize: 12 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(true);
                }}
                onKeyDown={(e) => e.stopPropagation()}
              >
                Edit
              </button>
            </div>
            <ProfileSummaryRows />
          </div>

          <MeasurementsCard />
          <BodyCompositionCard onOpen={openBodyCompositionDetail} />
          <WellnessCard />
        </>
      )}
    </div>
  );
}
