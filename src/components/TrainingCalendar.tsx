import { useEffect, useMemo, useState } from 'react';
import type { WorkoutSession } from '../lib/types';
import { daysSinceLastWorkout, sessionsByDay, weeklyStreak } from '../lib/records';
import { useStore } from '../store/useStore';

const WEEKDAY_LABELS_SUN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WEEKDAY_LABELS_MON = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

export function TrainingCalendar({ sessions, onOpen }: { sessions: WorkoutSession[]; onOpen: (id: string) => void }) {
  const weekStart = useStore((s) => s.settings.weekStart);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  // Both the streak and "today" highlight are computed off Date.now()/new
  // Date() at render time — without something to force a periodic
  // recompute, either would silently freeze on a stale value (last week's
  // streak, yesterday's date highlighted) if this screen is left open
  // across a week or day boundary with no new session logged to otherwise
  // trigger a re-render.
  const [nowTick, setNowTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  // nowTick is a deliberate cache-buster, not an input either computation reads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const streak = useMemo(() => weeklyStreak(sessions, 'You', Date.now(), weekStart), [sessions, weekStart, nowTick]);
  const restDays = useMemo(() => daysSinceLastWorkout(sessions), [sessions]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const todayKey = useMemo(() => startOfDay(new Date()).getTime(), [nowTick]);
  const weekdayLabels = weekStart === 'mon' ? WEEKDAY_LABELS_MON : WEEKDAY_LABELS_SUN;

  const weeks = useMemo(() => {
    const first = startOfMonth(cursor);
    const rawWeekday = first.getDay();
    const startWeekday = weekStart === 'mon' ? (rawWeekday + 6) % 7 : rawWeekday;
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor, weekStart]);

  const monthLabel = cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const isCurrentMonth = isSameMonth(cursor, new Date());

  return (
    <div>
      <div className="cal-stats-row">
        <div className="cal-stat">
          🔥 <b>{streak}</b> week streak
        </div>
        <div className="cal-stat">
          🌙 <b>{restDays}</b> rest day{restDays === 1 ? '' : 's'}
        </div>
      </div>

      <div className="cal-nav">
        <button className="cal-arrow" aria-label="Previous month" onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}>
          ‹
        </button>
        <div className="cal-month">{monthLabel}</div>
        <button
          className="cal-arrow"
          aria-label="Next month"
          disabled={isCurrentMonth}
          onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
        >
          ›
        </button>
      </div>

      <div className="cal-weekdays">
        {weekdayLabels.map((l) => (
          <div className="cal-weekday" key={l}>
            {l}
          </div>
        ))}
      </div>

      <div className="cal-grid">
        {weeks.flat().map((date, i) => {
          if (!date) return <div className="cal-cell empty" key={i} />;
          const key = date.getTime();
          const daySessions = byDay.get(key);
          const trained = !!daySessions && daySessions.length > 0;
          return (
            <button
              key={i}
              className={`cal-cell${trained ? ' trained' : ''}${key === todayKey ? ' today' : ''}`}
              disabled={!trained}
              onClick={trained ? () => onOpen(daySessions![0].id) : undefined}
            >
              <span className="cal-daynum">{date.getDate()}</span>
              {trained && <span className="cal-title">{daySessions![0].name}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
