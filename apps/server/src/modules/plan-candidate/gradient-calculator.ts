// gradient-calculator.ts
export type Gradient = 'CHONG' | 'WEN' | 'BAO';
export type DynamicGradientTier =
  | 'JI_CHONG'
  | 'CHONG'
  | 'XIAO_CHONG'
  | 'WEN'
  | 'WEN_BAO'
  | 'BAO'
  | 'QIANG_BAO'
  | 'DIBAO';

export interface GradientThreshold {
  chong: number; // ratio < chong → CHONG
  bao: number;   // ratio > bao → BAO
}

const DEFAULT_THRESHOLD: GradientThreshold = { chong: 0.9, bao: 1.1 };

export interface DynamicGradientInput {
  studentRank: number;
  historyMinRank: number | null | undefined;
  currentPlanCount?: number | null;
  previousPlanCount?: number | null;
  currentCompetitionCount?: number | null;
  previousCompetitionCount?: number | null;
  selectionCompetitionCount?: number | null;
  subjectCompetitionCount?: number | null;
  selectionDataConfidence?: 'OFFICIAL' | 'PUBLIC_ESTIMATE' | 'LOW' | 'MISSING';
  majorGroupChanged?: boolean;
  supplementary?: {
    totalPlanCount?: number | null;
    totalRounds?: number | null;
    supplementaryRate?: number | string | null;
  } | null;
}

