// Shared visual style for the small selectable pill buttons used across the
// Life tab's forms (activity level, goal, climate, etc.) — same visual
// language as the app's `.seg` toggle but as wrapped chips, since `.seg` is a
// fixed-width flex row unsuited to lists of more than 2-3 options.
export function chipStyle(on: boolean): React.CSSProperties {
  return {
    padding: '8px 12px',
    borderRadius: 9,
    border: `1px solid ${on ? 'var(--accent)' : 'var(--line)'}`,
    background: on ? 'var(--accent)' : 'var(--surface-2)',
    color: on ? 'var(--accent-ink)' : 'var(--text)',
    fontFamily: 'var(--font-display)',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
  };
}
