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

export function searchExercises(query: string, bodyPart: string): Exercise[] {
  const q = query.trim().toLowerCase();
  return EXERCISES.filter((e) => {
    const matchesBp =
      bodyPart === 'all'
        ? true
        : bodyPart === 'biceps' || bodyPart === 'triceps'
          ? e.body_part === 'upper arms' && e.target === bodyPart
          : e.body_part === bodyPart;
    const matchesQ = !q || e.name.toLowerCase().includes(q);
    return matchesBp && matchesQ;
  });
}
