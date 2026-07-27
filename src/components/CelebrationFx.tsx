import type { CSSProperties, ReactNode } from 'react';

// Shared visual furniture for the two celebration overlays (achievement
// unlock and new PR), transcribed from the FitFlow Badge System design:
// a radial rays wash, an expanding ring, and a fan of sparks that fly
// outward from behind the crest. Both overlays use the same primitives with
// different palettes, geometry and timings — every number here comes from
// the design, the components just stop it being copy-pasted twice.

export interface Spark {
  rot: number; // degrees around the burst origin
  size: number; // px
  color: string;
  shape: 'circle' | 'diamond';
  dur: number; // seconds
  delay: number; // seconds
}

const DIAMOND_CLIP = 'polygon(50% 0,100% 50%,50% 100%,0 50%)';

// Each spark is a rotated zero-size anchor with an absolutely-positioned
// dot inside; the dot animates straight "up", which the parent's rotation
// turns into an outward throw along that angle.
export function Sparks({ sparks, top }: { sparks: Spark[]; top: string }) {
  return (
    <>
      {sparks.map((s, i) => (
        <div
          key={i}
          className="celebration-spark"
          style={{ position: 'absolute', left: '50%', top, width: 0, height: 0, transform: `rotate(${s.rot}deg)` }}
        >
          <div
            style={{
              position: 'absolute',
              left: -s.size / 2,
              top: -s.size / 2,
              width: s.size,
              height: s.size,
              background: s.color,
              ...(s.shape === 'circle' ? { borderRadius: '50%' } : { clipPath: DIAMOND_CLIP }),
              animation: `sparkFly ${s.dur}s cubic-bezier(.15,.75,.3,1) ${s.delay}s both`,
            }}
          />
        </div>
      ))}
    </>
  );
}

export function Rays({ size, color, top, delay = 0.2 }: { size: number; color: string; top?: string; delay?: number }) {
  return (
    <div
      style={{
        position: 'absolute',
        width: size,
        height: size,
        ...(top ? { top } : {}),
        borderRadius: '50%',
        background: `radial-gradient(circle, ${color} 0%, rgba(0,0,0,0) 70%)`,
        animation: `raysIn .8s ease-out ${delay}s both`,
      }}
    />
  );
}

export function Ring({
  size,
  color,
  top,
  dur,
  delay,
}: {
  size: number;
  color: string;
  top?: string;
  dur: number;
  delay: number;
}) {
  return (
    <div
      className="celebration-ring"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        ...(top ? { top, marginTop: -size / 2 } : {}),
        borderRadius: '50%',
        border: `2px solid ${color}`,
        animation: `ringOut ${dur}s cubic-bezier(.2,.7,.3,1) ${delay}s both`,
      }}
    />
  );
}

// The mint light-streaks that rise up the PR overlay's backdrop.
const STREAKS: { left: string; dur: number; delay: number }[] = [
  { left: '14%', dur: 1.5, delay: 0.2 },
  { left: '32%', dur: 1.68, delay: 0.32 },
  { left: '58%', dur: 1.86, delay: 0.44 },
  { left: '74%', dur: 2.04, delay: 0.56 },
  { left: '88%', dur: 2.22, delay: 0.68 },
];

export function Streaks() {
  return (
    <>
      {STREAKS.map((s, i) => (
        <div
          key={i}
          className="celebration-streak"
          style={{
            position: 'absolute',
            left: s.left,
            bottom: 0,
            width: 2,
            height: 90,
            background: 'linear-gradient(to top, rgba(116,224,174,0), rgba(116,224,174,.5))',
            animation: `streakUp ${s.dur}s ease-out ${s.delay}s both`,
          }}
        />
      ))}
    </>
  );
}

// Full-bleed backdrop shared by both overlays. Sits above the app shell and
// closes on tap anywhere outside the content column.
export function CelebrationOverlay({
  onClose,
  background,
  blur,
  padding,
  label,
  children,
}: {
  onClose: () => void;
  background: string;
  blur?: boolean;
  padding: string;
  label: string;
  children: ReactNode;
}) {
  const style: CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 60,
    background,
    ...(blur ? { backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)' } : {}),
    animation: 'fadeIn .22s ease-out both',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding,
    textAlign: 'center',
    overflow: 'hidden',
  };
  return (
    <div className="celebration-fx" style={style} onClick={onClose} role="dialog" aria-modal="true" aria-label={label}>
      {children}
    </div>
  );
}
