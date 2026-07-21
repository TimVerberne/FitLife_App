import { useCallback, useEffect, useRef, useState } from 'react';

export interface DragState {
  order: number[]; // order[slot] = original index now occupying that slot
  draggingIndex: number; // the original index being dragged
  startSlot: number;
  startY: number;
  dy: number;
}

// Shared by TrainScreen (routine reorder) and ActiveSessionScreen (exercise
// reorder) — both independently implemented the exact same fixed-row-height
// drag technique (a dragged card's target slot is plain arithmetic on the
// pointer's Y delta, so nothing needs re-measuring after every swap) and the
// same window-level pointermove/pointerup wiring, down to matching comments
// explaining the same two non-obvious decisions:
//
// - Commits off a ref, not off `drag` (React state) directly, inside
//   setDrag()'s updater — calling the reorder callback as a side effect of a
//   setState updater trips React's "setState during render" detection
//   (updaters can run more than once, e.g. under StrictMode), and the order
//   actually committed would end up one step behind the drag's last visible
//   position.
// - Window-level listeners rather than setPointerCapture on the handle
//   button — capture is tied to that specific DOM node, and once the first
//   live swap moves it to a new position in a keyed list, capture doesn't
//   reliably survive the reorder (the dragged card freezes after exactly
//   one swap). A window listener has no such dependency on one element's
//   identity.
export function useDragReorder(itemCount: number, rowHeight: number, onCommit: (order: number[]) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);

  // Wrapped in useCallback so consumers that pass these down to memoized
  // per-item child components (e.g. ActiveSessionScreen's ExerciseCard) get
  // a stable reference across renders — otherwise every render of the
  // parent would hand every child a "new" prop, defeating memoization even
  // for cards that have nothing to do with the drag.
  const startDrag = useCallback(
    (e: React.PointerEvent, originalIndex: number) => {
      const d: DragState = {
        order: Array.from({ length: itemCount }, (_, i) => i),
        draggingIndex: originalIndex,
        startSlot: originalIndex,
        startY: e.clientY,
        dy: 0,
      };
      dragRef.current = d;
      setDrag(d);
    },
    [itemCount],
  );

  // Keyboard equivalent of the pointer drag above — reuses the exact same
  // `drag` state (and so the exact same "compact" rendering both screens
  // already switch to while `drag` is truthy) instead of a parallel code
  // path. `dy` is set so that `startSlot * rowHeight + dy` — the position
  // formula both screens already use for the actively-dragged card —
  // resolves to the new slot's position, even though there's no real
  // pointer Y delta driving it here.
  const startKeyboardReorder = useCallback(
    (originalIndex: number) => {
      const d: DragState = {
        order: Array.from({ length: itemCount }, (_, i) => i),
        draggingIndex: originalIndex,
        startSlot: originalIndex,
        startY: 0,
        dy: 0,
      };
      dragRef.current = d;
      setDrag(d);
    },
    [itemCount],
  );

  const moveKeyboardSlot = useCallback(
    (delta: number) => {
      setDrag((d) => {
        if (!d) return d;
        const currentSlot = d.order.indexOf(d.draggingIndex);
        const targetSlot = Math.max(0, Math.min(d.order.length - 1, currentSlot + delta));
        if (targetSlot === currentSlot) return d;
        const order = [...d.order];
        order.splice(currentSlot, 1);
        order.splice(targetSlot, 0, d.draggingIndex);
        const next = { ...d, order, dy: (targetSlot - d.startSlot) * rowHeight };
        dragRef.current = next;
        return next;
      });
    },
    [rowHeight],
  );

  const confirmKeyboardReorder = useCallback(() => {
    const d = dragRef.current;
    if (d) onCommit(d.order);
    dragRef.current = null;
    setDrag(null);
  }, [onCommit]);

  const cancelKeyboardReorder = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const d = dragRef.current;
      if (!d) return;
      const dy = e.clientY - d.startY;
      const rawSlot = d.startSlot + dy / rowHeight;
      const targetSlot = Math.max(0, Math.min(d.order.length - 1, Math.round(rawSlot)));
      const currentSlot = d.order.indexOf(d.draggingIndex);
      let next = d;
      if (targetSlot !== currentSlot) {
        const order = [...d.order];
        order.splice(currentSlot, 1);
        order.splice(targetSlot, 0, d.draggingIndex);
        next = { ...d, order, dy };
      } else {
        next = { ...d, dy };
      }
      dragRef.current = next;
      setDrag(next);
    }
    function onUp() {
      const d = dragRef.current;
      if (d) onCommit(d.order);
      dragRef.current = null;
      setDrag(null);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag]);

  return { drag, startDrag, startKeyboardReorder, moveKeyboardSlot, confirmKeyboardReorder, cancelKeyboardReorder };
}
