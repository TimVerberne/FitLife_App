import { useMemo, useState } from 'react';
import type { WorkoutSession } from '../lib/types';
import { daysSinceLastWorkout, sessionsByDay, weeklyStreak } from '../lib/records';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const streak = useMemo(() => weeklyStreak(sessions), [sessions]);
  const restDays = useMemo(() => daysSinceLastWorkout(sessions), [sessions]);
  const todayKey = useMemo(() => startOfDay(new Date()).getTime(), []);

  const weeks = useMemo(() => {
    const first = startOfMonth(cursor);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d));
    while (cells.length % 7 !== 0) cells.push(null);
    const rows: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [cursor]);

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
        {WEEKDAY_LABELS.map((l) => (
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
