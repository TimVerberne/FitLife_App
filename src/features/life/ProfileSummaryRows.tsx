import { useStore } from '../../store/useStore';
import { formatHeight } from '../../lib/units';
import type { BodyProfile } from '../../lib/types';

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

// Shared between the inline Profile card on the Life dashboard and its
// tap-to-expand detail sheet, so the two never drift apart.
export function ProfileSummaryRows() {
  const bodyProfile = useStore((s) => s.bodyProfile);
  const units = useStore((s) => s.settings.units);

  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--faint)' }}>
      <div>Height: {formatHeight(bodyProfile.heightCm!, units)}</div>
      <div>Birth year: {bodyProfile.birthYear}</div>
      <div>{ACTIVITY_LABEL[bodyProfile.activity]}</div>
      <div>
        {bodyProfile.goalMode === 'kcal' && bodyProfile.manualKcalTarget != null
          ? `Manual target · ${bodyProfile.manualKcalTarget} kcal/day`
          : <>
              {GOAL_LABEL[bodyProfile.goal]}
              {bodyProfile.goal !== 'maintain' ? ` · ${bodyProfile.rateKgWeek.toFixed(1)} kg/week` : ''}
            </>}
      </div>
    </div>
  );
}
