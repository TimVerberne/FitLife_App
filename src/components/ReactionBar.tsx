import { useState } from 'react';
import { useStore } from '../store/useStore';
import { getCurrentUserId } from '../lib/supabase';
import { REACTION_CODES, REACTION_GLYPH, REACTION_LABEL, groupByCode, type ReactionCode } from '../lib/reactions';

// Every control here sits inside WorkoutFeedCard, which is itself one big
// click target that opens the workout. Without stopping propagation, tapping
// 🔥 would both react AND open the sheet — the same trap the card's existing
// "See N more" button already works around.
function swallow(e: React.MouseEvent | React.KeyboardEvent) {
  e.stopPropagation();
}

export function ReactionBar({ sessionId, size = 'normal' }: { sessionId: string; size?: 'normal' | 'large' }) {
  const reactions = useStore((s) => s.reactions.get(sessionId));
  const toggleReaction = useStore((s) => s.toggleReaction);
  const openReactorList = useStore((s) => s.openReactorList);
  const [picking, setPicking] = useState(false);

  const me = getCurrentUserId();
  const groups = groupByCode(reactions ?? []);
  const large = size === 'large';

  function pick(code: ReactionCode, e: React.MouseEvent) {
    e.stopPropagation();
    setPicking(false);
    toggleReaction(sessionId, code);
  }

  return (
    <div className={`rx-bar${large ? ' large' : ''}`} onClick={swallow} onKeyDown={swallow}>
      {groups.map(({ code, reactions: rs }) => {
        const mine = !!me && rs.some((r) => r.userId === me);
        return (
          <button
            key={code}
            type="button"
            className={`rx-pill${mine ? ' on' : ''}`}
            aria-pressed={mine}
            aria-label={`${REACTION_LABEL[code]}, ${rs.length} ${rs.length === 1 ? 'person' : 'people'}${mine ? ', including you' : ''}`}
            onClick={(e) => pick(code, e)}
          >
            <span className="rx-glyph">{REACTION_GLYPH[code]}</span>
            <span className="rx-count">{rs.length}</span>
          </button>
        );
      })}

      <button
        type="button"
        className="rx-add"
        aria-label="Add a reaction"
        aria-expanded={picking}
        onClick={(e) => {
          e.stopPropagation();
          setPicking((p) => !p);
        }}
      >
        {picking ? '×' : '+'}
      </button>

      {/* Tapping a count opens the full list of who reacted. Only offered
          once there's something to show. */}
      {groups.length > 0 && (
        <button
          type="button"
          className="rx-who"
          onClick={(e) => {
            e.stopPropagation();
            openReactorList(sessionId);
          }}
        >
          Who?
        </button>
      )}

      {picking && (
        <div className="rx-picker" role="group" aria-label="Pick a reaction">
          {REACTION_CODES.map((code) => (
            <button
              key={code}
              type="button"
              className="rx-picker-btn"
              aria-label={REACTION_LABEL[code]}
              onClick={(e) => pick(code, e)}
            >
              {REACTION_GLYPH[code]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
