import { useState } from 'react';

// The "show first N, then reveal the rest on tap" pattern was hand-rolled
// (a boolean useState + slice(0, N) + a toggle button) four times across
// ProfileScreen (records, history) and ImportPreviewSheet (routines,
// sessions) — same shape each time, just a different N and a different
// list. Row markup stays per-call-site (it varies too much between
// contexts — clickable vs. preview-only, different columns — to force into
// one shared component), but the collapse bookkeeping itself doesn't.
export function useCollapsedList<T>(items: T[], count = 5) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, count);
  const hiddenCount = items.length - visible.length;
  return { visible, hiddenCount, expanded, toggle: () => setExpanded((v) => !v) };
}
