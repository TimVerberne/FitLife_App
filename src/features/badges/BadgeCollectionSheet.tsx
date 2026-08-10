import { useMemo, useState } from 'react';
import { useStore } from '../../store/useStore';
import { BadgeIcon } from '../../components/BadgeIcon';
import {
  BADGE_DEFS,
  BADGE_GROUP_ORDER,
  TOTAL_BADGE_COUNT,
  computeBadgeMetrics,
  computeEarnedBadges,
  ladderProgress,
  type BadgeContext,
  type BadgeDef,
  type BadgeGroup,
} from '../../lib/badges';

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

function unlockedDateLabel(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

// A single climbing track — your current badge, the next one to work toward
// with a progress readout, expandable to the full ladder.
function LadderRow({
  ladderId,
  earned,
  value,
  own,
  picks,
  onPin,
}: {
  ladderId: string;
  earned: Map<string, number>;
  value: number;
  own: boolean;
  picks: string[];
  onPin: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const tiers = useMemo(() => BADGE_DEFS.filter((d) => d.ladderId === ladderId), [ladderId]);
  const prog = ladderProgress(ladderId, earned, value);
  const current = prog.current;
  const next = prog.next;
  const display = current ?? tiers[0];
  const pct = next ? Math.min(100, Math.round((value / next.threshold) * 100)) : 100;

  return (
    <div className="card" style={{ padding: 12, marginTop: 8 }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', color: 'inherit' }}
      >
        <BadgeIcon def={display} earned={!!current} size={48} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, textTransform: 'uppercase' }}>
            {current ? current.name : `${display.name} (locked)`}
          </div>
          <div style={{ fontSize: 12, color: 'var(--faint)', marginTop: 2 }}>
            {next ? `${fmt(value)} of ${fmt(next.threshold)} ${next.unit}` : `Maxed — all ${prog.total} tiers`}
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'var(--surface-2)', marginTop: 7, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
        </div>
        <span style={{ color: 'var(--faint)', fontSize: 18 }}>{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 14, justifyContent: 'center' }}>
          {tiers.map((t) => {
            const ts = earned.get(t.id);
            return (
              <div key={t.id} style={{ width: 92, textAlign: 'center' }}>
                <BadgeIcon def={t} earned={!!ts} size={64} />
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', marginTop: 2, lineHeight: 1.1 }}>
                  {t.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--faint)', fontFamily: 'var(--font-mono)' }}>{fmt(t.threshold)} {t.unit}</div>
                {ts && <div style={{ fontSize: 9, color: 'var(--faint)', marginTop: 1 }}>{unlockedDateLabel(ts)}</div>}
                {own && ts && (
                  <button
                    onClick={() => onPin(t.id)}
                    className="pin-btn"
                    aria-pressed={picks.includes(t.id)}
                    style={{ marginTop: 3 }}
                  >
                    {picks.includes(t.id) ? '★ Pinned' : '☆ Pin'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function OneoffTile({
  def,
  earned,
  own,
  picks,
  onPin,
}: {
  def: BadgeDef;
  earned: Map<string, number>;
  own: boolean;
  picks: string[];
  onPin: (id: string) => void;
}) {
  const ts = earned.get(def.id);
  return (
    <div style={{ width: 96, textAlign: 'center' }}>
      <BadgeIcon def={def} earned={!!ts} size={64} />
      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', marginTop: 2, lineHeight: 1.1 }}>
        {def.name}
      </div>
      <div style={{ fontSize: 10, color: 'var(--faint)' }}>{ts ? unlockedDateLabel(ts) : 'Locked'}</div>
      {own && ts && (
        <button onClick={() => onPin(def.id)} className="pin-btn" aria-pressed={picks.includes(def.id)} style={{ marginTop: 3 }}>
          {picks.includes(def.id) ? '★ Pinned' : '☆ Pin'}
        </button>
      )}
    </div>
  );
}

export function BadgeCollectionSheet() {
  const person = useStore((s) => s.viewingBadgesPerson);
  const own = person === 'You';
  const ownSessions = useStore((s) => s.sessions);
  const friendSessions = useStore((s) => s.friendSessions);
  const routines = useStore((s) => s.routines);
  const friends = useStore((s) => s.friends);
  const settings = useStore((s) => s.settings);
  const toggleShowcaseBadge = useStore((s) => s.toggleShowcaseBadge);
  const showToast = useStore((s) => s.showToast);

  const picks = own ? settings.showcaseBadges ?? [] : [];

  const { earned, metricsForLadder } = useMemo(() => {
    const ctx: BadgeContext = own
      ? {
          sessions: ownSessions,
          person: 'You',
          routines,
          weekStart: settings.weekStart,
          now: Date.now(),
          social: {
            hasFriend: friends.length > 0,
            firstFriendAt: settings.firstFriendAt ?? null,
            firstComparisonAt: settings.firstComparisonAt ?? null,
            firstReactionGivenAt: settings.firstReactionGivenAt ?? null,
            firstReactionReceivedAt: settings.firstReactionReceivedAt ?? null,
          },
        }
      : { sessions: friendSessions, person, routines: null, weekStart: settings.weekStart, now: Date.now() };
    return { earned: computeEarnedBadges(ctx), metricsForLadder: computeBadgeMetrics(ctx) };
  }, [own, person, ownSessions, friendSessions, routines, friends.length, settings.weekStart, settings.firstFriendAt, settings.firstComparisonAt, settings.firstReactionGivenAt, settings.firstReactionReceivedAt]);

  function handlePin(id: string) {
    const result = toggleShowcaseBadge(id);
    if (result === 'full') showToast('You can showcase 3 — unpin one first');
    else if (result === 'added') showToast('Pinned to your profile');
    else showToast('Unpinned');
  }

  const ladderValue = (ladderId: string): number => {
    switch (ladderId) {
      case 'workouts':
        return metricsForLadder.workouts;
      case 'volume':
        return metricsForLadder.volume;
      case 'streak':
        return metricsForLadder.streakWeeks;
      case 'prs':
        return metricsForLadder.prs;
      case 'consistency':
        return metricsForLadder.consistency;
      case 'variety':
        return metricsForLadder.variety;
      case 'sessionLength':
        return metricsForLadder.sessionMin;
      case 'routinesCreated':
        return metricsForLadder.routinesCreated;
      default:
        return 0;
    }
  };

  return (
    <div className="sheet-in">
      <div className="sheet-h">{own ? 'Achievements' : `${person}'s badges`}</div>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: -6, marginBottom: 4 }}>
        {earned.size} of {TOTAL_BADGE_COUNT} unlocked
        {own && ' · pin up to 3 to show next to your name'}
      </div>

      {BADGE_GROUP_ORDER.map((group) => {
        const groupDefs = BADGE_DEFS.filter((d) => d.group === group);
        const ladderIds = [...new Set(groupDefs.filter((d) => d.ladderId).map((d) => d.ladderId!))];
        const oneoffs = groupDefs.filter((d) => d.kind === 'oneoff');
        return (
          <div key={group}>
            <div className="section-h">{group as BadgeGroup}</div>
            {ladderIds.map((lid) => (
              <LadderRow
                key={lid}
                ladderId={lid}
                earned={earned}
                value={ladderValue(lid)}
                own={own}
                picks={picks}
                onPin={handlePin}
              />
            ))}
            {oneoffs.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 8, justifyContent: 'center' }}>
                {oneoffs.map((d) => (
                  <OneoffTile key={d.id} def={d} earned={earned} own={own} picks={picks} onPin={handlePin} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div style={{ height: 20 }} />
    </div>
  );
}
