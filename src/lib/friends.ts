import { supabase, getCurrentUserId } from './supabase';
import type { WorkoutSession } from './types';

export interface FriendProfile {
  id: string;
  email: string;
  displayName: string | null;
}

export interface FriendRequest {
  friendshipId: string;
  profile: FriendProfile;
  createdAt: string;
}

export interface Friend {
  friendshipId: string;
  profile: FriendProfile;
}

function requireUserId(): string {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  return userId;
}

function toProfile(row: { id: string; email: string; display_name: string | null }): FriendProfile {
  return { id: row.id, email: row.email, displayName: row.display_name };
}

export async function searchProfileByEmail(email: string): Promise<FriendProfile | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;
  // Escape LIKE wildcards so an email containing '_' or '%' (both legal in
  // the local part) is matched literally instead of as a single-char / any
  // wildcard — otherwise "tim_v@x.com" could match a different account, or
  // match several and make .maybeSingle() throw.
  const escaped = trimmed.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await supabase.from('profiles').select('id, email, display_name').ilike('email', escaped).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  // Deliberately not excluding your own row here (unlike fetchAllProfiles) —
  // sendFriendRequest()'s self-check downstream is what turns this into the
  // correct "That's your own email" message; filtering it out here instead
  // would surface the wrong, misleading "No FitFlow account with that
  // email" message when you search yourself.
  return toProfile(data);
}

// Every other account on the app — the "profiles readable by authenticated
// users" policy already permits this, no schema change needed. Used for the
// "browse all accounts" list so you can send a request with one tap instead
// of typing an exact email.
export async function fetchAllProfiles(): Promise<FriendProfile[]> {
  const userId = requireUserId();
  const { data, error } = await supabase.from('profiles').select('id, email, display_name').neq('id', userId).order('email');
  if (error) throw error;
  return (data ?? []).map(toProfile);
}

export async function fetchOwnProfile(): Promise<FriendProfile | null> {
  const userId = requireUserId();
  const { data, error } = await supabase.from('profiles').select('id, email, display_name').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

// Every friend-facing read path (labelFor, FriendsSheet) already handles a
// display_name and falls back to the email username — this is what lets a
// user actually set it, instead of every friend seeing that email-username
// fallback forever.
export async function updateOwnDisplayName(name: string): Promise<void> {
  const userId = requireUserId();
  const trimmed = name.trim();
  const { error } = await supabase.from('profiles').update({ display_name: trimmed || null }).eq('id', userId);
  if (error) throw error;
}

export type SendFriendRequestResult = { ok: true } | { ok: false; reason: 'self' | 'already-pending' | 'already-friends' | 'unknown' };

export async function sendFriendRequest(addresseeId: string): Promise<SendFriendRequestResult> {
  const userId = requireUserId();
  if (addresseeId === userId) return { ok: false, reason: 'self' };
  const { error } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: addresseeId, status: 'pending' });
  if (!error) return { ok: true };
  if (error.code === '23505') {
    const { data } = await supabase
      .from('friendships')
      .select('id, status')
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${userId})`)
      .maybeSingle();
    if (data?.status === 'accepted') return { ok: false, reason: 'already-friends' };
    // A previously *declined* row is invisible in the UI (incoming/outgoing
    // lists only show status 'pending'), but its unique constraint blocks
    // every future request forever, so the two users could never reconnect.
    // Clear the stale declined row and re-send a fresh pending request.
    if (data?.status === 'declined' && data.id) {
      await supabase.from('friendships').delete().eq('id', data.id);
      const { error: reErr } = await supabase.from('friendships').insert({ requester_id: userId, addressee_id: addresseeId, status: 'pending' });
      return reErr ? { ok: false, reason: 'unknown' } : { ok: true };
    }
    return { ok: false, reason: 'already-pending' };
  }
  return { ok: false, reason: 'unknown' };
}

interface FriendshipProfileRow {
  id: string;
  created_at: string;
  requester_id?: string;
  addressee_id?: string;
  requester?: { id: string; email: string; display_name: string | null };
  addressee?: { id: string; email: string; display_name: string | null };
}

export async function fetchIncomingRequests(): Promise<FriendRequest[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from('friendships')
    .select('id, created_at, requester:profiles!friendships_requester_id_fkey(id,email,display_name)')
    .eq('addressee_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
  return ((data ?? []) as unknown as FriendshipProfileRow[])
    .filter((row) => row.requester)
    .map((row) => ({ friendshipId: row.id, createdAt: row.created_at, profile: toProfile(row.requester!) }));
}

export async function fetchOutgoingRequests(): Promise<FriendRequest[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from('friendships')
    .select('id, created_at, addressee:profiles!friendships_addressee_id_fkey(id,email,display_name)')
    .eq('requester_id', userId)
    .eq('status', 'pending');
  if (error) throw error;
  return ((data ?? []) as unknown as FriendshipProfileRow[])
    .filter((row) => row.addressee)
    .map((row) => ({ friendshipId: row.id, createdAt: row.created_at, profile: toProfile(row.addressee!) }));
}

export async function fetchFriends(): Promise<Friend[]> {
  const userId = requireUserId();
  const { data, error } = await supabase
    .from('friendships')
    .select(
      'id, requester_id, addressee_id, requester:profiles!friendships_requester_id_fkey(id,email,display_name), addressee:profiles!friendships_addressee_id_fkey(id,email,display_name)',
    )
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`);
  if (error) throw error;
  return ((data ?? []) as unknown as FriendshipProfileRow[])
    .map((row) => {
      const other = row.requester_id === userId ? row.addressee : row.requester;
      return other ? { friendshipId: row.id, profile: toProfile(other) } : null;
    })
    .filter((f): f is Friend => f !== null);
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', friendshipId);
  if (error) throw error;
}

