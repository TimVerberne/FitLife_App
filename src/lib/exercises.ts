import raw from '../data/exercises.json';
import type { Exercise } from './types';

export const EXERCISES = raw as Exercise[];

const byIdMap = new Map(EXERCISES.map((e) => [e.id, e]));

export function exerciseById(id: string): Exercise | undefined {
  return byIdMap.get(id);
}

export function isCardioExercise(ex: Exercise): boolean {
  return ex.body_part === 'cardio';
}

// "upper arms" lumps biceps and triceps into one filter chip, which makes
// them hard to find — split it into its two `target` values instead. Every
// other body_part stays a single chip.
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

export function searchExercises(query: string, bodyPart: string): Exercise[] {
  const q = query.trim().toLowerCase();
  const tokens = q.split(/\s+/).filter(Boolean);
  const filtered = EXERCISES.filter((e) => {
    const matchesBp =
      bodyPart === 'all'
        ? true
        : bodyPart === 'biceps' || bodyPart === 'triceps'
          ? e.body_part === 'upper arms' && e.target === bodyPart
          : e.body_part === bodyPart;
    if (!matchesBp) return false;
    if (!q) return true;
    // Every word of the query has to appear *somewhere* across the
    // exercise's searchable text, but words don't each need to land in
    // the same field or in the query's own order — "fly dumbbell",
    // "dumbbell fly" and "chest dumbbell" (word in name, word in target)
    // all resolve to the same set of exercises.
    const haystack = `${e.name} ${e.target} ${e.equipment} ${e.body_part}`.toLowerCase();
    return tokens.every((t) => haystack.includes(t));
  });
  if (!q) return filtered;
  return [...filtered].sort((a, b) => {
    const r = nameMatchRank(a.name.toLowerCase(), q, tokens) - nameMatchRank(b.name.toLowerCase(), q, tokens);
    return r !== 0 ? r : a.name.localeCompare(b.name);
  });
}
