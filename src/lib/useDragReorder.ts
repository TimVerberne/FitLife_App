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

// How close the DRAGGED CARD may come to an edge of the visible list before
// the list starts scrolling itself, and how fast it goes once the card is
// pressed right against that edge (px per animation frame, ramped across the
// zone so it eases in rather than lurching).
//
// Measured against the card, not the pointer, which matters more than it
// sounds: keying it off the finger meant shoving your thumb into the very
// top of the screen to make anything move, while the card — the thing you're
// actually aiming — sat somewhere else entirely. Watching the card makes the
// list start moving exactly when the card looks like it wants to keep going.
//
// Without any of this, a slot already scrolled off-screen is simply
// unreachable: you can't drag past the edge of the display, so moving a
// newly-added exercise from the bottom of a long list to first was
// impossible.
const EDGE_ZONE = 64;
const MAX_EDGE_SPEED = 14;

// The card has to travel at least this far before auto-scroll can engage, so
// grabbing a card that already sits near an edge doesn't immediately run the
// list away under a finger that hasn't moved yet.
const AUTO_SCROLL_ARM_DISTANCE = 8;

// Fraction of full speed the moment the card enters the edge zone. A purely
// proportional ramp starts at literally zero, so nudging a card just inside
// the zone crawled at a few percent and read as "it isn't scrolling" — you
// had to jam the card right against the edge to get anywhere. Starting at a
// quarter speed means entering the zone always visibly does something, while
// still accelerating as the card presses further in.
const EDGE_SPEED_FLOOR = 0.25;

// `room` is how far the card still is from that edge; negative once it's
// trying to push past.
function edgeSpeed(room: number): number {
  const t = Math.min(1, Math.max(0, (EDGE_ZONE - room) / EDGE_ZONE));
  return MAX_EDGE_SPEED * (EDGE_SPEED_FLOOR + (1 - EDGE_SPEED_FLOOR) * t);
}

export interface DragScrollOptions {
  /** The element that actually scrolls the list. */
  container?: () => HTMLElement | null;
  /**
   * The positioned element the cards are laid out inside. Supplying it (with
   * `container`) switches the drag to absolute pointer tracking: the card
   * follows the finger, stays inside the visible list, and drives the
   * auto-scroll. Without it the drag falls back to plain pointer-delta
   * tracking and no auto-scroll.
   */
  list?: () => HTMLElement | null;
  /**
   * Height of anything overlaying the top of that container (a sticky
   * header). The auto-scroll zone starts below it, so dragging to just
   * under the header scrolls rather than tucking the card out of sight.
   */
  insetTop?: () => number;
}

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
export function useDragReorder(
  itemCount: number,
  rowHeight: number,
  onCommit: (order: number[]) => void,
  scroll?: DragScrollOptions,
) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  // Read through a ref so the imperative listeners below never capture a
  // stale options object mid-gesture.
  const scrollRef = useRef(scroll);
  scrollRef.current = scroll;
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

      let lastClientY = e.clientY;
      let raf = 0;

      const container = () => scrollRef.current?.container?.() ?? null;

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
        raf = requestAnimationFrame(autoScrollTick);
      };

      // Where the dragged card wants to be, where it's allowed to be, and how
      // much room is left before either end of the visible list.
      //
      // Everything is derived from the pointer's CURRENT position against a
      // freshly measured list, rather than accumulated from a remembered
      // starting offset. That matters more than it looks: picking a card up
      // switches the list into its compact reorder view, which re-lays it
      // out from full-height cards to 60px rows and makes the browser clamp
      // scrollTop by thousands of pixels — and those shifts land over
      // several frames, so any snapshot taken at the start is stale almost
      // immediately. Re-measuring absorbs all of it, including our own
      // auto-scrolling, with no bookkeeping to drift.
      function geometry(clientY: number) {
        const d = dragRef.current!;
        const el = container();
        const listEl = scrollRef.current?.list?.();
        if (!el || !listEl) {
          // No geometry available (a caller that didn't opt in): fall back to
          // plain pointer-delta tracking, which is what this always did.
          const dy = clientY - d.startY;
          const slot = Math.max(0, Math.min(itemCount - 1, Math.round(d.startSlot + dy / rowHeight)));
          return { dy, targetSlot: slot, topRoom: Infinity, bottomRoom: Infinity };
        }
        const listTop = listEl.getBoundingClientRect().top;
        const rect = el.getBoundingClientRect();
        // The ceiling sits below any sticky header overlaying the container,
        // so the card comes to rest against the header rather than sliding
        // behind it.
        const minY = rect.top + (scrollRef.current?.insetTop?.() ?? 0);
        const maxY = Math.max(minY, rect.bottom - rowHeight);
        // Held centred on the finger, so what you're aiming is what moves.
        const wantedY = clientY - rowHeight / 2;
        const contentTop = Math.min(Math.max(wantedY, minY), maxY) - listTop;
        const targetSlot = Math.max(0, Math.min(itemCount - 1, Math.round(contentTop / rowHeight)));
        return {
          dy: contentTop - d.startSlot * rowHeight,
          targetSlot,
          // Negative once the card is trying to push past that edge.
          topRoom: wantedY - minY,
          bottomRoom: maxY - wantedY,
        };
      }

      // Shared by real pointer movement and by the auto-scroll loop, because
      // both change where the dragged card sits relative to the list.
      function applyMove(clientY: number) {
        const d = dragRef.current;
        if (!d) return;
        const { dy, targetSlot } = geometry(clientY);
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

      // Scrolls the list while the dragged CARD is near either end, so slots
      // currently off-screen can still be reached. Runs every frame rather
      // than on pointermove, because a finger held still stops producing
      // move events entirely — and that stillness is exactly when the list
      // most needs to keep moving.
      function autoScrollTick() {
        const el = container();
        const d = dragRef.current;
        if (!d || !el) {
          raf = 0;
          return;
        }
        const { topRoom, bottomRoom } = geometry(lastClientY);
        let speed = 0;
        // Armed only once the finger has actually travelled, so grabbing a
        // card that already sits near an edge doesn't run the list away
        // under a thumb that hasn't moved yet.
        if (Math.abs(lastClientY - d.startY) >= AUTO_SCROLL_ARM_DISTANCE) {
          if (topRoom < EDGE_ZONE) speed = -edgeSpeed(topRoom);
          else if (bottomRoom < EDGE_ZONE) speed = edgeSpeed(bottomRoom);
        }
        if (speed !== 0) {
          const previous = el.scrollTop;
          el.scrollTop = previous + speed;
          // Re-measuring means the scroll itself is picked up next frame, so
          // this only needs to refresh the slot the card now sits over.
          if (el.scrollTop !== previous) applyMove(lastClientY);
        }
        raf = requestAnimationFrame(autoScrollTick);
      }

      function onMove(ev: PointerEvent) {
        lastClientY = ev.clientY;
        if (pending) {
          if (Math.abs(ev.clientY - pending.startY) < DRAG_SLOP) return;
          pending = null;
          begin(ev.clientY);
          return;
        }
        applyMove(ev.clientY);
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
        // Stopped here rather than in finish(), so the loop also dies when a
        // new drag starts or the component unmounts mid-gesture — otherwise
        // a stray frame could keep scrolling a list nobody is dragging.
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
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
