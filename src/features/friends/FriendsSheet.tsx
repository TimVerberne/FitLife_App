import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { colorForPerson } from '../../lib/colors';

type SendStatus = 'idle' | 'sending' | 'sent' | 'not-found' | 'already-pending' | 'already-friends' | 'self' | 'error';

const STATUS_MESSAGE: Record<Exclude<SendStatus, 'idle' | 'sending'>, string> = {
  sent: 'Friend request sent.',
  'not-found': 'No FitFlow account with that email.',
  'already-pending': 'A request between you two is already pending.',
  'already-friends': 'You\'re already friends.',
  self: 'That\'s your own email.',
  error: 'Something went wrong — try again.',
};

export function FriendsSheet() {
  const friends = useStore((s) => s.friends);
  const incomingRequests = useStore((s) => s.incomingRequests);
  const outgoingRequests = useStore((s) => s.outgoingRequests);
  const sendFriendRequest = useStore((s) => s.sendFriendRequest);
  const acceptFriendRequest = useStore((s) => s.acceptFriendRequest);
  const declineFriendRequest = useStore((s) => s.declineFriendRequest);
  const removeFriend = useStore((s) => s.removeFriend);

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus('sending');
    try {
      const result = await sendFriendRequest(email);
      if (result.ok) {
        setStatus('sent');
        setEmail('');
      } else {
        setStatus(result.reason === 'unknown' ? 'error' : result.reason);
      }
    } catch {
      setStatus('error');
    }
  }

  const hasRequests = incomingRequests.length + outgoingRequests.length > 0;

  return (
    <div className="sheet-in">
      <div className="sheet-h">Friends</div>

      <div className="section-h" style={{ margin: '4px 2px 4px' }}>
        Add a friend
      </div>
      <form onSubmit={submit}>
        <div className="search" style={{ marginBottom: 8 }}>
          <input
            type="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setStatus('idle');
            }}
            placeholder="Friend's email"
          />
        </div>
        <button className="btn" type="submit" disabled={!email.trim() || status === 'sending'}>
          {status === 'sending' ? 'Sending…' : 'Send request'}
        </button>
      </form>
      {status !== 'idle' && status !== 'sending' && (
        <div style={{ fontSize: 12, color: status === 'sent' ? 'var(--accent)' : 'var(--danger)', marginTop: 8 }}>
          {STATUS_MESSAGE[status]}
        </div>
      )}

      {hasRequests && (
        <>
          <div className="section-h">Requests</div>
          {incomingRequests.map((req) => (
            <div className="settings-row" key={req.friendshipId}>
              <FriendRow name={req.profile.displayName ?? req.profile.email} />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn sec" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => void acceptFriendRequest(req.friendshipId)}>
                  Accept
                </button>
                <button className="btn danger" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => void declineFriendRequest(req.friendshipId)}>
                  Decline
                </button>
              </div>
            </div>
          ))}
          {outgoingRequests.map((req) => (
            <div className="settings-row" key={req.friendshipId}>
              <div>
                <div className="settings-row-label">{req.profile.displayName ?? req.profile.email}</div>
                <div className="settings-row-desc">Request sent — waiting for them</div>
              </div>
              <button className="btn sec" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => removeFriend(req.friendshipId)}>
                Cancel
              </button>
            </div>
          ))}
        </>
      )}

      <div className="section-h">Your friends</div>
      {friends.length === 0 ? (
        <p style={{ color: 'var(--faint)', fontSize: 13 }}>No friends yet — search their email above to send a request.</p>
      ) : (
        friends.map((f) => (
          <div className="settings-row" key={f.friendshipId}>
            <FriendRow name={f.profile.displayName ?? f.profile.email} />
            <button className="btn danger" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => removeFriend(f.friendshipId)}>
              Remove
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function FriendRow({ name }: { name: string }) {
  const colors = colorForPerson(name);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <div className="av round" style={{ width: 32, height: 32, fontSize: 13, background: colors.bg, color: colors.ink }}>
        {name.slice(0, 1).toUpperCase()}
      </div>
      <div className="settings-row-label">{name}</div>
    </div>
  );
}
