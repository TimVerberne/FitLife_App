import { supabase, getCurrentUserId, fetchAllPages } from './supabase';

// The fixed reaction set. Stored as codes rather than glyphs (see the Phase
// 15 table in schema.sql) so the emoji can be swapped or restyled later
// without rewriting anyone's rows — the same reason badges are stored by id.
export type ReactionCode = 'fire' | 'flex' | 'clap' | 'grit' | 'party' | 'respect';

// Order is the order they appear in the picker.
export const REACTION_CODES: ReactionCode[] = ['fire', 'flex', 'clap', 'grit', 'party', 'respect'];

// Deliberately conservative glyphs: every one of these predates 2016, so
// they render on any phone that can run the app. Newer emoji (a saluting
// face, say) show as tofu on older Android and iOS.
export const REACTION_GLYPH: Record<ReactionCode, string> = {
  fire: '🔥',
  flex: '💪',
  clap: '👏',
  grit: '😤',
  party: '🎉',
  respect: '💯',
};

// Used for accessible labels — an emoji alone announces inconsistently
// across screen readers.
export const REACTION_LABEL: Record<ReactionCode, string> = {
  fire: 'Fire',
  flex: 'Strong',
  clap: 'Applause',
  grit: 'Grit',
  party: 'Celebrate',
  respect: 'Respect',
};

export function isReactionCode(value: string): value is ReactionCode {
  return (REACTION_CODES as string[]).includes(value);
}

export interface Reaction {
  sessionId: string;
  userId: string;
  code: ReactionCode;
  /** Reactor's display name, or 'You' for the signed-in user. */
  name: string;
  /** Server timestamp in ms — what "new since you last looked" is measured against. */
  createdAt: number;
}

type EmbeddedProfile = { display_name: string | null };

interface ReactionRow {
  session_id: string;
  user_id: string;
  code: string;
  created_at: string;
  // PostgREST types a foreign-key embed as an array even when the relation
  // is to-one, and returns either shape depending on how it resolves the
  // hint — so accept both and normalise in nameOf below.
  profiles: EmbeddedProfile | EmbeddedProfile[] | null;
}

function displayNameOf(profiles: ReactionRow['profiles']): string {
  const row = Array.isArray(profiles) ? profiles[0] : profiles;
  return row?.display_name?.trim() || 'FitFlow user';
}

// PostgREST puts `.in()` values in the query string, so a few hundred uuids
// would blow past URL length limits. Chunked well under that.
const ID_CHUNK = 80;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function fetchReactionsFor(sessionIds: string[]): Promise<Reaction[]> {
  if (sessionIds.length === 0) return [];
  const me = getCurrentUserId();
  const batches = await Promise.all(
    chunk(sessionIds, ID_CHUNK).map((ids) =>
      // Paged as well as chunked: a popular workout plus a wide window can
      // exceed the server's max-rows, and a short page here would silently
      // drop reactions rather than erroring.
      fetchAllPages<ReactionRow>((from, to) =>
        supabase
          .from('reactions')
          .select('session_id, user_id, code, created_at, profiles(display_name)')
          .in('session_id', ids)
          .order('created_at')
          .order('id')
          .range(from, to),
      ),
    ),
  );
  return batches
    .flat()
    .filter((row) => isReactionCode(row.code))
    .map((row) => ({
      sessionId: row.session_id,
      userId: row.user_id,
      code: row.code as ReactionCode,
      name: row.user_id === me ? 'You' : displayNameOf(row.profiles),
      createdAt: Date.parse(row.created_at) || 0,
    }));
}

export async function addReactionRemote(sessionId: string, code: ReactionCode): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase.from('reactions').insert({ session_id: sessionId, user_id: userId, code });
  // 23505 means the row is already there — the reaction landed twice (a
  // double-tap, or a retry after a lost response). The end state is exactly
  // what the caller wanted, so this isn't a failure.
  if (error && error.code !== '23505') throw error;
}

export async function removeReactionRemote(sessionId: string, code: ReactionCode): Promise<void> {
  const userId = getCurrentUserId();
  if (!userId) throw new Error('Not signed in');
  const { error } = await supabase
    .from('reactions')
    .delete()
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .eq('code', code);
  if (error) throw error;
}

/** Groups a flat reaction list by emoji, preserving REACTION_CODES order. */
export function groupByCode(reactions: Reaction[]): { code: ReactionCode; reactions: Reaction[] }[] {
  return REACTION_CODES.map((code) => ({ code, reactions: reactions.filter((r) => r.code === code) })).filter(
    (g) => g.reactions.length > 0,
  );
}
