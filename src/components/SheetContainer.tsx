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
import { BadgeCollectionSheet } from '../features/badges/BadgeCollectionSheet';

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

  // The rest of the sheet (header, content) is also draggable once
  // scrolled all the way to the top, same as a native bottom sheet.
  //
  // This has to be a *native*, non-passive touchmove listener, not React's
  // onPointerDown/Move/Up (the previous approach) — React always attaches
  // touch-derived listeners as passive, so calling preventDefault() inside
  // one is a silent no-op. Without a real preventDefault, the browser's own
  // touch-scroll handling was free to win the race against this JS the
  // whole time, which is exactly why it "scrolled the page behind it" or
  // needed several attempts: whichever one the browser noticed first.
  const contentDrag = useRef<DragTrack | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (e.touches.length !== 1) return;
      contentDrag.current = { startY: e.touches[0].clientY, startTime: performance.now(), dy: 0, active: false };
    }

    function onTouchMove(e: TouchEvent) {
      const track = contentDrag.current;
      if (!track || e.touches.length !== 1) return;
      const dy = e.touches[0].clientY - track.startY;
      if (!track.active) {
        if ((el!.scrollTop ?? 0) > 0 || dy <= 6) return;
        track.active = true;
        setDragging(true);
      }
      // Only now, having committed to a dismiss-drag, do we take over the
      // gesture from the browser's native scroll.
      e.preventDefault();
      const clamped = Math.max(0, dy);
      track.dy = clamped;
      setDragY(clamped);
    }

    function onTouchEnd() {
      const track = contentDrag.current;
      contentDrag.current = null;
      if (track?.active) finishDrag(track);
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
    // scrollRef is one persistent DOM node reused across every sheet type
    // (see the effect above), so this only needs to attach once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <div className="sheet-scroll" ref={scrollRef}>
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
          {sheet === 'badges' && <BadgeCollectionSheet />}
        </div>
      </div>
    </>
  );
}
