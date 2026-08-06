import raw from '../data/exercises.json';
import type { CustomExercise, Exercise } from './types';

export const EXERCISES = raw as Exercise[];

const byIdMap = new Map(EXERCISES.map((e) => [e.id, e]));

// --- Custom exercises -------------------------------------------------
// User-authored exercises live in one shared global table (see
// customExercises.ts) and arrive from Supabase asynchronously, long after
// this module is first imported. `exerciseById` is called from ~17 render
// paths that all expect a synchronous answer, so rather than make every one
// of them async, the store hands the fetched list to `setCustomExercises`
// whenever it changes and the lookups below read from it.

export const CUSTOM_ID_PREFIX = 'custom-';

let customList: CustomExercise[] = [];
let customByIdMap = new Map<string, CustomExercise>();
// Only the non-archived ones, precomputed — searchExercises runs this on
// every keystroke and would otherwise re-filter the whole list each time.
let customSearchable: CustomExercise[] = [];

export function setCustomExercises(list: CustomExercise[]): void {
  customList = list;
  customByIdMap = new Map(list.map((e) => [e.id, e]));
  customSearchable = list.filter((e) => !e.archived);
}

export function getCustomExercises(): CustomExercise[] {
  return customList;
}

export function newCustomExerciseId(): string {
  return `${CUSTOM_ID_PREFIX}${crypto.randomUUID()}`;
}

export function isCustomExercise(ex: Exercise): ex is CustomExercise {
  return ex.id.startsWith(CUSTOM_ID_PREFIX);
}

// Bundled ids are resolved first. The server enforces the `custom-` prefix
// on every shared row, so the two id spaces can't actually collide — but
// checking in this order means even a malformed row can never shadow a real
// exercise for everyone who syncs it.
export function exerciseById(id: string): Exercise | undefined {
  return byIdMap.get(id) ?? customByIdMap.get(id);
}

// Archived customs are deliberately absent: they stay resolvable by id (so
// history keeps rendering) but must not come back in the picker.
function searchablePool(): Exercise[] {
  return customSearchable.length > 0 ? [...EXERCISES, ...customSearchable] : EXERCISES;
}

export function exerciseCount(): number {
  return EXERCISES.length + customSearchable.length;
}

// Case-insensitive, whitespace-collapsed name match across the whole
// library. Used by the create form to stop the shared library filling up
// with near-identical entries; the server has a matching unique index as
// the real guard, since two people can submit at once.
export function findExerciseByName(name: string): Exercise | undefined {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!key) return undefined;
  const norm = (n: string) => n.trim().toLowerCase().replace(/\s+/g, ' ');
  return searchablePool().find((e) => norm(e.name) === key);
}

// --- Form option lists ------------------------------------------------
// Derived from the bundled dataset only. Constraining new exercises to the
// vocabulary that already exists is what keeps the body-part filter chips
// and the target/equipment labels coherent — a free-text body part would
// create a chip nobody else's exercises can ever match.

export function equipmentOptions(): string[] {
  return Array.from(new Set(EXERCISES.map((e) => e.equipment))).sort();
}

// Targets that actually occur for this body part, so the two selects can't
// be combined into something the dataset never pairs (e.g. chest + calves).
// Falls back to every known target if the body part is unrecognised.
export function targetOptions(bodyPart: string): string[] {
  const matching = EXERCISES.filter((e) =>
    bodyPart === 'biceps' || bodyPart === 'triceps'
      ? e.body_part === 'upper arms' && e.target === bodyPart
      : e.body_part === bodyPart,
  );
  const pool = matching.length > 0 ? matching : EXERCISES;
  return Array.from(new Set(pool.map((e) => e.target))).sort();
}

export function isCardioExercise(ex: Exercise): boolean {
  return ex.body_part === 'cardio';
}

// "upper arms" lumps biceps and triceps into one filter chip, which makes
// them hard to find — split it into its two `target` values instead. Every
// other body_part stays a single chip.
// Derived from the bundled dataset alone, deliberately: the create form only
// offers these same body parts (see targetOptions), so a custom exercise can
// never need a chip that isn't already here.
export function bodyParts(): string[] {
  const parts = new Set(EXERCISES.map((e) => e.body_part));
  parts.delete('upper arms');
  parts.add('biceps');
  parts.add('triceps');
  return Array.from(parts).sort();
}

// Lower is more relevant. Matching only via target/equipment/body_part
// (not the exercise's own name) ranks last — those exist so "shoulder"
// finds every shoulder-target exercise even when the word isn't in the
// name, without letting a metadata-only match outrank a real name match.
// Rank 3 (every word of the query somewhere in the name, any order) is
// what lets "fly dumbbell" find "Dumbbell Fly" — people rarely type
// exercise names in their exact word order — while still sorting behind
// an actual substring match like "dumbbell fly".
function nameMatchRank(name: string, q: string, tokens: string[]): number {
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (tokens.length > 1 && tokens.every((t) => name.includes(t))) return 3;
  return 4;
}

// --- Typo tolerance ---------------------------------------------------
// Only used when an exact search finds nothing at all (see below), so the
// cost never lands on the common path.

// How many typos to forgive in one word. Short words are left alone: at
// three characters or fewer, one edit is enough to turn a real word into
// an unrelated one ("hip" → "dip"), so fuzzing them produces noise rather
// than help.
function fuzzTolerance(token: string): number {
  if (token.length <= 3) return 0;
  if (token.length <= 5) return 1;
  return 2;
}

