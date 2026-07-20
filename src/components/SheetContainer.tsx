import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { PickerSheet } from '../features/picker/PickerSheet';
import { ExerciseDetailSheet } from '../features/picker/ExerciseDetailSheet';
import { WorkoutDetailSheet } from '../features/history/WorkoutDetailSheet';
import { RoutineActionsSheet } from '../features/routines/RoutineActionsSheet';
import { SettingsSheet } from '../features/settings/SettingsSheet';
import { FriendsSheet } from '../features/friends/FriendsSheet';
import { ImportPreviewSheet } from '../features/settings/ImportPreviewSheet';
import { WeightDetailSheet } from '../features/life/WeightDetailSheet';
import { HydrationDetailSheet } from '../features/life/HydrationDetailSheet';
import { NutritionDetailSheet } from '../features/life/NutritionDetailSheet';
import { MacrosDetailSheet } from '../features/life/MacrosDetailSheet';
import { StrengthDetailSheet } from '../features/life/StrengthDetailSheet';
import { ProfileDetailSheet } from '../features/life/ProfileDetailSheet';
import { BodyCompositionDetailSheet } from '../features/life/BodyCompositionDetailSheet';

const DISMISS_THRESHOLD = 90;
// A quick flick doesn't always travel far enough to cross DISMISS_THRESHOLD
// before the finger lifts — this catches that case by speed instead of
// distance, matching how native bottom sheets respond to a fast swipe.
const FLICK_MIN_DISTANCE = 30;
const FLICK_MIN_VELOCITY = 0.5; // px/ms

interface DragTrack {
  startY: number;
  startTime: number;
  dy: number;
  active: boolean;
}

export function SheetContainer() {
  const sheet = useStore((s) => s.sheet);
  const closeSheet = useStore((s) => s.closeSheet);
  const show = sheet !== null;
  // The picker's result count swings from 1000+ rows down to a single match
  // as you type, and .sheet only caps its height (max-height) rather than
  // fixing it — so it was shrink-wrapping to the shorter filtered list on
  // every keystroke, which (since the sheet is bottom-anchored) visibly
  // shifted the search bar up and down. Locking it to a fixed height keeps
  // the search bar stationary regardless of how many results match.
  const fixedHeight = sheet === 'picker';

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

  function finishDrag(track: DragTrack) {
    setDragging(false);
    setDragY(0);
    const elapsedMs = Math.max(1, performance.now() - track.startTime);
    const velocity = track.dy / elapsedMs;
    const isFlick = track.dy > FLICK_MIN_DISTANCE && velocity > FLICK_MIN_VELOCITY;
    if (track.dy > DISMISS_THRESHOLD || isFlick) closeSheet();
  }

  // The small grab handle is always draggable regardless of scroll
  // position — this is the simple, unconditional case.
  const handleDrag = useRef<DragTrack | null>(null);

  function onHandlePointerDown(e: React.PointerEvent) {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    handleDrag.current = { startY: e.clientY, startTime: performance.now(), dy: 0, active: true };
    setDragging(true);
  }

  function onHandlePointerMove(e: React.PointerEvent) {
    if (!handleDrag.current) return;
    const dy = Math.max(0, e.clientY - handleDrag.current.startY);
    handleDrag.current.dy = dy;
    setDragY(dy);
  }

  function onHandlePointerUp() {
    const track = handleDrag.current;
    handleDrag.current = null;
    if (track) finishDrag(track);
  }

  // The rest of the sheet (header, content) is also draggable, but only
  // once it's scrolled all the way to the top — otherwise a downward swipe
  // there is an ordinary scroll gesture. This is what a swipe starting
  // anywhere near the top of a sheet (not just the tiny handle bar) used to
  // fall through to the scrollable content and either scroll it instead of
  // dismissing, or need several attempts to land exactly on the handle.
  const contentDrag = useRef<DragTrack | null>(null);

  function onContentPointerDown(e: React.PointerEvent) {
    contentDrag.current = { startY: e.clientY, startTime: performance.now(), dy: 0, active: false };
  }

  function onContentPointerMove(e: React.PointerEvent) {
    const track = contentDrag.current;
    if (!track) return;
    const dy = e.clientY - track.startY;
    if (!track.active) {
      if ((scrollRef.current?.scrollTop ?? 0) > 0 || dy <= 6) return;
      track.active = true;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      setDragging(true);
    }
    const clamped = Math.max(0, dy);
    track.dy = clamped;
    setDragY(clamped);
  }

  function onContentPointerUp() {
    const track = contentDrag.current;
    contentDrag.current = null;
    if (track?.active) finishDrag(track);
  }

  return (
    <>
      <div className={`scrim${show ? ' show' : ''}`} onClick={closeSheet} />
      <div
        className={`sheet${show ? ' show' : ''}${fixedHeight ? ' sheet-fixed' : ''}`}
        style={dragging ? { transform: `translateX(-50%) translateY(${dragY}px)`, transition: 'none' } : undefined}
      >
        <div
          className="grab-zone"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerUp}
        >
          <div className="grab" />
        </div>
        <div
          className="sheet-scroll"
          ref={scrollRef}
          onPointerDown={onContentPointerDown}
          onPointerMove={onContentPointerMove}
          onPointerUp={onContentPointerUp}
          onPointerCancel={onContentPointerUp}
        >
          {sheet === 'picker' && <PickerSheet />}
          {sheet === 'detail' && <ExerciseDetailSheet />}
          {sheet === 'workout' && <WorkoutDetailSheet />}
          {sheet === 'routineActions' && <RoutineActionsSheet />}
          {sheet === 'settings' && <SettingsSheet />}
          {sheet === 'friends' && <FriendsSheet />}
          {sheet === 'importPreview' && <ImportPreviewSheet />}
          {sheet === 'weightDetail' && <WeightDetailSheet />}
          {sheet === 'hydrationDetail' && <HydrationDetailSheet />}
          {sheet === 'nutritionDetail' && <NutritionDetailSheet />}
          {sheet === 'macrosDetail' && <MacrosDetailSheet />}
          {sheet === 'strengthDetail' && <StrengthDetailSheet />}
          {sheet === 'profileDetail' && <ProfileDetailSheet />}
          {sheet === 'bodyCompositionDetail' && <BodyCompositionDetailSheet />}
        </div>
      </div>
    </>
  );
}
