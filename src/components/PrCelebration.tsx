import { useStore } from '../store/useStore';
import { exerciseById } from '../lib/exercises';
import { formatWeight, toDisplayWeight } from '../lib/units';
import { CelebrationOverlay, Rays, Ring, Sparks, Streaks, type Spark } from './CelebrationFx';

// "Personal record" — the in-session celebration from the FitFlow Badge
// System design: mint streaks rising up a blurred backdrop, a gold rays
// wash and ring, sparks, the gold trophy crest, one of four rotating lines,
// and a card breaking down the lift against the record it just beat.

const PR_SPARKS: Spark[] = [
  { rot: -70, size: 5, color: 'oklch(85% 0.15 90)', shape: 'diamond', dur: 1.4, delay: 0.34 },
  { rot: -52, size: 8, color: '#74E0AE', shape: 'circle', dur: 1.4, delay: 0.4 },
  { rot: -34, size: 11, color: '#F2C94C', shape: 'diamond', dur: 1.4, delay: 0.46 },
  { rot: -16, size: 5, color: '#eaf2ff', shape: 'circle', dur: 1.4, delay: 0.52 },
  { rot: 16, size: 8, color: 'oklch(85% 0.15 90)', shape: 'diamond', dur: 1.4, delay: 0.58 },
  { rot: 34, size: 11, color: '#74E0AE', shape: 'circle', dur: 1.4, delay: 0.34 },
  { rot: 52, size: 5, color: '#F2C94C', shape: 'diamond', dur: 1.4, delay: 0.4 },
  { rot: 70, size: 8, color: '#eaf2ff', shape: 'circle', dur: 1.4, delay: 0.46 },
  { rot: -100, size: 11, color: 'oklch(85% 0.15 90)', shape: 'diamond', dur: 1.4, delay: 0.52 },
  { rot: 100, size: 5, color: '#74E0AE', shape: 'circle', dur: 1.4, delay: 0.58 },
];

// The four rotating headline/subhead pairs from the design.
const PR_LINES: [string, string][] = [
  ['New ceiling.', 'You just moved the bar on yourself.'],
  ["That wasn't luck.", 'Twelve weeks of work just showed up.'],
  ['Stronger than last time.', 'The only comparison that counts.'],
  ['Nobody gave you that.', 'You took it, rep by rep.'],
];

const GOLD = 'oklch(85% 0.15 90)';

// The gold trophy crest, straight from the design's PR overlay.
function TrophyCrest() {
  return (
    <svg width="96" height="96" viewBox="0 0 160 160" style={{ overflow: 'visible', filter: 'drop-shadow(0 0 12px rgba(242,201,76,.45))' }} aria-hidden="true">
      <g fill={GOLD} transform="translate(110,66)">
        <polygon points="0,-4 21,-16.5 18,-6 6,2" />
        <polygon points="2,4 24,-6 21,3 8,10" opacity="0.8" />
      </g>
      <g fill={GOLD} transform="scale(-1,1) translate(-50,66)">
        <polygon points="0,-4 21,-16.5 18,-6 6,2" />
        <polygon points="2,4 24,-6 21,3 8,10" opacity="0.8" />
      </g>
      <path d="M80 24 l3.2 6.6 7.2 .9 -5.3 5 1.3 7.1 -6.4 -3.5 -6.4 3.5 1.3 -7.1 -5.3 -5 7.2 -.9 Z" fill={GOLD} />
      <path d="M48 42 H112 V96 L80 122 L48 96 Z" fill="rgba(0,0,0,.55)" stroke={GOLD} strokeWidth="3" strokeLinejoin="round" />
      <polyline points="68,92 80,97 92,92" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="68,100 80,105 92,100" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <g transform="translate(60,46) scale(1.6)">
        <g fill={GOLD} stroke={GOLD} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 4h10v3.4c0 2.8-2.2 5-5 5s-5-2.2-5-5V4z" fill={GOLD} />
          <path d="M7 6H4.6c0 2.6 1.5 4.3 3.4 4.8" fill="none" />
          <path d="M17 6h2.4c0 2.6-1.5 4.3-3.4 4.8" fill="none" />
          <line x1="12" y1="12.6" x2="12" y2="16.4" />
          <line x1="8.6" y1="17.6" x2="15.4" y2="17.6" strokeWidth="2.4" />
        </g>
      </g>
    </svg>
  );
}

