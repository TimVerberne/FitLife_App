import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import { EXERCISES, bodyParts, exerciseById, searchExercises } from '../../lib/exercises';
import type { Exercise } from '../../lib/types';
import { Thumb } from '../../components/Thumb';

const RECENT_COUNT = 8;

// Must match .pick-row's rendered height (44px thumb + 22px vertical padding
// + 1px border). The list can run to 1000+ rows with the full exercise
// dataset, and rendering all of them unconditionally measured ~2.7s to open
// the sheet and ~38ms/frame while scrolling under a 4x CPU throttle — bad
// enough to feel like a freeze on a real phone. Single-line name truncation
// (see .pick-name) keeps every row exactly this height, which is what makes
// simple fixed-height virtualization possible without a layout library.
const ROW_HEIGHT = 67;
const OVERSCAN = 6;

function useVirtualRange(count: number, listRef: React.RefObject<HTMLDivElement | null>) {
  const [range, setRange] = useState({ start: 0, end: Math.min(count, 24) });

  useEffect(() => {
    const listEl = listRef.current;
    const scrollEl = listEl?.closest('.sheet-scroll') as HTMLElement | null;
    if (!listEl || !scrollEl) return;

    // getBoundingClientRect() forces a synchronous layout read, so calling it
    // on every scroll frame (the naive approach) reintroduces the exact kind
    // of jank virtualization is meant to remove. The list's offset within
    // the scroll container only changes when the header above it does (query
    // text edits don't resize it), so it's measured once here and the scroll
    // handler afterwards only reads scrollTop/clientHeight — both already
    // cached by the browser, no layout pass triggered.
    const listTop = listEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;

    let raf = 0;
    function update() {
      raf = 0;
      const scrolledIntoList = scrollEl!.scrollTop - listTop;
      // Clamped to `count`, not just floored at 0 — when the filtered list
      // shrinks (a narrower query/body-part filter) this effect re-runs
      // before the separate scroll-to-top effect below has actually reset
      // scrollTop, so the stale scroll position can otherwise compute a
      // start index past the new, shorter list and render a blank flash.
      const rawStart = Math.max(0, Math.floor(scrolledIntoList / ROW_HEIGHT) - OVERSCAN);
      const start = Math.min(rawStart, count);
      const visibleRows = Math.ceil(scrollEl!.clientHeight / ROW_HEIGHT) + OVERSCAN * 2;
      setRange({ start, end: Math.min(count, start + visibleRows) });
    }
    function onScroll() {
      if (raf) return;
      raf = requestAnimationFrame(update);
    }
    update();
    scrollEl.addEventListener('scroll', onScroll);
    window.addEventListener('resize', onScroll);
    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [count, listRef]);

  return range;
}

export function PickerSheet() {
  const active = useStore((s) => s.active);
  // Non-null when this picker was opened to add exercises to a past workout
  // being edited (WorkoutDetailSheet's "+ Add exercise") rather than to the
  // in-progress session — the picker itself doesn't otherwise know or care
  // which target addExercisesToSession() will route the selection to.
  const pickerTargetSessionId = useStore((s) => s.pickerTargetSessionId);
  const sessions = useStore((s) => s.sessions);
  const historySession = pickerTargetSessionId ? sessions.find((sess) => sess.id === pickerTargetSessionId) : undefined;
  const pickQuery = useStore((s) => s.pickQuery);
  const pickBodyPart = useStore((s) => s.pickBodyPart);
  const setPickQuery = useStore((s) => s.setPickQuery);
  const setPickBodyPart = useStore((s) => s.setPickBodyPart);
  const openDetailFromPicker = useStore((s) => s.openDetailFromPicker);
  const addExercisesToSession = useStore((s) => s.addExercisesToSession);
  const showToast = useStore((s) => s.showToast);

  // Lives in the global store (not local state) so it survives the
  // PickerSheet → ExerciseDetailSheet → PickerSheet remount cycle when
  // tapping the "i" info button mid-selection.
  const selected = useStore((s) => s.pickSelected);
  const togglePickSelected = useStore((s) => s.togglePickSelected);

  const list = useMemo(() => searchExercises(pickQuery, pickBodyPart), [pickQuery, pickBodyPart]);
  const bps = useMemo(() => ['all', ...bodyParts()], []);

  // Shown only while browsing (no query, no filter narrowed yet) — once
  // someone's searching or filtering they're after something specific, not
  // a shortcut back to what they already train regularly.
  const showRecent = !pickQuery && pickBodyPart === 'all';
  const recentExercises = useMemo(() => {
    if (!showRecent) return [];
    const lastUsed = new Map<string, number>();
    sessions
      .filter((s) => s.person === 'You')
      .forEach((s) => {
        s.entries.forEach((e) => {
          const prev = lastUsed.get(e.exerciseId) ?? 0;
          if (s.startedAt > prev) lastUsed.set(e.exerciseId, s.startedAt);
        });
      });
    return Array.from(lastUsed.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, RECENT_COUNT)
      .map(([id]) => exerciseById(id))
      .filter((e): e is Exercise => !!e);
  }, [showRecent, sessions]);

  const listRef = useRef<HTMLDivElement>(null);
  const range = useVirtualRange(list.length, listRef);

  // A filtered-down list makes the previous scroll offset meaningless (it
  // could now point past the end, or mid-way through unrelated rows) — jump
  // back to the top of the list whenever the query or filter changes.
  useEffect(() => {
    const scrollEl = listRef.current?.closest('.sheet-scroll');
    scrollEl?.scrollTo(0, 0);
  }, [pickQuery, pickBodyPart]);

  if (!active && !pickerTargetSessionId) return null;
  const entriesInTarget = pickerTargetSessionId ? (historySession?.entries ?? []) : (active?.entries ?? []);
  const alreadyIn = new Set(entriesInTarget.map((e) => e.exerciseId));

  function toggle(id: string) {
    if (alreadyIn.has(id)) {
      showToast(pickerTargetSessionId ? 'Already in this workout' : 'Already in your workout');
      return;
    }
    togglePickSelected(id);
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
          {pickQuery && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => setPickQuery('')}
            >
              ×
            </button>
          )}
        </div>
        <div className="chips">
          {bps.map((bp) => (
            <button
              key={bp}
              className={`chip${pickBodyPart === bp ? ' on' : ''}`}
              aria-pressed={pickBodyPart === bp}
              onClick={() => setPickBodyPart(bp)}
            >
              {bp === 'all' ? 'All' : bp}
            </button>
          ))}
        </div>
      </div>

      {recentExercises.length > 0 && (
        <div style={{ marginBottom: 4 }}>
          <div className="section-h" style={{ margin: '0 2px 6px' }}>Recent</div>
          <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
            {recentExercises.map((ex) => {
              const isIn = alreadyIn.has(ex.id);
              const isSelected = selected.has(ex.id);
              return (
                <button
                  key={ex.id}
                  type="button"
                  aria-label={ex.name}
                  aria-pressed={isSelected}
                  onClick={() => toggle(ex.id)}
                  style={{
                    flex: 'none',
                    width: 58,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 4,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    opacity: isIn ? 0.5 : 1,
                  }}
                >
                  <Thumb
                    className="pick-thumb"
                    src={ex.image}
                    alt=""
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 10,
                      outline: isSelected ? '2px solid var(--accent)' : 'none',
                      outlineOffset: 1,
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: 'var(--faint)',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                    }}
                  >
                    {ex.name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div ref={listRef}>
        <div style={{ height: range.start * ROW_HEIGHT }} />
        {list.slice(range.start, range.end).map((ex) => {
          const isIn = alreadyIn.has(ex.id);
          const isSelected = selected.has(ex.id);
          return (
            <div
              className="pick-row"
              key={ex.id}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => toggle(ex.id)}
              onKeyDown={(e) => {
                // Ignore keys bubbled from the inner "i" (details) button —
                // otherwise Enter on it both opens the detail sheet and
                // toggles this exercise's selection.
                if (e.target !== e.currentTarget) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  toggle(ex.id);
                }
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
                  openDetailFromPicker(ex.id);
                }}
              >
                i
              </button>
              <div className={`pick-check${isIn || isSelected ? ' on' : ''}`}>✓</div>
            </div>
          );
        })}
        <div style={{ height: (list.length - range.end) * ROW_HEIGHT }} />
      </div>
      {list.length === 0 && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>Nothing found</p>}

      <div className="sheet-footer">
        <button className="btn" disabled={selected.size === 0} onClick={() => addExercisesToSession(Array.from(selected))}>
          {selected.size === 0 ? 'Select exercises' : `Add ${selected.size} exercise${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
