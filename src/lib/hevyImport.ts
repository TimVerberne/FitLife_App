import { EXERCISES, exerciseById, isCardioExercise } from './exercises';
import type { Exercise, Routine, SetKind, WorkoutSession } from './types';

// Minimal RFC4180-style CSV parser — handles quoted fields (including
// embedded commas, newlines, and "" escaped quotes). Good enough for a
// straightforward tabular export like Hevy's without pulling in a library.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

interface HevyRow {
  title: string;
  start_time: string;
  end_time: string;
  exercise_title: string;
  set_type: string;
  weight_kg: string;
  reps: string;
  distance_km: string;
  duration_seconds: string;
}

const REQUIRED_COLUMNS = [
  'title',
  'start_time',
  'end_time',
  'exercise_title',
  'set_type',
  'weight_kg',
  'reps',
  'distance_km',
  'duration_seconds',
];

function parseHevyRows(text: string): HevyRow[] {
  const table = parseCsv(text);
  if (table.length < 2) return [];
  const header = table[0].map((h) => h.trim());
  if (!REQUIRED_COLUMNS.every((c) => header.includes(c))) return [];
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  return table.slice(1).map((r) => ({
    title: r[idx.title] ?? '',
    start_time: r[idx.start_time] ?? '',
    end_time: r[idx.end_time] ?? '',
    exercise_title: r[idx.exercise_title] ?? '',
    set_type: r[idx.set_type] ?? '',
    weight_kg: r[idx.weight_kg] ?? '',
    reps: r[idx.reps] ?? '',
    distance_km: r[idx.distance_km] ?? '',
    duration_seconds: r[idx.duration_seconds] ?? '',
  }));
}

export function looksLikeHevyCsv(text: string): boolean {
  const firstLine = text.slice(0, 500).split(/\r?\n/)[0] ?? '';
  return REQUIRED_COLUMNS.every((c) => firstLine.includes(c));
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Hevy exports dates like "8 Jul 2026, 16:42" — a format Date.parse doesn't
// reliably handle the same way across browser engines, so it's hand-parsed
// and built from local-time components (the export carries no timezone info
// to begin with, so there's nothing more precise to recover).
function parseHevyDate(s: string): number {
  const m = s.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4}),\s*(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const month = MONTHS[m[2].toLowerCase()];
  if (month === undefined) return NaN;
  return new Date(Number(m[3]), month, Number(m[1]), Number(m[4]), Number(m[5])).getTime();
}

const EQUIPMENT_ALIASES: Record<string, string[]> = {
  barbell: ['barbell', 'olympic barbell', 'ez barbell', 'trap bar'],
  dumbbell: ['dumbbell'],
  cable: ['cable'],
  machine: ['leverage machine', 'sled machine', 'smith machine'],
  band: ['band', 'resistance band'],
  'body weight': ['body weight'],
  bodyweight: ['body weight'],
  kettlebell: ['kettlebell'],
  'smith machine': ['smith machine'],
  'ez barbell': ['ez barbell'],
  'trap bar': ['trap bar'],
};

// Common Hevy exercise names that the token/equipment matcher below scores
// too low (short/generic base names like "Butterfly", or a base name whose
// distinguishing word — "rope", "iso-lateral" — gets diluted by more common
// tokens like "cable"/"pushdown" in the Jaccard overlap). These are standard
// Hevy naming conventions, not specific to any one export, so it's worth
// special-casing them rather than only tuning thresholds. Checked before the
// general fuzzy matcher; anything not listed here still falls through to it.
const NAME_ALIASES: Record<string, string> = {
  'butterfly (pec deck)': '0596', // lever seated fly
  'pec deck': '0596',
  'face pull': '0203', // cable rear delt row (with rope) — closest cable rear-delt movement available
  'seated dip machine': '1451', // lever seated dip
  'iso-lateral chest press (machine)': '3758', // lever standing chest press — kept distinct from plain "Chest Press (Machine)"
  'iso-lateral low row': '1313', // lever unilateral row
  'triceps pushdown': '0201', // cable pushdown
  'triceps rope pushdown': '0200', // cable pushdown (with rope attachment)
  'torso rotation': '2399', // cable seated twist
  // Plain cardio machine names (no equipment parenthetical, so the fuzzy
  // matcher has nothing to score against) — kept as 4 distinct ids even
  // though "Cycling"/"Spinning" and "Treadmill"/"Walking" are conceptually
  // similar, since two of these can legitimately appear as separate
  // exercises within the same workout and would otherwise merge into one
  // entry (see the Chest/Iso-Lateral Chest Press note above for why that's
  // a real problem, not just a labeling nicety).
  cycling: '2138', // stationary bike run v. 3
  spinning: '0798', // stationary bike walk
  treadmill: '3666', // walking on incline treadmill
  walking: '2141', // walk elliptical cross trainer
};

function normalizeTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  a.forEach((t) => {
    if (b.has(t)) inter++;
  });
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Cheap edit-distance ratio (not a full Ratcliff/Obershelp match like
// Python's difflib, but the same purpose: reward strings that are simply
// textually close, on top of the token-overlap score above).
function levenshteinRatio(a: string, b: string): number {
  const al = a.length;
  const bl = b.length;
  if (al === 0 && bl === 0) return 1;
  const dp = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) dp[j] = j;
  for (let i = 1; i <= al; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bl; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  const dist = dp[bl];
  return 1 - dist / Math.max(al, bl, 1);
}

function parseHevyExerciseName(name: string): { base: string; equipment: string } {
  const m = name.trim().match(/^(.*?)(?:\s*\(([^)]+)\))?$/);
  return { base: (m?.[1] ?? name).trim(), equipment: (m?.[2] ?? '').trim().toLowerCase() };
}

function scoreCandidate(base: string, equipment: string, ex: Exercise): number {
  const baseTokens = normalizeTokens(base);
  const nameTokens = normalizeTokens(ex.name);
  const overlap = jaccard(baseTokens, nameTokens);
  let equipBonus = 0;
  if (equipment) {
    const aliases = EQUIPMENT_ALIASES[equipment] ?? [equipment];
    if (aliases.includes(ex.equipment)) equipBonus = 0.3;
    else if (ex.equipment.includes(equipment) || equipment.includes(ex.equipment)) equipBonus = 0.15;
  }
  const seq = levenshteinRatio(base.toLowerCase(), ex.name) * 0.3;
  return overlap * 0.7 + equipBonus + seq;
}

// Below this, an automatic guess is more likely to be wrong than right —
// the exercise is reported as unmatched and its sets are skipped rather
// than silently filed under something that isn't really it.
const MATCH_THRESHOLD = 0.45;

const matchCache = new Map<string, string | null>();

export function matchHevyExerciseName(hevyName: string): string | null {
  const cached = matchCache.get(hevyName);
  if (cached !== undefined) return cached;

  const aliased = NAME_ALIASES[hevyName.trim().toLowerCase()];
  if (aliased) {
    matchCache.set(hevyName, aliased);
    return aliased;
  }

  const { base, equipment } = parseHevyExerciseName(hevyName);
  let best: Exercise | null = null;
  let bestScore = -Infinity;
  for (const ex of EXERCISES) {
    const score = scoreCandidate(base, equipment, ex);
    if (score > bestScore) {
      bestScore = score;
      best = ex;
    }
  }
  const result = best && bestScore >= MATCH_THRESHOLD ? best.id : null;
  matchCache.set(hevyName, result);
  return result;
}

export interface HevyImportResult {
  routines: Routine[];
  sessions: WorkoutSession[];
  matchedNames: string[];
  unmatchedNames: string[];
  droppedSessionCount: number;
  totalSets: number;
}

