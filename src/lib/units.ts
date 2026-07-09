import type { Units } from './settings';

const KG_TO_LB = 2.20462;

// All weight is stored canonically in kg; convert only at the display/input boundary.
// Rounded to 1 decimal so lb conversions (which rarely land on a clean number) don't
// show long float tails like 148.81185.
export function toDisplayWeight(kg: number, units: Units): number {
  if (units !== 'lb') return kg;
  return Math.round(kg * KG_TO_LB * 10) / 10;
}

export function fromDisplayWeight(value: number, units: Units): number {
  return units === 'lb' ? value / KG_TO_LB : value;
}

export function formatWeight(kg: number, units: Units): string {
  const v = toDisplayWeight(kg, units);
  return v.toLocaleString('en-US', { maximumFractionDigits: 1 });
}
