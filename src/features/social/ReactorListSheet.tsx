import { useStore } from '../../store/useStore';
import { REACTION_GLYPH, REACTION_LABEL, groupByCode } from '../../lib/reactions';

export function ReactorListSheet() {
  const sessionId = useStore((s) => s.reactorListSessionId);
  const reactions = useStore((s) => (sessionId ? s.reactions.get(sessionId) : undefined));
  const ownSessions = useStore((s) => s.sessions);
  const friendSessions = useStore((s) => s.friendSessions);

  if (!sessionId) return null;
  const session = [...ownSessions, ...friendSessions].find((s) => s.id === sessionId);
  const groups = groupByCode(reactions ?? []);

  return (
    <div className="sheet-in">
      <div className="sheet-h">Reactions</div>
      {session && (
        <p style={{ color: 'var(--faint)', fontSize: 13, margin: '0 0 14px' }}>
          {session.name} · {session.person === 'You' ? 'your workout' : session.person}
        </p>
      )}

      {groups.length === 0 ? (
        <p style={{ color: 'var(--faint)', fontSize: 13 }}>No reactions yet.</p>
      ) : (
        groups.map(({ code, reactions: rs }) => (
          <div className="settings-row" key={code} style={{ alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
              <span style={{ fontSize: 22 }} aria-hidden="true">
                {REACTION_GLYPH[code]}
              </span>
              <span className="sr-only">{REACTION_LABEL[code]}</span>
              <span className="rx-count">{rs.length}</span>
            </div>
            {/* Names, not avatars: this list can include people the viewer
                isn't friends with — anyone who can see the workout sees
                everyone who reacted to it. */}
            <div style={{ textAlign: 'right', fontSize: 14, lineHeight: 1.5 }}>
              {rs.map((r) => r.name).join(', ')}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
