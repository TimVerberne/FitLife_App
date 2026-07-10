import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { PickerSheet } from '../features/picker/PickerSheet';
import { ExerciseDetailSheet } from '../features/picker/ExerciseDetailSheet';
import { WorkoutDetailSheet } from '../features/history/WorkoutDetailSheet';
import { RoutineActionsSheet } from '../features/routines/RoutineActionsSheet';
import { SettingsSheet } from '../features/settings/SettingsSheet';
import { FriendsSheet } from '../features/friends/FriendsSheet';
import { ImportPreviewSheet } from '../features/settings/ImportPreviewSheet';

const DISMISS_THRESHOLD = 90;

export function SheetContainer() {
  const sheet = useStore((s) => s.sheet);
  const closeSheet = useStore((s) => s.closeSheet);
  const show = sheet !== null;

  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // .sheet-scroll is one persistent element shared by every sheet type below,
  // so switching from e.g. the picker (scrolled down to find an exercise) to
  // the exercise detail view (opened via its "i" button) would otherwise
  // carry over the old scroll offset, opening the new sheet already scrolled
  // past its heading straight into the middle of its content.
  useEffect(() => {
    scrollRef.current?.scrollTo(0, 0);
  }, [sheet]);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, dy: 0 };
    setDragging(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    drag.current.dy = dy;
    setDragY(dy);
  }

  function endDrag() {
    if (!drag.current) return;
    const dy = drag.current.dy;
    drag.current = null;
    setDragging(false);
    setDragY(0);
    if (dy > DISMISS_THRESHOLD) closeSheet();
  }

  return (
    <>
      <div className={`scrim${show ? ' show' : ''}`} onClick={closeSheet} />
      <div
        className={`sheet${show ? ' show' : ''}`}
        style={dragging ? { transform: `translateX(-50%) translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="grab-zone"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <div className="grab" />
        </div>
        <div className="sheet-scroll" ref={scrollRef}>
          {sheet === 'picker' && <PickerSheet />}
          {sheet === 'detail' && <ExerciseDetailSheet />}
          {sheet === 'workout' && <WorkoutDetailSheet />}
          {sheet === 'routineActions' && <RoutineActionsSheet />}
          {sheet === 'settings' && <SettingsSheet />}
          {sheet === 'friends' && <FriendsSheet />}
          {sheet === 'importPreview' && <ImportPreviewSheet />}
        </div>
      </div>
    </>
  );
}
