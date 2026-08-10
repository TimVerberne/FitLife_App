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

// How close to an edge of the scroll container the pointer must get before
// the list starts scrolling itself, and how fast it goes at the very edge
// (px per animation frame, ramped in across the zone so it creeps rather
// than lurches). Without this, any slot scrolled off-screen is simply
// unreachable: you can't drag past the edge of the display, so moving a
// newly-added exercise from the bottom of a long list to first was
// impossible — the drag would stall wherever the screen ran out.
const EDGE_ZONE = 76;
const MAX_EDGE_SPEED = 15;

export interface DragScrollOptions {
  /** The element that actually scrolls the list. */
  container?: () => HTMLElement | null;
  /**
   * The positioned element the cards are laid out inside. Supplying it lets
   * the drag re-anchor the card under the finger once the compact view has
   * rendered — see the calibration step in startDrag. Without it the drag
   * still works, just with the pre-existing offset.
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

      // How far THIS DRAG has scrolled the list by itself, and the last
      // pointer position — the auto-scroll loop re-runs the move using that
      // remembered position, since scrolling changes what's under a finger
      // that hasn't itself moved.
      //
      // Deliberately an accumulator of the scrolling we apply, not a
      // (current - start) difference. Entering the compact reorder view
      // shrinks the list from full cards to 60px rows, and the browser
      // instantly clamps scrollTop to the much shorter content — a jump of
      // thousands of pixels that isn't a drag movement at all. A difference
      // from a remembered start would swallow that clamp and fling the card
      // right off the top of the screen; counting only our own scrolling
      // can't.
      let autoScrolled = 0;
      let lastClientY = e.clientY;
      let raf = 0;
      let needsCalibration = true;
      // Bounds the wait below, so a list that never reports the compact
      // height can't leave every frame re-measuring forever.
      let calibrationFrames = 0;

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

      // Shared by real pointer movement and by the auto-scroll loop, because
      // both change where the dragged card sits relative to the list.
      function applyMove(clientY: number) {
        const d = dragRef.current;
        if (!d) return;
        // The card is positioned in the list's own coordinates, so the
        // distance it has travelled is the pointer's movement PLUS however
        // far auto-scroll has moved the list underneath it. Without the
        // second term, scrolling would slide the content past a card that
        // stayed pinned to the same slot.
        const dy = clientY - d.startY + autoScrolled;
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

      // Picking a card up switches the whole list into the compact reorder
      // view, which re-lays it out from full-height cards to 60px rows. The
      // card therefore teleports into a completely different coordinate
      // space while the finger stays where it is, leaving the two ~200px
      // apart — and since the target slot is derived from the card, not the
      // finger, the top slots stayed unreachable no matter how far up you
      // dragged.
      //
      // Re-anchoring so the row sits centred under the pointer fixes that.
      // It runs inside the animation loop rather than in begin(), because
      // begin() is called before React has rendered the compact layout, so
      // there'd be nothing correct to measure yet.
      function calibrate(): boolean {
        const d = dragRef.current;
        const listEl = scrollRef.current?.list?.();
        if (!d || !listEl) return true;
        // React hasn't necessarily committed the compact layout by the time
        // the first animation frame runs, and measuring the old full-height
        // list puts the anchor thousands of pixels out. Waiting for the list
        // to actually report its compact height is a self-verifying signal
        // that the re-layout has landed — far more reliable than guessing a
        // number of frames.
        const rect = listEl.getBoundingClientRect();
        if (Math.abs(rect.height - itemCount * rowHeight) > 2) return false;
        const listTop = rect.top;
        // Chosen so that `startSlot * rowHeight + (clientY - startY)` — the
        // position formula the screens use — resolves to the row's top when
        // it's centred on the pointer.
        const startY = listTop + d.startSlot * rowHeight + rowHeight / 2;
        const next = { ...d, startY };
        dragRef.current = next;
        setDrag(next);
        return true;
      }

      // Scrolls the list while the pointer is held near either end, so slots
      // currently off-screen can still be reached. Runs every frame rather
      // than on pointermove, because a finger parked at the top edge stops
      // producing move events entirely — that stillness is exactly when the
      // list most needs to keep moving.
      function autoScrollTick() {
        const el = container();
        if (!dragRef.current || !el) {
          raf = 0;
          return;
        }
        if (needsCalibration) {
          calibrationFrames++;
          if (calibrate() || calibrationFrames > 20) {
            needsCalibration = false;
            applyMove(lastClientY);
          }
        }
        const rect = el.getBoundingClientRect();
        const top = rect.top + (scrollRef.current?.insetTop?.() ?? 0);
        const bottom = rect.bottom;
        let speed = 0;
        if (lastClientY < top + EDGE_ZONE) {
          speed = -MAX_EDGE_SPEED * Math.min(1, (top + EDGE_ZONE - lastClientY) / EDGE_ZONE);
        } else if (lastClientY > bottom - EDGE_ZONE) {
          speed = MAX_EDGE_SPEED * Math.min(1, (lastClientY - (bottom - EDGE_ZONE)) / EDGE_ZONE);
        }
        if (speed !== 0) {
          const previous = el.scrollTop;
          el.scrollTop = previous + speed;
          // The applied delta, not the requested one: at either end of the
          // range the browser clamps, and counting the request would drift
          // the card away from the finger the longer you held at the edge.
          const applied = el.scrollTop - previous;
          if (applied !== 0) {
            autoScrolled += applied;
            applyMove(lastClientY);
          }
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