// Minimum edit distance between `needle` and any *prefix* of `hay`, so a
// half-typed word still scores well — "dumbe" is 3 edits away from the
// whole word "dumbbell" but only 1 from its prefix "dumbb". Anchoring at
// the start of a word (rather than matching anywhere inside it) is what
// keeps the fuzzy pass from dragging in unrelated exercises.
// Returns `max + 1` as soon as the answer is known to exceed `max`.
function prefixDistance(needle: string, hay: string, max: number): number {
  const n = needle.length;
  const m = hay.length;
  if (n === 0) return 0;
  // A prefix of `hay` can be at most `m` long, so anything shorter than
  // needle.length - max characters can never come within budget.
  if (m + max < n) return max + 1;

  let prev = new Array<number>(m + 1);
  let cur = new Array<number>(m + 1);
  for (let j = 0; j <= m; j++) prev[j] = j;

  for (let i = 1; i <= n; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    const nc = needle.charCodeAt(i - 1);
    for (let j = 1; j <= m; j++) {
      const cost = nc === hay.charCodeAt(j - 1) ? 0 : 1;
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    // Row minima never decrease as `i` grows, so once the whole row is
    // over budget no later row can come back under it.
    if (rowMin > max) return max + 1;
    const swap = prev;
    prev = cur;
    cur = swap;
  }

  let best = prev[0];
  for (let j = 1; j <= m; j++) if (prev[j] < best) best = prev[j];
  return best;
}

// Best (lowest) prefix distance from `token` to any word in `words`.
// Returns `tol + 1` when nothing is within budget.
function bestDistance(token: string, words: string[], tol: number): number {
  let best = tol + 1;
  for (const w of words) {
    const d = prefixDistance(token, w, tol);
    if (d < best) {
      best = d;
      if (best === 0) break;
    }
  }
  return best;
}

function wordsOf(text: string): string[] {
  return text.toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

type Scored = { ex: Exercise; total: number; nameTotal: number };

// Second-chance pass: every query word has to land within its typo budget
// of some word in the exercise, still in any order. Ranked by how far off
// the spelling was, with name matches preferred over metadata ones at the
// same distance.
function fuzzySearch(pool: Exercise[], tokens: string[]): Exercise[] {
  const tols = tokens.map(fuzzTolerance);
  // With no budget anywhere there is nothing fuzzy left to try, and the
  // exact pass has already run.
  if (tols.every((t) => t === 0)) return [];

  const scored: Scored[] = [];
  for (const ex of pool) {
    const nameWords = wordsOf(ex.name);
    const metaWords = wordsOf(`${ex.target} ${ex.equipment} ${ex.body_part}`);
    const name = ex.name.toLowerCase();
    const haystack = `${ex.name} ${ex.target} ${ex.equipment} ${ex.body_part}`.toLowerCase();

    let total = 0;
    let nameTotal = 0;
    let ok = true;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const tol = tols[i];
      // Words the user spelled correctly cost nothing, even when they sit
      // mid-word ("bell" inside "dumbbell") where a prefix-anchored
      // distance would score them as a miss.
      if (haystack.includes(token)) {
        total += 0;
        nameTotal += name.includes(token) ? 0 : 1;
        continue;
      }
      if (tol === 0) {
        ok = false;
        break;
      }
      const dName = bestDistance(token, nameWords, tol);
      const dMeta = bestDistance(token, metaWords, tol);
      const d = Math.min(dName, dMeta);
      if (d > tol) {
        ok = false;
        break;
      }
      total += d;
      nameTotal += Math.min(dName, tol + 1);
    }
    if (ok) scored.push({ ex, total, nameTotal });
  }

  scored.sort(
    (a, b) =>
      a.total - b.total || a.nameTotal - b.nameTotal || a.ex.name.localeCompare(b.ex.name),
  );
  return scored.map((s) => s.ex);
}

export type ExerciseSearchResult = {
  list: Exercise[];
  /**
   * How many of `list`'s leading entries matched the query as typed. Any
   * entries past this point are spell-corrected suggestions.
   */
  exactCount: number;
};

// A typo doesn't always come up empty — "squatt" is a real substring of
// "squatting", so it returns three rowing variations and hides the ~100
// squats the user meant. Backfilling whenever the exact pass comes back
// this thin catches that without paying for the fuzzy pass on the ordinary
// searches that already return plenty.
const BACKFILL_BELOW = 5;

export function searchExercises(query: string, bodyPart: string): ExerciseSearchResult {
  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);

  const pool = searchablePool().filter((e) =>
    bodyPart === 'all'
      ? true
      : bodyPart === 'biceps' || bodyPart === 'triceps'
        ? e.body_part === 'upper arms' && e.target === bodyPart
        : e.body_part === bodyPart,
  );
  if (!q) return { list: pool, exactCount: pool.length };

  // Every word of the query has to appear *somewhere* across the
  // exercise's searchable text, but words don't each need to land in the
  // same field or in the query's own order — "fly dumbbell", "dumbbell
  // fly" and "chest dumbbell" (word in name, word in target) all resolve
  // to the same set of exercises.
  const exact = pool.filter((e) => {
    const haystack = `${e.name} ${e.target} ${e.equipment} ${e.body_part}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });

  exact.sort((a, b) => {
    const r = nameMatchRank(a.name.toLowerCase(), q, tokens) - nameMatchRank(b.name.toLowerCase(), q, tokens);
    return r !== 0 ? r : a.name.localeCompare(b.name);
  });
  if (exact.length >= BACKFILL_BELOW) return { list: exact, exactCount: exact.length };

  // Little or nothing matched as typed — it's a misspelling ("dumbell"), or
  // a word still being typed. Retry forgiving a couple of characters per
  // word, and append whatever that turns up below the literal matches so
  // the exact hits keep the top of the list.
  const seen = new Set(exact.map((e) => e.id));
  const suggested = fuzzySearch(pool, tokens).filter((e) => !seen.has(e.id));
  return { list: [...exact, ...suggested], exactCount: exact.length };
}
