import { useStore } from '../store/useStore';
import { PickerSheet } from '../features/picker/PickerSheet';
import { ExerciseDetailSheet } from '../features/picker/ExerciseDetailSheet';
import { WorkoutDetailSheet } from '../features/history/WorkoutDetailSheet';

export function SheetContainer() {
  const sheet = useStore((s) => s.sheet);
  const closeSheet = useStore((s) => s.closeSheet);
  const show = sheet !== null;

  return (
    <>
      <div className={`scrim${show ? ' show' : ''}`} onClick={closeSheet} />
      <div className={`sheet${show ? ' show' : ''}`}>
        <div className="grab" />
        {sheet === 'picker' && <PickerSheet />}
        {sheet === 'detail' && <ExerciseDetailSheet />}
        {sheet === 'workout' && <WorkoutDetailSheet />}
      </div>
    </>
  );
}