export function PrCelebration() {
  const pr = useStore((s) => s.prCelebration);
  // The achievement overlay is the bigger moment — if a badge unlocked on
  // the same set, let it play first and show this once it's dismissed.
  const badgePending = useStore((s) => s.badgeCelebration);
  const dismiss = useStore((s) => s.dismissPrCelebration);
  const units = useStore((s) => s.settings.units);

  if (!pr || badgePending) return null;

  const ex = exerciseById(pr.exerciseId);
  const [l1, l2] = PR_LINES[pr.line % PR_LINES.length];
  const weight = formatWeight(pr.weight, units);
  const prevWeight = pr.prevWeight === null ? null : formatWeight(pr.prevWeight, units);

  // Headline delta: heavier is the usual story, but beating a record with
  // more reps at the same weight is just as real a PR — say which it was.
  let delta: string | null = null;
  if (pr.prevWeight === null) delta = 'FIRST';
  else if (pr.weight > pr.prevWeight) delta = `+${formatWeight(pr.weight - pr.prevWeight, units)} ${units.toUpperCase()}`;
  else if (pr.prevReps !== null && pr.reps > pr.prevReps) delta = `+${pr.reps - pr.prevReps} REPS`;

  // Uses the OS share sheet where it exists (a standalone PWA on a phone),
  // falling back to the clipboard on desktop browsers that lack it.
  function share() {
    const text = `New PR — ${ex?.name ?? 'lift'}: ${weight}${units} × ${pr!.reps} 🏆`;
    const nav = navigator as Navigator & { share?: (d: { text: string }) => Promise<void> };
    if (nav.share) void nav.share({ text }).catch(() => {});
    else void navigator.clipboard?.writeText(text).catch(() => {});
  }

  return (
    <CelebrationOverlay onClose={dismiss} background="rgba(0,0,0,.9)" blur padding="0 22px" label="New personal record">
      <Streaks />
      <Rays size={300} color="rgba(242,201,76,.16)" top="12%" delay={0.15} />
      <Ring size={150} color="rgba(242,201,76,.55)" top="34%" dur={1.05} delay={0.26} />
      <Sparks sparks={PR_SPARKS} top="34%" />

      <div
        style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 13, width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ animation: 'crestPop .8s cubic-bezier(.18,.9,.3,1.05) .18s both' }}>
          <TrophyCrest />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, animation: 'fadeIn .4s ease-out .5s both' }}>
          <div style={{ height: 1, width: 26, background: 'rgba(242,201,76,.5)', transformOrigin: 'right', animation: 'wipeIn .45s ease-out .5s both' }} />
          <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, letterSpacing: '.24em', color: '#F2C94C', textTransform: 'uppercase' }}>
            Personal record
          </div>
          <div style={{ height: 1, width: 26, background: 'rgba(242,201,76,.5)', transformOrigin: 'left', animation: 'wipeIn .45s ease-out .5s both' }} />
        </div>

        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 34,
            lineHeight: 0.95,
            color: '#F4F4F2',
            textTransform: 'uppercase',
            textWrap: 'balance',
            animation: 'riseIn .5s ease-out .62s both',
          }}
        >
          {l1}
        </div>
        <div
          style={{
            fontSize: 12.5,
            lineHeight: 1.45,
            color: '#9aa4b2',
            maxWidth: 236,
            animation: 'riseIn .5s ease-out .74s both',
          }}
        >
          {l2}
        </div>

        <div
          style={{
            width: '100%',
            maxWidth: 246,
            background: '#0d0f0d',
            border: '1px solid rgba(116,224,174,.22)',
            borderRadius: 14,
            padding: '13px 14px',
            marginTop: 4,
            animation: 'riseIn .5s ease-out .88s both',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: '#F4F4F2', textTransform: 'uppercase', textAlign: 'left' }}>
            {ex?.name ?? 'Exercise'}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 6 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 30, lineHeight: 0.9, color: '#74E0AE' }}>
              {weight}
              <span style={{ fontSize: 14 }}> {units}</span> × {pr.reps}
            </div>
            {delta && (
              <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 10, color: '#F2C94C', paddingBottom: 4 }}>{delta}</div>
            )}
          </div>
          <div style={{ height: 4, borderRadius: 3, background: '#1c1e1a', margin: '10px 0 6px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg,#74E0AE,#F2C94C)',
                transformOrigin: 'left',
                animation: 'barGrow .9s cubic-bezier(.2,.7,.3,1) 1s both',
              }}
            />
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              letterSpacing: '.05em',
              color: '#7c8087',
              textTransform: 'uppercase',
            }}
          >
            <span>{prevWeight === null ? 'First time logged' : `Prev best ${prevWeight} × ${pr.prevReps}`}</span>
            <span>e1RM {Math.round(toDisplayWeight(pr.oneRm, units) * 10) / 10}</span>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 246, marginTop: 2, animation: 'riseIn .5s ease-out 1.02s both' }}>
          <button
            onClick={dismiss}
            style={{
              flex: 1,
              background: '#74E0AE',
              color: '#00110a',
              border: 'none',
              borderRadius: 10,
              padding: 11,
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 14,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Keep going
          </button>
          <button
            onClick={share}
            style={{
              flex: 'none',
              background: 'transparent',
              border: '1px solid rgba(255,255,255,.16)',
              color: '#F4F4F2',
              borderRadius: 10,
              padding: '11px 15px',
              fontFamily: 'var(--font-display)',
              fontWeight: 800,
              fontSize: 14,
              letterSpacing: '.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Share
          </button>
        </div>
      </div>
    </CelebrationOverlay>
  );
}
