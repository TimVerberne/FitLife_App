// Pairs with useCollapsedList — same "Show N more"/"Show less" toggle
// hand-rolled identically at every collapsed-list call site.
export function ShowMoreButton({ hiddenCount, expanded, onToggle }: { hiddenCount: number; expanded: boolean; onToggle: () => void }) {
  if (hiddenCount <= 0 && !expanded) return null;
  return (
    <button className="feed-more" onClick={onToggle}>
      {expanded ? 'Show less' : `Show ${hiddenCount} more`}
    </button>
  );
}
