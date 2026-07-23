import { useId, type ReactNode } from 'react';
import type { BadgeDef, BadgeIconKey } from '../lib/badges';

// The banner-crest badge from the FitFlow Badge System design: one shield
// shape reused across every track, in three states — locked (dim outline),
// unlocked (tier colour + ornament), and max tier (platinum, crowned, winged,
// with a soft pulsing glow). The category icon in the centre tells you which
// track it belongs to; the ornament above the shield steps up with the tier.

const SHIELD = 'M48 42 H112 V96 L80 122 L48 96 Z';

// Tier colour ramp for unlocked, non-max badges. Matches the design's oklch
// palette (mint = the app's Onyx Volt accent). Works in both themes.
const RAMP = [
  'oklch(72% 0.03 250)', // 0 — steel entry tier
  'oklch(84% 0.15 152)', // 1 — mint
  'oklch(70% 0.12 55)', // 2 — bronze/ember
  'oklch(85% 0.15 90)', // 3 — gold
  'oklch(80% 0.13 210)', // 4 — blue
  'oklch(72% 0.17 300)', // 5 — violet
  'oklch(75% 0.16 25)', // 6 — red
];

// oklch colour with an alpha channel for the shield fill wash.
function withAlpha(oklch: string, alpha: number): string {
  const inner = oklch.slice(oklch.indexOf('(') + 1, oklch.lastIndexOf(')'));
  return `oklch(${inner} / ${alpha})`;
}

// Category icons, transcribed from the design file. Each is drawn inside the
// shield via translate(60,46) scale(1.6); colour comes from the parent `color`.
function categoryIcon(key: BadgeIconKey): ReactNode {
  switch (key) {
    case 'runner':
      return (
        <g fill="currentColor" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="15.5" cy="4.3" r="2.15" />
          <line x1="14.3" y1="6.2" x2="11" y2="14" strokeWidth="3.2" />
          <line x1="11" y1="14" x2="6.3" y2="20.6" strokeWidth="2.6" />
          <line x1="11" y1="14" x2="16.4" y2="11.2" strokeWidth="2.6" />
          <line x1="16.4" y1="11.2" x2="14.5" y2="17.2" strokeWidth="2.3" />
          <line x1="13.8" y1="7" x2="19.2" y2="10.6" strokeWidth="2.1" />
          <line x1="13.8" y1="7" x2="8.8" y2="10" strokeWidth="2.1" />
        </g>
      );
    case 'dumbbell':
      return (
        <path
          fill="currentColor"
          d="M6 10.5V8.2c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v.9h5.6v-.9c0-.9.7-1.6 1.6-1.6s1.6.7 1.6 1.6v2.3c.8.3 1.4 1.1 1.4 2s-.6 1.7-1.4 2v2.3c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-.9H9.2v.9c0 .9-.7 1.6-1.6 1.6s-1.6-.7-1.6-1.6v-2.3C5.2 14.2 4.6 13.4 4.6 12.5s.6-1.7 1.4-2z"
        />
      );
    case 'flame':
      return (
        <path
          fill="currentColor"
          d="M12 2c1.4 2.6 3.7 4.2 3.7 8 0 .7-.1 1.3-.3 1.9 1-1 1.6-2.3 1.6-3.9 0-.5 0-1-.1-1.5 1.6 1.8 2.6 4.1 2.6 6.8 0 4.4-3.4 7.7-7.5 7.7s-7.5-3.3-7.5-7.7c0-1.9.6-3.4 1.5-4.7-.1.5-.1.9-.1 1.4 0 1.5.5 2.7 1.4 3.6-.2-.6-.3-1.3-.3-2 0-3.4 1.7-5.1 3-6.6.6-.7 1.2-1.4 1.6-2.4.6.7 1 1.3 1.3 1.9-.6-1.1-.9-2.1-.9-3.5z"
        />
      );
    case 'trophy':
      return (
        <path
          fill="currentColor"
          d="M7 4h10v3.2c0 .5-.1 1-.3 1.4h2.1c.7 0 1.2.5 1.2 1.2 0 2.5-1.8 4.5-4.2 4.9-.7 1.1-1.8 1.9-3.1 2.2v2.1h2.1c.6 0 1 .4 1 1s-.4 1-1 1H9.2c-.6 0-1-.4-1-1s.4-1 1-1h2.1v-2.1c-1.3-.3-2.4-1.1-3.1-2.2C5.9 14.3 4.1 12.3 4.1 9.8c0-.7.5-1.2 1.2-1.2h2.1C7.1 8.2 7 7.7 7 7.2V4zm-2.1 6c.2 1.2 1 2.2 2.1 2.7V9.4H5.2c-.1 0-.2.1-.2.2v.4zm14.2 0v.4c0 .1-.1.2-.2.2h-1.8v3.3c1.1-.5 1.9-1.5 2.1-2.7v-1.2z"
        />
      );
    case 'calendar':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="5" width="16" height="16" rx="2" />
          <path d="M4 10h16" />
          <path d="M8 3v4" />
          <path d="M16 3v4" />
          <path d="M9 15l2 2 4-4" />
        </g>
      );
    case 'shuffle':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h4l9 12h3" />
          <path d="M4 18h4l9-12h3" />
          <path d="M17 3l3 3-3 3" />
          <path d="M17 15l3 3-3 3" />
        </g>
      );
    case 'clock':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="13" r="7" />
          <path d="M12 13V9" />
          <path d="M10 2h4" />
        </g>
      );
    case 'checklist':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6h11" />
          <path d="M9 12h11" />
          <path d="M9 18h11" />
          <path d="M4 6l1.2 1.2L7 5" />
          <path d="M4 12l1.2 1.2L7 11" />
          <path d="M4 18l1.2 1.2L7 17" />
        </g>
      );
    case 'sunrise':
      return (
        <g fill="currentColor">
          <line x1="12" y1="7.6" x2="12" y2="3.2" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <line x1="7.7" y1="9.6" x2="5" y2="6.3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <line x1="16.3" y1="9.6" x2="19" y2="6.3" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" />
          <path d="M5 16.4a7 7 0 0 1 14 0z" />
          <rect x="2" y="17.5" width="20" height="2.1" rx="1.05" />
        </g>
      );
    case 'lightning':
      return <path fill="currentColor" d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" />;
    case 'people':
      return (
        <g fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
          <path d="M16 5.2a3.2 3.2 0 0 1 0 6" />
          <path d="M17.5 14.4a5.5 5.5 0 0 1 3 5" />
        </g>
      );
  }
}

