// gradient-calculator.ts
export type Gradient = 'CHONG' | 'WEN' | 'BAO';

export interface GradientThreshold {
  chong: number; // ratio < chong → CHONG
  bao: number;   // ratio > bao → BAO
}

const DEFAULT_THRESHOLD: GradientThreshold = { chong: 0.9, bao: 1.1 };

export function calcGradient(
  studentRank: number,
  historyMinRank: number | null | undefined,
  threshold: GradientThreshold = DEFAULT_THRESHOLD,
): Gradient {
  if (!historyMinRank || historyMinRank <= 0) return 'BAO';
  const ratio = studentRank / historyMinRank;
  if (ratio < threshold.chong) return 'CHONG';
  if (ratio > threshold.bao) return 'BAO';
  return 'WEN';
}
