import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { EXERCISES, bodyParts, searchExercises } from '../../lib/exercises';
import { Thumb } from '../../components/Thumb';

export function PickerSheet() {
  const active = useStore((s) => s.active);
  const pickQuery = useStore((s) => s.pickQuery);
  const pickBodyPart = useStore((s) => s.pickBodyPart);
  const setPickQuery = useStore((s) => s.setPickQuery);
  const setPickBodyPart = useStore((s) => s.setPickBodyPart);
  const openDetail = useStore((s) => s.openDetail);
  const addExercisesToSession = useStore((s) => s.addExercisesToSession);
  const showToast = useStore((s) => s.showToast);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const list = useMemo(() => searchExercises(pickQuery, pickBodyPart), [pickQuery, pickBodyPart]);
  const bps = useMemo(() => ['all', ...bodyParts()], []);

  if (!active) return null;
  const alreadyIn = new Set(active.entries.map((e) => e.exerciseId));

  function toggle(id: string) {
    if (alreadyIn.has(id)) {
      showToast('Already in your workout');
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="sheet-in">
      <div className="sheet-h">
        Add exercise
        {selected.size > 0 && <span className="sheet-count">{selected.size}</span>}
      </div>
      <div className="sheet-search-bar">
        <div className="search">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            placeholder={`Search ${EXERCISES.length} exercises…`}
            value={pickQuery}
            onChange={(e) => setPickQuery(e.target.value)}
          />
        </div>
        <div className="chips">
          {bps.map((bp) => (
            <button key={bp} className={`chip${pickBodyPart === bp ? ' on' : ''}`} onClick={() => setPickBodyPart(bp)}>
              {bp === 'all' ? 'All' : bp}
            </button>
          ))}
        </div>
      </div>

      {list.map((ex) => {
        const isIn = alreadyIn.has(ex.id);
        const isSelected = selected.has(ex.id);
        return (
          <div
            className="pick-row"
            key={ex.id}
            role="button"
            tabIndex={0}
            onClick={() => toggle(ex.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') toggle(ex.id);
            }}
          >
            <Thumb className="pick-thumb" src={ex.image} alt={ex.name} />
            <div className="pick-b">
              <div className="pick-name">{ex.name}</div>
              <div className="pick-tags">{ex.target} · {ex.equipment}</div>
            </div>
            <button
              className="info-btn"
              aria-label={`View ${ex.name} details`}
              onClick={(e) => {
                e.stopPropagation();
                openDetail(ex.id);
              }}
            >
              i
            </button>
            <div className={`pick-check${isIn || isSelected ? ' on' : ''}`}>✓</div>
          </div>
        );
      })}
      {list.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Nothing found</p>}

      <div className="sheet-footer">
        <button className="btn" disabled={selected.size === 0} onClick={() => addExercisesToSession(Array.from(selected))}>
          {selected.size === 0 ? 'Select exercises' : `Add ${selected.size} exercise${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
