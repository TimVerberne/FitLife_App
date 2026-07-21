import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';

export function RoutineActionsSheet() {
  const viewingRoutineId = useStore((s) => s.viewingRoutineId);
  const routine = useStore((s) => s.routines.find((r) => r.id === viewingRoutineId));
  const renameRoutine = useStore((s) => s.renameRoutine);
  const deleteRoutine = useStore((s) => s.deleteRoutine);
  const duplicateRoutine = useStore((s) => s.duplicateRoutine);

  const [name, setName] = useState(routine?.name ?? '');

  useEffect(() => {
    setName(routine?.name ?? '');
  }, [routine?.id, routine?.name]);

  if (!routine) return null;

  const canSave = !!name.trim() && name.trim() !== routine.name;

  function save() {
    if (!canSave || !routine) return;
    renameRoutine(routine.id, name);
  }

  return (
    <div className="sheet-in">
      <div className="sheet-h">Routine options</div>
      <div className="section-h" style={{ margin: '0 2px 8px' }}>
        Name
      </div>
      <form
        className="search"
        style={{ marginBottom: 16 }}
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Routine name" />
      </form>
      <button className="btn" disabled={!canSave} onClick={save}>
        Save name
      </button>
      <button className="btn sec" style={{ marginTop: 10 }} onClick={() => duplicateRoutine(routine.id)}>
        Duplicate routine
      </button>
      <button className="btn danger" style={{ marginTop: 10 }} onClick={() => deleteRoutine(routine.id)}>
        Delete routine
      </button>
    </div>
  );
}
