export function bmi(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return weightKg / (heightM * heightM);
}

// Deliberately neutral wording — never the clinical/loaded
// underweight/normal/overweight/obese terms, even though the thresholds
// themselves are the standard WHO cutoffs.
export function bmiLabel(value: number): string {
  if (value < 18.5) return 'Low';
  if (value < 25) return 'Typical range';
  if (value < 30) return 'Above typical';
  return 'Too high';
}

// A guideline of keeping this below 0.5 tracks health risk better than BMI
// for muscular people, since BMI can't distinguish muscle from fat.
export function waistToHeightRatio(waistCm: number, heightCm: number): number {
  return waistCm / heightCm;
}

export function relativeStrength(oneRepMaxKg: number, bodyweightKg: number): number {
  return oneRepMaxKg / bodyweightKg;
}
