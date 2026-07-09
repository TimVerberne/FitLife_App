import { useState } from 'react';
import type { SessionEntry, WorkoutSession } from '../lib/types';
import { exerciseById } from '../lib/exercises';
import { newRecordsInWorkout, relativeDate, setsCountOf, volumeOf } from '../lib/records';
import { AVATAR_COLORS } from '../lib/seedData';
import { Thumb } from './Thumb';

const COLLAPSED_COUNT = 3;

function doneCount(entry: SessionEntry): number {
  return entry.sets.filter((s) => s.done).length;
}

export function WorkoutFeedCard({
  session,
  allSessions,
  onOpen,
}: {
  session: WorkoutSession;
  allSessions: WorkoutSession[];
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const colors = AVATAR_COLORS[session.person];
  const records = newRecordsInWorkout(allSessions, session);
  const shown = expanded ? session.entries : session.entries.slice(0, COLLAPSED_COUNT);
  const remaining = session.entries.length - shown.length;

  return (
    <div className="feed-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onOpen()}>
      <div className="feed-head">
        <div className="av round" style={{ background: colors.bg, color: colors.ink }}>
          {session.person.slice(0, 1)}
        </div>
        <div>
          <div className="crew-name">{session.person}</div>
          <div className="feed-when">{relativeDate(session.startedAt)}</div>
        </div>
      </div>

      <div className="feed-title">{session.name}</div>

      <div className="feed-stats-row">
        <div className="feed-stat">
          <div className="l">Time</div>
          <div className="v">{session.durationMin}min</div>
        </div>
        <div className="feed-stat">
          <div className="l">Volume</div>
          <div className="v">{Math.round(volumeOf(session.entries)).toLocaleString('en-US')} kg</div>
        </div>
        <div className="feed-stat">
          <div className="l">Records</div>
          <div className={`v${records > 0 ? ' gold' : ''}`}>{records > 0 ? `🏆 ${records}` : '—'}</div>
        </div>
        <div className="feed-stat">
          <div className="l">Sets</div>
          <div className="v">{setsCountOf(session.entries)}</div>
        </div>
      </div>

      {shown.map((entry, i) => {
        const ex = exerciseById(entry.exerciseId);
        if (!ex) return null;
        return (
          <div className="feed-ex-row" key={i}>
            <Thumb className="ph" src={ex.image} alt={ex.name} />
            <div className="feed-ex-text">
              {doneCount(entry)} {doneCount(entry) === 1 ? 'set' : 'sets'} <b>{ex.name}</b>
            </div>
          </div>
        );
      })}

      {remaining > 0 && (
        <button
          className="feed-more"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          See {remaining} more exercise{remaining === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
