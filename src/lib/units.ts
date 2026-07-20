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

const CM_TO_IN = 0.393701;
const ML_TO_FLOZ = 0.033814;

// All length is stored canonically in cm; convert only at the display/input
// boundary, same as weight. The raw imperial value is total inches — height
// doesn't read naturally as a single imperial number, so formatHeight below
// splits it into feet + inches for display.
export function toDisplayLength(cm: number, units: Units): number {
  if (units !== 'lb') return cm;
  return Math.round(cm * CM_TO_IN * 10) / 10;
}

export function fromDisplayLength(value: number, units: Units): number {
  return units === 'lb' ? value / CM_TO_IN : value;
}

export function formatHeight(cm: number, units: Units): string {
  if (units !== 'lb') return `${Math.round(cm)} cm`;
  const totalIn = Math.round(toDisplayLength(cm, units));
  const feet = Math.floor(totalIn / 12);
  const inches = totalIn % 12;
  return `${feet}'${inches}"`;
}

// Convenience for a feet+inches input pair (the natural way to enter height
// under the imperial setting) straight to canonical cm.
export function fromDisplayHeightFtIn(feet: number, inches: number): number {
  return fromDisplayLength(feet * 12 + inches, 'lb');
}

// For circumference measurements (waist, chest, etc.) — unlike height, these
// read naturally as a single imperial number (inches), no feet/inches split needed.
export function formatLength(cm: number, units: Units): string {
  const v = toDisplayLength(cm, units);
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units === 'lb' ? 'in' : 'cm'}`;
}

// All volume is stored canonically in ml; convert only at the display/input boundary.
export function toDisplayVolume(ml: number, units: Units): number {
  if (units !== 'lb') return ml;
  return Math.round(ml * ML_TO_FLOZ * 10) / 10;
}

export function fromDisplayVolume(value: number, units: Units): number {
  return units === 'lb' ? value / ML_TO_FLOZ : value;
}

export function formatVolume(ml: number, units: Units): string {
  if (units !== 'lb' && ml >= 1000) {
    return `${(ml / 1000).toLocaleString('en-US', { maximumFractionDigits: 1 })} L`;
  }
  const v = toDisplayVolume(ml, units);
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 1 })} ${units === 'lb' ? 'fl oz' : 'ml'}`;
}