export async function declineFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').update({ status: 'declined', updated_at: new Date().toISOString() }).eq('id', friendshipId);
  if (error) throw error;
}

export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw error;
}

function labelFor(profile: FriendProfile): string {
  return profile.displayName?.trim() || profile.email.split('@')[0];
}

// Disambiguated display labels for every accepted friend, independent of
// whether they've logged any sessions yet — a friend with zero workouts
// still needs a stable label to show up (e.g. with a 0-volume row) rather
// than being invisible until their first sync. Exported so callers that
// need "every friend's label" (not just labels attached to session rows)
// don't have to re-derive the same disambiguation logic.
export function labelsForFriends(friendsList: Friend[]): Map<string, string> {
  const rawLabels = friendsList.map((f) => labelFor(f.profile));
  const counts = new Map<string, number>();
  rawLabels.forEach((l) => counts.set(l, (counts.get(l) ?? 0) + 1));
  const byId = new Map<string, string>();
  friendsList.forEach((f, i) => {
    const raw = rawLabels[i];
    // 'You' is the reserved person-key for the signed-in user. A friend
    // whose display name resolves to "You" (any casing) must be
    // disambiguated with the id suffix too, not just friends who collide
    // with each other — otherwise their session rows are tagged person:'You'
    // and silently merge into your own Workouts/Volume/Streak/records.
    const collides = (counts.get(raw) ?? 0) > 1 || raw.trim().toLowerCase() === 'you';
    byId.set(f.profile.id, collides ? `${raw} (${f.profile.id.slice(0, 4)})` : raw);
  });
  return byId;
}

// Showcase badge picks are the one badge-system field friends need to see, so
// they live on the friend-readable `profiles` table (unlike badgesKnown, which
// stays private in settings). Both reads and writes degrade gracefully: if the
// `showcase_badges` column doesn't exist yet (Phase 11 migration not run) or
// the network is down, callers fall back to badges derived from the friend's
// visible session history.
export async function fetchShowcaseBadges(profileIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (profileIds.length === 0) return map;
  try {
    const { data, error } = await supabase.from('profiles').select('id, showcase_badges').in('id', profileIds);
    if (error) throw error;
    (data ?? []).forEach((r) => {
      const row = r as { id: string; showcase_badges: string[] | null };
      map.set(row.id, row.showcase_badges ?? []);
    });
  } catch {
    // Column missing / offline — return whatever we have (possibly empty).
  }
  return map;
}

export async function pushOwnShowcase(badgeIds: string[]): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) return;
  try {
    const { error } = await supabase.from('profiles').update({ showcase_badges: badgeIds }).eq('id', userId);
    if (error) throw error;
  } catch {
    // Best-effort — picks still persist locally (in settings) and propagate
    // to friends once the migration is run / connectivity returns.
  }
}

async function fetchFriendSessions(friend: Friend, label: string): Promise<WorkoutSession[]> {
  const { data, error } = await supabase.from('sessions').select('*').eq('user_id', friend.profile.id);
  if (error) throw error;
  return (data ?? []).map((s) => ({
    id: s.id,
    person: label,
    name: s.name,
    routineId: s.routine_id,
    startedAt: s.started_at,
    durationMin: s.duration_min,
    entries: s.entries,
  }));
}

// Fetches every accepted friend's own session rows (permitted by the
// "friends can read your sessions" RLS policy) and maps them into
// WorkoutSession-shaped objects tagged with that friend's display label —
// for in-memory display only, never written to Dexie or pushed anywhere.
export async function fetchAllFriendSessions(friendsList: Friend[]): Promise<WorkoutSession[]> {
  const labels = labelsForFriends(friendsList);
  const results = await Promise.all(
    friendsList.map((f) => fetchFriendSessions(f, labels.get(f.profile.id)!).catch(() => [] as WorkoutSession[])),
  );
  return results.flat();
}
