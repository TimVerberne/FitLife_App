import { useStore } from '../../store/useStore';
import { BodyProfileSetup } from './BodyProfileSetup';

// Unlike the other detail sheets, this one deliberately isn't just a
// bigger re-display of the compact Profile card — the inline card is
// already fully read at a glance, so opening it up shows something the
// card doesn't: the actual editable form, pre-filled with today's values,
// saving straight back to the same profile.
export function ProfileDetailSheet() {
  const closeSheet = useStore((s) => s.closeSheet);

  return (
    <div className="sheet-in">
      <div className="sheet-h">Profile</div>
      <BodyProfileSetup onSaved={closeSheet} />
    </div>
  );
}
