import { useEffect, useState } from 'react';
import { useStore } from '../../store/useStore';

export function RoutineActionsSheet() {
  const viewingRoutineId = useStore((s) => s.viewingRoutineId);
  const routine = useStore((s) => s.routines.find((r) => r.id === viewingRoutineId));
  const renameRoutine = useStore((s) => s.renameRoutine);
  const deleteRoutine = useStore((s) => s.deleteRoutine);

  const [name, setName] = useState(routine?.name ?? '');

  useEffect(() => {
    setName(routine?.name ?? '');
  }, [routine?.id, routine?.name]);

  if (!routine) return null;

  return (
    <div className="sheet-in">
      <div className="sheet-h">Routine options</div>
      <div className="section-h" style={{ margin: '0 2px 8px' }}>
        Name
      </div>
      <div className="search" style={{ marginBottom: 16 }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Routine name" />
      </div>
      <button className="btn" disabled={!name.trim() || name.trim() === routine.name} onClick={() => renameRoutine(routine.id, name)}>
        Save name
      </button>
      <button className="btn danger" style={{ marginTop: 10 }} onClick={() => deleteRoutine(routine.id)}>
        Delete routine
      </button>
    </div>
  );
}
