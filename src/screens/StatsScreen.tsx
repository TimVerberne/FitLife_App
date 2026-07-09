import { useMemo, useState } from 'react';
import { useStore } from '../store/useStore';
import type { Person, WorkoutSession } from '../lib/types';
import { volumeOf, weeklyStreak } from '../lib/records';
import { AVATAR_COLORS } from '../lib/seedData';

type Period = 'week' | 'month' | 'all';
const PERIOD_DAYS: Record<Period, number | null> = { week: 7, month: 30, all: null };

function statsFor(sessions: WorkoutSession[], person: Person, periodDays: number | null, now: number) {
  const cutoff = periodDays ? now - periodDays * 86_400_000 : -Infinity;
  const mine = sessions.filter((h) => h.person === person && h.startedAt >= cutoff);
  return {
    person,
    workouts: mine.length,
    volume: mine.reduce((a, h) => a + volumeOf(h.entries), 0),
    streak: weeklyStreak(sessions, person, now),
  };
}

export function StatsScreen() {
  const sessions = useStore((s) => s.sessions);
  const [period, setPeriod] = useState<Period>('week');
  const now = Date.now();

  const board = useMemo(() => {
    const people: Person[] = ['You', 'Sanne', 'Joost'];
    return people
      .map((p) => statsFor(sessions, p, PERIOD_DAYS[period], now))
      .sort((a, b) => b.volume - a.volume);
  }, [sessions, period, now]);

  const you = board.find((b) => b.person === 'You')!;
  const rival = board.find((b) => b.person !== 'You') ?? board[1];

  return (
    <div className="screen">
      <div className="top top-row">
        <div className="h1" style={{ fontSize: 30 }}>Stats</div>
        <div style={{ display: 'flex', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 9, padding: 3 }}>
          {(['week', 'month', 'all'] as Period[]).map((p) => (
            <span
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: period === p ? 800 : 700,
                fontSize: 11,
                background: period === p ? 'var(--accent)' : 'transparent',
                color: period === p ? 'var(--accent-ink)' : 'var(--faint)',
                padding: '5px 9px',
                borderRadius: 6,
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="section-h" style={{ marginTop: 4 }}>Leaderboard · volume</div>
      {board.map((row, i) => {
        const colors = AVATAR_COLORS[row.person];
        const isTop = i === 0;
        return (
          <div
            key={row.person}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              background: isTop ? 'rgba(116,224,174,.1)' : 'var(--surface)',
              border: `1px solid ${isTop ? 'var(--accent)' : 'var(--line)'}`,
              borderRadius: 13,
              padding: '11px 12px',
              marginBottom: 8,
            }}
          >
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: isTop ? 'var(--accent)' : 'var(--faint-2)', width: 16 }}>
              {i + 1}
            </div>
            <div className="av" style={{ width: 34, height: 34, fontSize: 15, background: colors.bg, color: colors.ink }}>
              {row.person.slice(0, 1)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crew-name" style={{ fontSize: 16 }}>{row.person}</div>
              <div className="crew-meta">{row.workouts} WORKOUTS</div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: 19, color: isTop ? 'var(--accent)' : 'var(--ink)', lineHeight: 1 }}>
              {row.volume >= 1000 ? `${(row.volume / 1000).toFixed(1)}` : Math.round(row.volume)}
              {row.volume >= 1000 && <span style={{ fontSize: 10, color: 'var(--faint)' }}>k</span>}
            </div>
          </div>
        );
      })}

      {rival && rival.person !== 'You' && (
        <>
          <div className="section-h">Head to head · vs {rival.person}</div>
          <div className="card">
            <HeadToHeadRow label="Workouts" youVal={you.workouts} rivalVal={rival.workouts} format={(v) => String(v)} />
            <HeadToHeadRow
              label="Volume"
              youVal={you.volume}
              rivalVal={rival.volume}
              format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(Math.round(v)))}
            />
            <HeadToHeadRow label="Streak" youVal={you.streak} rivalVal={rival.streak} format={(v) => String(v)} last />
          </div>
        </>
      )}
    </div>
  );
}

function HeadToHeadRow({
  label,
  youVal,
  rivalVal,
  format,
  last,
}: {
  label: string;
  youVal: number;
  rivalVal: number;
  format: (v: number) => string;
  last?: boolean;
}) {
  const total = youVal + rivalVal;
  const youPct = total > 0 ? (youVal / total) * 100 : 50;
  return (
    <div style={{ marginBottom: last ? 0 : 13 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--faint)', letterSpacing: '.05em', marginBottom: 5 }}>
        <span>{label.toUpperCase()}</span>
        <span>{format(youVal)} · {format(rivalVal)}</span>
      </div>
      <div style={{ display: 'flex', height: 7, borderRadius: 4, overflow: 'hidden', background: 'var(--surface-2)' }}>
        <div style={{ width: `${youPct}%`, background: 'var(--accent)' }} />
        <div style={{ width: 1, background: '#000' }} />
        <div style={{ flex: 1, background: '#3a3d38' }} />
      </div>
    </div>
  );
}
