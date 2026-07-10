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

export function bodyParts(): string[] {
  return Array.from(new Set(EXERCISES.map((e) => e.body_part))).sort();
}

export function searchExercises(query: string, bodyPart: string): Exercise[] {
  const q = query.trim().toLowerCase();
  return EXERCISES.filter((e) => {
    const matchesBp = bodyPart === 'all' || e.body_part === bodyPart;
    const matchesQ = !q || e.name.toLowerCase().includes(q);
    return matchesBp && matchesQ;
  });
}