// One routine per unique workout title, using that title's most recent
// session as the "current" version — Hevy has no separate routine/template
// concept in this export, just repeated workout titles.
export function convertHevyCsv(text: string): HevyImportResult | null {
  const rows = parseHevyRows(text);
  if (rows.length === 0) return null;

  const sessionOrder: string[] = [];
  const sessionRows = new Map<string, HevyRow[]>();
  for (const r of rows) {
    const key = `${r.title} ${r.start_time} ${r.end_time}`;
    if (!sessionRows.has(key)) {
      sessionRows.set(key, []);
      sessionOrder.push(key);
    }
    sessionRows.get(key)!.push(r);
  }

  const matchedNames = new Set<string>();
  const unmatchedNames = new Set<string>();
  const sessionsOut: (WorkoutSession & { _title: string; _startedAtMs: number })[] = [];
  const routineExercisesByTitle = new Map<string, { startedAt: number; exerciseIds: string[] }[]>();
  let droppedSessionCount = 0;
  let totalSets = 0;

  for (const key of sessionOrder) {
    const rs = sessionRows.get(key)!;
    // Read title/start/end straight off the row rather than re-splitting the
    // grouping key. The key packs these with a NUL ('\0') separator, which
    // renders as a space in most tooling and has repeatedly been misread as
    // key.split(' ') — an easy way to "accidentally fix" this into dropping
    // every workout (Hevy dates/titles contain spaces). rs[0] carries the
    // same values with no fragile parsing.
    const title = rs[0].title;
    const startedAt = parseHevyDate(rs[0].start_time);
    const endedAt = parseHevyDate(rs[0].end_time);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt)) {
      droppedSessionCount++;
      continue;
    }

    const setsByExerciseId = new Map<string, { reps: number; weight: number; durationSec: number; distanceKm: number; done: true; kind: SetKind }[]>();
    for (const r of rs) {
      const name = r.exercise_title.trim();
      if (!name) continue;

      const exerciseId = matchHevyExerciseName(name);
      if (!exerciseId) {
        unmatchedNames.add(name);
        continue;
      }
      // Branches on the *matched* exercise's own category, not the Hevy row
      // shape, so a genuinely non-cardio exercise logged with blank
      // reps/weight (nothing useful to import — e.g. Hevy's "Plank", which
      // only has duration_seconds and no distance) is still correctly
      // skipped rather than landing in FitFlow with a meaningless 0×0 set.
      const cardio = isCardioExercise(exerciseById(exerciseId)!);
      const repsStr = r.reps.trim();
      const weightStr = r.weight_kg.trim();
      const distanceStr = r.distance_km.trim();
      const durationStr = r.duration_seconds.trim();
      if (cardio ? !distanceStr && !durationStr : !repsStr && !weightStr) continue;

      matchedNames.add(name);

      const rawKind = r.set_type.trim();
      const kind: SetKind = (['normal', 'warmup', 'failure', 'dropset'] as string[]).includes(rawKind)
        ? (rawKind as SetKind)
        : 'normal';
      // Guard every numeric cell: a malformed value ("abc") would otherwise
      // become NaN and poison all downstream volume/records math. Blanks are
      // already handled by the truthiness checks; this catches garbage.
      const num = (s: string) => {
        const n = Number(s);
        return Number.isFinite(n) ? n : 0;
      };
      const sets = setsByExerciseId.get(exerciseId) ?? [];
      sets.push({
        reps: !cardio && repsStr ? Math.round(num(repsStr)) : 0,
        weight: !cardio && weightStr ? num(weightStr) : 0,
        durationSec: cardio && durationStr ? Math.round(num(durationStr)) : 0,
        distanceKm: cardio && distanceStr ? num(distanceStr) : 0,
        done: true,
        kind,
      });
      setsByExerciseId.set(exerciseId, sets);
      totalSets++;
    }

    if (setsByExerciseId.size === 0) {
      droppedSessionCount++;
      continue;
    }

    const exerciseIds = Array.from(setsByExerciseId.keys());
    const list = routineExercisesByTitle.get(title) ?? [];
    list.push({ startedAt, exerciseIds });
    routineExercisesByTitle.set(title, list);

    sessionsOut.push({
      id: `hevy-s-${sessionsOut.length}`,
      person: 'You',
      name: title,
      routineId: null,
      startedAt,
      durationMin: Math.max(1, Math.round((endedAt - startedAt) / 60000)),
      entries: exerciseIds.map((exerciseId) => ({ exerciseId, sets: setsByExerciseId.get(exerciseId)! })),
      _title: title,
      _startedAtMs: startedAt,
    });
  }

  const routineIdByTitle = new Map<string, string>();
  const routines: Routine[] = Array.from(routineExercisesByTitle.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([title, instances], i) => {
      instances.sort((a, b) => a.startedAt - b.startedAt);
      const routineId = `hevy-r-${i}`;
      routineIdByTitle.set(title, routineId);
      return {
        id: routineId,
        name: title,
        exerciseIds: instances[instances.length - 1].exerciseIds,
        createdAt: instances[0].startedAt,
      };
    });

  const sessions: WorkoutSession[] = sessionsOut
    .sort((a, b) => a._startedAtMs - b._startedAtMs)
    .map(({ _title, _startedAtMs, ...s }) => ({ ...s, routineId: routineIdByTitle.get(_title) ?? null }));

  return {
    routines,
    sessions,
    matchedNames: Array.from(matchedNames).sort(),
    unmatchedNames: Array.from(unmatchedNames).sort(),
    droppedSessionCount,
    totalSets,
  };
}