export interface DynamicGradientResult {
  gradient: Gradient;
  tier: DynamicGradientTier;
  baseMinRank: number | null;
  adjustedMinRank: number | null;
  rankGapRatio: number | null;
  factors: {
    plan: number;
    competition: number;
    selection: number;
    supplementary: number;
    combined: number;
  };
  reasons: string[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function toRate(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === '') return 0;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return numeric > 1 ? numeric / 100 : numeric;
}

function downgradeTier(tier: DynamicGradientTier): DynamicGradientTier {
  const order: DynamicGradientTier[] = [
    'JI_CHONG',
    'CHONG',
    'XIAO_CHONG',
    'WEN',
    'WEN_BAO',
    'BAO',
    'QIANG_BAO',
    'DIBAO',
  ];
  const index = order.indexOf(tier);
  return order[Math.max(0, index - 1)] ?? 'JI_CHONG';
}

function tierToGradient(tier: DynamicGradientTier): Gradient {
  if (tier === 'JI_CHONG' || tier === 'CHONG' || tier === 'XIAO_CHONG') return 'CHONG';
  if (tier === 'WEN' || tier === 'WEN_BAO') return 'WEN';
  return 'BAO';
}

function classifyDynamicTier(studentRank: number, adjustedMinRank: number): DynamicGradientTier {
  const edge = adjustedMinRank / studentRank - 1;
  if (edge < -0.20) return 'JI_CHONG';
  if (edge < -0.12) return 'CHONG';
  if (edge < -0.02) return 'XIAO_CHONG';
  if (edge <= 0.06) return 'WEN';
  if (edge <= 0.12) return 'WEN_BAO';
  if (edge <= 0.22) return 'BAO';
  if (edge <= 0.35) return 'QIANG_BAO';
  return 'DIBAO';
}

export function calcGradient(
  studentRank: number,
  historyMinRank: number | null | undefined,
  threshold: GradientThreshold = DEFAULT_THRESHOLD,
): Gradient {
  if (!historyMinRank || historyMinRank <= 0) return 'BAO';
  const ratio = historyMinRank / studentRank;
  if (ratio < threshold.chong) return 'CHONG';
  if (ratio > threshold.bao) return 'BAO';
  return 'WEN';
}

export function calcDynamicGradient(input: DynamicGradientInput): DynamicGradientResult {
  const reasons: string[] = [];
  const baseMinRank = positive(input.historyMinRank) ? input.historyMinRank : null;
  const emptyFactors = {
    plan: 1,
    competition: 1,
    selection: 1,
    supplementary: 1,
    combined: 1,
  };

  if (!baseMinRank || !positive(input.studentRank)) {
    return {
      gradient: 'BAO',
      tier: 'BAO',
      baseMinRank,
      adjustedMinRank: baseMinRank,
      rankGapRatio: null,
      factors: emptyFactors,
      reasons: ['missing historical rank, using conservative fallback'],
    };
  }

  let planFactor = 1;
  let competitionFactor = 1;
  let selectionFactor = 1;
  let supplementaryFactor = 1;
  let riskDowngrades = 0;

  if (positive(input.currentPlanCount) && positive(input.previousPlanCount)) {
    const ratio = input.currentPlanCount / input.previousPlanCount;
    if (ratio >= 1) {
      planFactor = 1 + clamp((ratio - 1) * 0.5, 0, 0.25);
      if (ratio >= 1.05) reasons.push(`plan increased ${(ratio * 100 - 100).toFixed(1)}%`);
    } else {
      planFactor = 1 - clamp((1 - ratio) * 0.3, 0, 0.22);
      reasons.push(`plan decreased ${(100 - ratio * 100).toFixed(1)}%`);
      if (ratio < 0.7) {
        riskDowngrades += 1;
        reasons.push('plan decreased sharply, risk level downgraded');
      }
    }
  }

  if (positive(input.currentCompetitionCount) && positive(input.previousCompetitionCount)) {
    const ratio = input.currentCompetitionCount / input.previousCompetitionCount;
    competitionFactor = 1 - clamp((ratio - 1) * 0.6, -0.18, 0.18);
    if (ratio >= 1.03) {
      reasons.push(`competition pool increased ${(ratio * 100 - 100).toFixed(1)}%`);
    } else if (ratio <= 0.97) {
      reasons.push(`competition pool decreased ${(100 - ratio * 100).toFixed(1)}%`);
    }
  }

  if (positive(input.selectionCompetitionCount) && positive(input.subjectCompetitionCount)) {
    const ratio = clamp(input.selectionCompetitionCount / input.subjectCompetitionCount, 0, 1);
    selectionFactor = 1 + clamp((0.85 - ratio) * 0.2, 0, 0.18);
    if (selectionFactor > 1) {
      reasons.push(`selection pool is ${(ratio * 100).toFixed(1)}% of the subject pool`);
    }
    if (input.selectionDataConfidence === 'LOW') {
      riskDowngrades += 1;
      reasons.push('selection data confidence is low, risk level downgraded');
    }
  }

  const supplementaryRate = toRate(input.supplementary?.supplementaryRate);
  const supplementaryRounds = input.supplementary?.totalRounds ?? 0;
  const supplementaryPlans = input.supplementary?.totalPlanCount ?? 0;
  if (supplementaryRate > 0 || supplementaryRounds > 0 || supplementaryPlans > 0) {
    supplementaryFactor = 1 + clamp(
      supplementaryRate * 0.55 + Math.min(supplementaryRounds, 4) * 0.025,
      0.03,
      0.22,
    );
    reasons.push(`supplementary vacancies ${supplementaryPlans || '-'} seats across ${supplementaryRounds || '-'} rounds`);
  }

  if (input.majorGroupChanged) {
    riskDowngrades += 1;
    reasons.push('major group changed, risk level downgraded');
  }

  const combined = clamp(
    planFactor * competitionFactor * selectionFactor * supplementaryFactor,
    0.65,
    1.45,
  );
  const adjustedMinRank = Math.max(1, Math.round(baseMinRank * combined));
  let tier = classifyDynamicTier(input.studentRank, adjustedMinRank);
  for (let i = 0; i < riskDowngrades; i += 1) {
    tier = downgradeTier(tier);
  }

  return {
    gradient: tierToGradient(tier),
    tier,
    baseMinRank,
    adjustedMinRank,
    rankGapRatio: adjustedMinRank / input.studentRank - 1,
    factors: {
      plan: Number(planFactor.toFixed(4)),
      competition: Number(competitionFactor.toFixed(4)),
      selection: Number(selectionFactor.toFixed(4)),
      supplementary: Number(supplementaryFactor.toFixed(4)),
      combined: Number(combined.toFixed(4)),
    },
    reasons,
  };
}
