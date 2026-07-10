import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { colorForPerson } from '../../lib/colors';
import { fetchAllProfiles, type FriendProfile } from '../../lib/friends';

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
  const sendFriendRequestToProfile = useStore((s) => s.sendFriendRequestToProfile);
  const acceptFriendRequest = useStore((s) => s.acceptFriendRequest);
  const declineFriendRequest = useStore((s) => s.declineFriendRequest);
  const removeFriend = useStore((s) => s.removeFriend);

  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<SendStatus>('idle');

  const [browsing, setBrowsing] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [allProfiles, setAllProfiles] = useState<FriendProfile[]>([]);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

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

  async function toggleBrowse() {
    if (browsing) {
      setBrowsing(false);
      return;
    }
    setBrowsing(true);
    setBrowseLoading(true);
    try {
      setAllProfiles(await fetchAllProfiles());
    } catch {
      setAllProfiles([]);
    } finally {
      setBrowseLoading(false);
    }
  }

  async function sendTo(profile: FriendProfile) {
    setSentIds((s) => new Set(s).add(profile.id));
    const result = await sendFriendRequestToProfile(profile.id);
    if (!result.ok) setSentIds((s) => { const next = new Set(s); next.delete(profile.id); return next; });
  }

  const friendIds = new Set(friends.map((f) => f.profile.id));
  const outgoingIds = new Set(outgoingRequests.map((r) => r.profile.id));
  const incomingIds = new Set(incomingRequests.map((r) => r.profile.id));

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
      <button className="btn sec" style={{ marginTop: 10 }} onClick={toggleBrowse}>
        {browsing ? 'Hide all accounts' : 'Show all accounts'}
      </button>

      {browsing && (
        <div style={{ marginTop: 10 }}>
          {browseLoading ? (
            <p style={{ color: 'var(--faint)', fontSize: 13 }}>Loading…</p>
          ) : allProfiles.length === 0 ? (
            <p style={{ color: 'var(--faint)', fontSize: 13 }}>No other accounts yet.</p>
          ) : (
            allProfiles.map((p) => {
              const already = friendIds.has(p.id) || outgoingIds.has(p.id) || incomingIds.has(p.id) || sentIds.has(p.id);
              const label = friendIds.has(p.id)
                ? 'Friends'
                : incomingIds.has(p.id)
                  ? 'Respond above'
                  : 'Pending';
              return (
                <div className="settings-row" key={p.id}>
                  <FriendRow name={p.displayName ?? p.email} />
                  {already ? (
                    <span style={{ fontSize: 12, color: 'var(--faint)' }}>{label}</span>
                  ) : (
                    <button
                      className="btn sec"
                      aria-label={`Add ${p.displayName ?? p.email}`}
                      style={{ width: 34, height: 34, padding: 0, fontSize: 18, fontWeight: 900 }}
                      onClick={() => void sendTo(p)}
                    >
                      +
                    </button>
                  )}
                </div>
              );
            })
          )}
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
