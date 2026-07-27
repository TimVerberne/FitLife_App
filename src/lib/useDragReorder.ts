import { useCallback, useEffect, useRef, useState } from 'react';
import { prefersReducedMotion } from './useReducedMotion';

export interface DragState {
  order: number[]; // order[slot] = original index now occupying that slot
  draggingIndex: number; // the original index being dragged
  startSlot: number;
  startY: number;
  dy: number;
}

// How far the pointer must travel before a press becomes a drag. Below this
// it's still a tap — pressing a handle and releasing (or starting to scroll
// the list) must not flip the whole list into its compact reorder view, which
// is what made picking items up feel twitchy and ambiguous.
const DRAG_SLOP = 6;

// How long the dropped item keeps its settling transition after release, so
// it eases into its final slot instead of snapping. Matches the CSS
// transition on .routine-card.settling / .s-ex.settling.
const SETTLE_MS = 180;

// Shared by TrainScreen (routine reorder) and ActiveSessionScreen (exercise
// reorder) — both use the same fixed-row-height technique (a dragged card's
// target slot is plain arithmetic on the pointer's Y delta, so nothing needs
// re-measuring after every swap) and the same window-level pointer wiring,
// for the same two non-obvious reasons:
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
//   reliably survive the reorder (the dragged card freezes after exactly one
//   swap). A window listener has no such dependency on one element's identity.
//
// The listeners are attached imperatively from startDrag rather than by an
// effect keyed on drag state, because they must already be live during the
// pre-slop "pending" phase — before there's any drag state to key off.
export function useDragReorder(itemCount: number, rowHeight: number, onCommit: (order: number[]) => void) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // True for SETTLE_MS after a drop so the dropped item can animate home.
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cleanupRef = useRef<(() => void) | undefined>(undefined);

  // Latest onCommit without re-subscribing listeners mid-gesture.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // The reorder is committed only once the drop animation has finished. The
  // drag view has to stay mounted for the card to animate into its slot, and
  // committing early would reorder the underlying array out from under a
  // `drag.order` that still refers to pre-commit indices — so the order is
  // parked here and flushed by whichever comes first: the settle timer, a new
  // drag starting, or unmount.
  const pendingCommit = useRef<number[] | null>(null);
  const flushCommit = useCallback(() => {
    const order = pendingCommit.current;
    pendingCommit.current = null;
    if (order) commitRef.current(order);
  }, []);

  useEffect(
    () => () => {
      clearTimeout(settleTimer.current);
      cleanupRef.current?.();
      const order = pendingCommit.current;
      pendingCommit.current = null;
      if (order) commitRef.current(order);
    },
    [],
  );

  const startDrag = useCallback(
    (e: React.PointerEvent, originalIndex: number) => {
      // Only a *potential* drag until the pointer clears DRAG_SLOP.
      let pending: { startY: number } | null = { startY: e.clientY };
      cleanupRef.current?.();
      // A new grab during a settle: finish the previous reorder immediately
      // rather than losing it to the cancelled timer.
      clearTimeout(settleTimer.current);
      flushCommit();
      setSettling(false);

      const begin = (clientY: number) => {
        const d: DragState = {
          order: Array.from({ length: itemCount }, (_, i) => i),
          draggingIndex: originalIndex,
          startSlot: originalIndex,
          // Anchored at the point the drag actually began, not the original
          // press, so the card doesn't jump by DRAG_SLOP on activation.
          startY: clientY,
          dy: 0,
        };
        dragRef.current = d;
        setDrag(d);
      };

      function onMove(ev: PointerEvent) {
        if (pending) {
          if (Math.abs(ev.clientY - pending.startY) < DRAG_SLOP) return;
          pending = null;
          begin(ev.clientY);
          return;
        }
        const d = dragRef.current;
        if (!d) return;
        const dy = ev.clientY - d.startY;
        const rawSlot = d.startSlot + dy / rowHeight;
        const targetSlot = Math.max(0, Math.min(d.order.length - 1, Math.round(rawSlot)));
        const currentSlot = d.order.indexOf(d.draggingIndex);
        let next: DragState;
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

      function finish() {
        cleanupRef.current?.();
        const d = dragRef.current;
        // A press that never cleared the slop is a plain tap — nothing to
        // commit, and no settle animation to play.
        if (!d) {
          dragRef.current = null;
          setDrag(null);
          return;
        }
        if (prefersReducedMotion()) {
          dragRef.current = null;
          setDrag(null);
          commitRef.current(d.order);
          return;
        }
        // Land the card on its final slot and let it animate there, holding
        // the drag view (and the commit) until the motion finishes.
        const finalSlot = d.order.indexOf(d.draggingIndex);
        const landed: DragState = { ...d, dy: (finalSlot - d.startSlot) * rowHeight };
        dragRef.current = landed;
        setDrag(landed);
        setSettling(true);
        pendingCommit.current = d.order;
        settleTimer.current = setTimeout(() => {
          dragRef.current = null;
          setDrag(null);
          setSettling(false);
          flushCommit();
        }, SETTLE_MS);
      }

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      cleanupRef.current = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
        cleanupRef.current = undefined;
      };
    },
    [itemCount, rowHeight, flushCommit],
  );

  // Keyboard equivalent of the pointer drag — reuses the exact same `drag`
  // state (and so the same compact rendering both screens already switch to)
  // instead of a parallel code path. `dy` is set so that
  // `startSlot * rowHeight + dy` — the position formula both screens use for
  // the actively-dragged card — resolves to the new slot's position, even
  // though there's no real pointer delta driving it.
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
    if (d) commitRef.current(d.order);
    dragRef.current = null;
    setDrag(null);
  }, []);

  const cancelKeyboardReorder = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  return { drag, settling, startDrag, startKeyboardReorder, moveKeyboardSlot, confirmKeyboardReorder, cancelKeyboardReorder };
}
