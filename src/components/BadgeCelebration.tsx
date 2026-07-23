import { useState } from 'react';
import { useStore } from '../store/useStore';
import { BadgeIcon } from './BadgeIcon';
import { BADGE_BY_ID } from '../lib/badges';

// The one-time "Achievement unlocked" celebration, shown after a workout (or
// other action) unlocks new badges. Several at once are shown a couple in
// sequence, with the rest folded into a single "+N more" note rather than a
// wall of pop-ups.
const SHOWN_IN_SEQUENCE = 2;

export function BadgeCelebration() {
  const badges = useStore((s) => s.badgeCelebration);
  const dismiss = useStore((s) => s.dismissBadgeCelebration);
  const openBadges = useStore((s) => s.openBadges);
  const [index, setIndex] = useState(0);

  if (!badges || badges.length === 0) return null;

  const sequence = badges.slice(0, SHOWN_IN_SEQUENCE);
  const overflow = badges.length - sequence.length;
  const badge = sequence[Math.min(index, sequence.length - 1)];
  const isLast = index >= sequence.length - 1;
  const group = BADGE_BY_ID.get(badge.id)?.group;
  const tierLabel =
    badge.tierCount > 1 ? `Tier ${badge.tierIndex + 1} of ${badge.tierCount} · ${group}` : group;

  function close() {
    setIndex(0);
    dismiss();
  }

  return (
    <div
      className="scrim show"
      style={{ zIndex: 60, display: 'grid', placeItems: 'center', padding: 24 }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Achievement unlocked"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 20,
          padding: '30px 26px 24px',
          maxWidth: 320,
          width: '100%',
          textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,.5)',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            color: 'var(--accent)',
            fontWeight: 700,
          }}
        >
          Achievement unlocked
        </div>
        <div style={{ display: 'grid', placeItems: 'center', margin: '14px 0 6px' }}>
          <BadgeIcon def={badge} earned size={128} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 26, textTransform: 'uppercase', lineHeight: 1 }}>
          {badge.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 6, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          {tierLabel}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 10, lineHeight: 1.5 }}>{badge.desc}</div>
        {isLast && overflow > 0 && (
          <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 10, fontWeight: 700 }}>
            +{overflow} more unlocked
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          {isLast ? (
            <>
              <button
                className="btn sec"
                onClick={() => {
                  close();
                  openBadges('You');
                }}
              >
                View all
              </button>
              <button className="btn" onClick={close}>
                Nice!
              </button>
            </>
          ) : (
            <button className="btn" onClick={() => setIndex((i) => i + 1)}>
              Next ({index + 1}/{sequence.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
