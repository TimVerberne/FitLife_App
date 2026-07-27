import { useState } from 'react';
import { useStore } from '../store/useStore';
import { BadgeIcon } from './BadgeIcon';
import { CelebrationOverlay, Rays, Ring, Sparks, type Spark } from './CelebrationFx';

// "Achievement unlocked" — the celebration from the FitFlow Badge System
// design: a cool-white rays wash and expanding ring, a fan of sparks, and
// the crest popping in then floating, with the copy rising in beneath it.
//
// Several badges at once are shown a couple in sequence, with the rest
// folded into a single "+N more" note rather than a wall of pop-ups.
const SHOWN_IN_SEQUENCE = 2;

const UNLOCK_SPARKS: Spark[] = [
  { rot: -72, size: 6, color: 'oklch(84% 0.15 152)', shape: 'diamond', dur: 1.5, delay: 0.42 },
  { rot: -56, size: 9, color: '#cbd8ff', shape: 'circle', dur: 1.5, delay: 0.47 },
  { rot: -40, size: 12, color: '#9aa6ff', shape: 'diamond', dur: 1.5, delay: 0.53 },
  { rot: -24, size: 6, color: '#eaf2ff', shape: 'circle', dur: 1.5, delay: 0.58 },
  { rot: -9, size: 9, color: 'oklch(85% 0.15 90)', shape: 'diamond', dur: 1.5, delay: 0.64 },
  { rot: 9, size: 12, color: 'oklch(84% 0.15 152)', shape: 'circle', dur: 1.5, delay: 0.7 },
  { rot: 24, size: 6, color: '#cbd8ff', shape: 'diamond', dur: 1.5, delay: 0.42 },
  { rot: 40, size: 9, color: '#9aa6ff', shape: 'circle', dur: 1.5, delay: 0.47 },
  { rot: 56, size: 12, color: '#eaf2ff', shape: 'diamond', dur: 1.5, delay: 0.53 },
  { rot: 72, size: 6, color: 'oklch(85% 0.15 90)', shape: 'circle', dur: 1.5, delay: 0.58 },
  { rot: -108, size: 9, color: 'oklch(84% 0.15 152)', shape: 'diamond', dur: 1.5, delay: 0.64 },
  { rot: 108, size: 12, color: '#cbd8ff', shape: 'circle', dur: 1.5, delay: 0.7 },
];

export function BadgeCelebration() {
  const badges = useStore((s) => s.badgeCelebration);
  const dismiss = useStore((s) => s.dismissBadgeCelebration);
  const [index, setIndex] = useState(0);

  if (!badges || badges.length === 0) return null;

  const sequence = badges.slice(0, SHOWN_IN_SEQUENCE);
  const overflow = badges.length - sequence.length;
  const badge = sequence[Math.min(index, sequence.length - 1)];
  const isLast = index >= sequence.length - 1;
  const tierLabel = badge.tierCount > 1 ? `${badge.group} · Tier ${badge.tierIndex + 1}` : badge.group;

  function close() {
    setIndex(0);
    dismiss();
  }

  function advance() {
    if (isLast) close();
    else setIndex((i) => i + 1);
  }

  return (
    <CelebrationOverlay onClose={close} background="rgba(0,0,0,.92)" padding="0 24px" label="Achievement unlocked">
      <Rays size={320} color="rgba(160,190,255,.20)" delay={0.2} />
      <Ring size={190} color="rgba(203,216,255,.6)" dur={1.1} delay={0.3} />
      <Sparks sparks={UNLOCK_SPARKS} top="40%" />

      {/* `key` restarts every entrance animation when the next badge in the
          sequence takes over, so #2 pops in exactly like #1 did. */}
      <div
        key={badge.id}
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 11,
            letterSpacing: '.22em',
            color: '#cbd8ff',
            textTransform: 'uppercase',
            animation: 'riseIn .5s ease-out .1s both',
          }}
        >
          Achievement unlocked
        </div>

        <div style={{ animation: 'crestFloat 4.2s ease-in-out 1.3s infinite' }}>
          <div
            style={{
              animation: 'crestPop .82s cubic-bezier(.18,.9,.3,1.05) .22s both',
              filter: 'drop-shadow(0 0 12px rgba(190,215,255,.5))',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <BadgeIcon def={badge} earned size={150} />
          </div>
        </div>

        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 28,
            color: '#F4F4F2',
            textTransform: 'uppercase',
            lineHeight: 1,
            animation: 'riseIn .55s ease-out .75s both',
          }}
        >
          {badge.name}
        </div>

        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: '#8f96a3',
            animation: 'riseIn .55s ease-out .88s both',
          }}
        >
          {tierLabel}
        </div>

        {isLast && overflow > 0 && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              fontWeight: 700,
              color: 'oklch(84% 0.15 152)',
              animation: 'riseIn .55s ease-out .95s both',
            }}
          >
            +{overflow} more unlocked
          </div>
        )}

        <button
          onClick={advance}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: '.1em',
            textTransform: 'uppercase',
            color: '#08110c',
            background: 'oklch(84% 0.15 152)',
            border: 'none',
            borderRadius: 10,
            padding: '11px 26px',
            marginTop: 6,
            cursor: 'pointer',
            animation: 'riseIn .55s ease-out 1.02s both',
          }}
        >
          {isLast ? 'Keep going' : `Next (${index + 1}/${sequence.length})`}
        </button>
      </div>
    </CelebrationOverlay>
  );
}