// Ornament above the shield — steps up with the tier (dots → gem → star),
// with crown + wings reserved for the apex. Coloured by the tier accent.
function ornament(tierIndex: number, color: string): ReactNode {
  if (tierIndex <= 0) return null;
  if (tierIndex === 1)
    return (
      <g fill={color}>
        <circle cx="72" cy="34" r="3" />
        <circle cx="88" cy="34" r="3" />
      </g>
    );
  if (tierIndex === 2)
    return (
      <g fill={color}>
        <circle cx="66" cy="34" r="3" />
        <circle cx="80" cy="34" r="3" />
        <circle cx="94" cy="34" r="3" />
      </g>
    );
  if (tierIndex === 3)
    // gem
    return <path fill={color} d="M80 25 L89 34 L80 43 L71 34 Z" />;
  // star (high tiers)
  return (
    <path
      fill={color}
      d="M80 24 l3.2 6.6 7.2 .9 -5.3 5 1.3 7.1 -6.4 -3.5 -6.4 3.5 1.3 -7.1 -5.3 -5 7.2 -.9 Z"
    />
  );
}

export function BadgeIcon({ def, earned, size = 72 }: { def: BadgeDef; earned: boolean; size?: number }) {
  const gradId = useId().replace(/:/g, '');
  const isMax = def.tierCount > 1 && def.tierIndex === def.tierCount - 1;

  if (!earned) {
    // Locked — dim outline, muted icon, no ornament.
    return (
      <svg width={size} height={size} viewBox="0 0 160 160" style={{ overflow: 'visible', opacity: 0.55 }} aria-hidden="true">
        <path d={SHIELD} fill="transparent" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
        <g transform="translate(60,46) scale(1.6)" style={{ color: 'var(--faint)' }}>
          {categoryIcon(def.icon)}
        </g>
      </svg>
    );
  }

  if (isMax) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 160 160"
        style={{ overflow: 'visible', filter: 'drop-shadow(0 0 7px rgba(190,215,255,.45))', animation: 'badgePulse 2.6s ease-in-out infinite' }}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0.5" y2="1">
            <stop offset="0" stopColor="#eaf2ff" />
            <stop offset="42%" stopColor="#9fe6d8" />
            <stop offset="72%" stopColor="#9aa6ff" />
            <stop offset="100%" stopColor="#5a3f8a" />
          </linearGradient>
        </defs>
        {/* wings */}
        <g fill="#cbd8ff" transform="translate(110,66)">
          <polygon points="0,-4 21,-16.5 18,-6 6,2" />
          <polygon points="2,4 24,-6 21,3 8,10" opacity="0.8" />
        </g>
        <g fill="#cbd8ff" transform="scale(-1,1) translate(-50,66)">
          <polygon points="0,-4 21,-16.5 18,-6 6,2" />
          <polygon points="2,4 24,-6 21,3 8,10" opacity="0.8" />
        </g>
        {/* crown */}
        <g fill="#eaf2ff" transform="translate(80,32)">
          <path d="M-16 6 L-18 -8 L-7 0 L0 -12 L7 0 L18 -8 L16 6 Z" />
          <circle cx="0" cy="-10" r="2.4" />
        </g>
        <path d={SHIELD} fill={`url(#${gradId})`} stroke="#eaf2ff" strokeWidth="3" strokeLinejoin="round" />
        <g transform="translate(60,46) scale(1.6)" style={{ color: '#2a2350' }}>
          {categoryIcon(def.icon)}
        </g>
      </svg>
    );
  }

  // Unlocked, non-max — tier colour + ornament.
  const color = RAMP[Math.min(def.tierIndex, RAMP.length - 1)];
  return (
    <svg width={size} height={size} viewBox="0 0 160 160" style={{ overflow: 'visible' }} aria-hidden="true">
      {ornament(def.tierIndex, color)}
      <path d={SHIELD} fill={withAlpha(color, 0.16)} stroke={color} strokeWidth="3" strokeLinejoin="round" />
      <g transform="translate(60,46) scale(1.6)" style={{ color }}>
        {categoryIcon(def.icon)}
      </g>
    </svg>
  );
}

// Compact horizontal strip of showcase badges shown next to a name. Renders
// nothing when there are no badges to show (no empty placeholder).
export function BadgeStrip({ ids, byId, size = 20 }: { ids: string[]; byId: Map<string, BadgeDef>; size?: number }) {
  const defs = ids.map((id) => byId.get(id)).filter((d): d is BadgeDef => !!d);
  if (defs.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 1, verticalAlign: 'middle' }}>
      {defs.map((d) => (
        <BadgeIcon key={d.id} def={d} earned size={size} />
      ))}
    </span>
  );
}
