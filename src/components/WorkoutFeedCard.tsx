import { useState } from 'react';
import type { SessionEntry, WorkoutSession } from '../lib/types';
import { exerciseById } from '../lib/exercises';
import { formatDuration, isWorkingSet, relativeDate, setsCountOf, volumeOf } from '../lib/records';
import { colorForPerson } from '../lib/colors';
import { activateOnKey } from '../lib/a11y';
import { toDisplayWeight } from '../lib/units';
import { useStore } from '../store/useStore';
import { Thumb } from './Thumb';
import { BadgeStrip } from './BadgeIcon';
import { BADGE_BY_ID } from '../lib/badges';

const COLLAPSED_COUNT = 3;

function doneCount(entry: SessionEntry): number {
  return entry.sets.filter(isWorkingSet).length;
}

export function WorkoutFeedCard({
  session,
  records,
  showcaseIds,
  onOpen,
}: {
  session: WorkoutSession;
  // Precomputed by the caller (one shared pass over every session in the
  // feed via records.ts's recordsPerSession) rather than derived here —
  // recomputing per-session records from scratch on every card, on every
  // render, doesn't scale with feed length. See HomeScreen.tsx.
  records: number;
  // The person's <=3 showcase badge ids, resolved once by the caller and
  // shared across all of that person's cards.
  showcaseIds?: string[];
  onOpen: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const units = useStore((s) => s.settings.units);
  const colors = colorForPerson(session.person);
  // Filtered up front (not just skipped in the row-map below) so an entry
  // whose exercise can't be resolved (deleted from the library, or a
  // corrupted import) doesn't throw off the "See N more"/collapsed count —
  // otherwise it'd silently vanish from the rendered rows while still being
  // counted toward `remaining`.
  const validEntries = session.entries.filter((e) => !!exerciseById(e.exerciseId));
  const shown = expanded ? validEntries : validEntries.slice(0, COLLAPSED_COUNT);
  const remaining = validEntries.length - shown.length;

  return (
    <div className="feed-card" role="button" tabIndex={0} onClick={onOpen} onKeyDown={activateOnKey(onOpen)}>
      <div className="feed-head">
        <div className="av round" style={{ background: colors.bg, color: colors.ink }}>
          {session.person.slice(0, 1)}
        </div>
        <div>
          <div className="crew-name" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {session.person}
            {showcaseIds && showcaseIds.length > 0 && <BadgeStrip ids={showcaseIds} byId={BADGE_BY_ID} size={18} />}
          </div>
          <div className="feed-when">{relativeDate(session.startedAt)}</div>
        </div>
      </div>

      <div className="feed-title">{session.name}</div>

      <div className="feed-stats-row">
        <div className="feed-stat">
          <div className="l">Time</div>
          <div className="v">{formatDuration(session.durationMin)}</div>
        </div>
        <div className="feed-stat">
          <div className="l">Volume</div>
          <div className="v">{Math.round(toDisplayWeight(volumeOf(session.entries), units)).toLocaleString('en-US')} {units}</div>
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
          onKeyDown={(e) => e.stopPropagation()}
        >
          See {remaining} more exercise{remaining === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}
