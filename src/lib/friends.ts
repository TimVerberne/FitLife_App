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
  const userId = requireUserId();
  const trimmed = email.trim();
  if (!trimmed) return null;
  const { data, error } = await supabase.from('profiles').select('id, email, display_name').ilike('email', trimmed).maybeSingle();
  if (error) throw error;
  if (!data || data.id === userId) return null;
  return toProfile(data);
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
      .select('status')
      .or(`and(requester_id.eq.${userId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${userId})`)
      .maybeSingle();
    return { ok: false, reason: data?.status === 'accepted' ? 'already-friends' : 'already-pending' };
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
  const rawLabels = friendsList.map((f) => labelFor(f.profile));
  const counts = new Map<string, number>();
  rawLabels.forEach((l) => counts.set(l, (counts.get(l) ?? 0) + 1));
  const labels = friendsList.map((f, i) => {
    const raw = rawLabels[i];
    return (counts.get(raw) ?? 0) > 1 ? `${raw} (${f.profile.id.slice(0, 4)})` : raw;
  });
  const results = await Promise.all(friendsList.map((f, i) => fetchFriendSessions(f, labels[i]).catch(() => [] as WorkoutSession[])));
  return results.flat();
}
