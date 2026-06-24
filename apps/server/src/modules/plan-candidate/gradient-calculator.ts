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

// 输入收窄到只剩"学生位次"和"历史最低位次"。
// 旧版的 plan/competition/selection/supplementary 四因子调整已下线 (评估后无证据支撑、却把整组档位推偏),
// 字段从接口里直接删除, 让调用方编译期暴露遗留。
export interface DynamicGradientInput {
  studentRank: number;
  historyMinRank: number | null | undefined;
}

// 返回结构保留所有字段, 向后兼容前端和持久化的 selection_reason 文案:
//   adjustedMinRank === baseMinRank (不再修正)
//   factors 全 1
//   reasons 恒为空
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

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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
      reasons: [],
    };
  }

  // 直接用 baseMinRank 喂分桶, 不再做计划/竞争/选科/征集四因子修正。
  const tier = classifyDynamicTier(input.studentRank, baseMinRank);
  return {
    gradient: tierToGradient(tier),
    tier,
    baseMinRank,
    adjustedMinRank: baseMinRank,
    rankGapRatio: baseMinRank / input.studentRank - 1,
    factors: emptyFactors,
    reasons: [],
  };
}
