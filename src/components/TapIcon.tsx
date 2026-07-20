import type { CSSProperties } from 'react';

// Small "expand" affordance for any tile/card that opens a bigger detail
// view on tap — the parent must set position: relative.
export function TapIcon({ size = 14, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ position: 'absolute', top: 10, right: 10, opacity: 0.45, ...style }}
    >
      <path
        d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"
        stroke="var(--faint)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
