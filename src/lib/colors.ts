import { ACCENT_PRESETS } from './settings';

const FRIEND_PALETTE = Object.values(ACCENT_PRESETS).map((p) => ({ bg: p.accent, ink: p.accentInk }));

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

// 'You' always gets the user's own accent color; any other person (a friend's
// display label) gets a deterministic pick from the same 8-color palette used
// for the theme's accent presets, so a given friend always looks the same
// color across screens without needing a stored per-friend color.
export function colorForPerson(person: string): { bg: string; ink: string } {
  if (person === 'You') return { bg: 'var(--accent)', ink: 'var(--accent-ink)' };
  return FRIEND_PALETTE[hashString(person) % FRIEND_PALETTE.length];
}
