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

// 8 段动态梯度的 7 个分界(edge = 组门槛位次 / 学生位次 - 1; 负=组比学生好=偏冲)。
// 必须单调递增。老师可在偏好里自定义覆盖, 不设则用此默认。
export interface TierThresholds {
  jiChong: number;   // edge <  jiChong  → 极冲
  chong: number;     // edge <  chong    → 冲
  xiaoChong: number; // edge <  xiaoChong→ 小冲
  wen: number;       // edge <= wen      → 稳
  wenBao: number;    // edge <= wenBao   → 稳保
  bao: number;       // edge <= bao      → 保
  qiangBao: number;  // edge <= qiangBao → 强保; 否则 → 兜底
}

export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  jiChong: -0.20,
  chong: -0.12,
  xiaoChong: -0.02,
  wen: 0.06,
  wenBao: 0.12,
  bao: 0.22,
  qiangBao: 0.35,
};

export const TIER_THRESHOLD_KEYS: Array<keyof TierThresholds> = [
  'jiChong', 'chong', 'xiaoChong', 'wen', 'wenBao', 'bao', 'qiangBao',
];

/** 校验老师自定义阈值: 7 项齐全、有限数、严格单调递增。返回归一后的对象, 非法则 null. */
export function sanitizeTierThresholds(raw: unknown): TierThresholds | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const out = {} as TierThresholds;
  let prev = -Infinity;
  for (const k of TIER_THRESHOLD_KEYS) {
    const v = obj[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    if (v <= prev) return null; // 严格单调递增
    out[k] = v;
    prev = v;
  }
  return out;
}

// 输入收窄到只剩"学生位次"和"历史最低位次"。
// 旧版的 plan/competition/selection/supplementary 四因子调整已下线 (评估后无证据支撑、却把整组档位推偏),
// 字段从接口里直接删除, 让调用方编译期暴露遗留。
export interface DynamicGradientInput {
  studentRank: number;
  historyMinRank: number | null | undefined;
  thresholds?: TierThresholds; // 老师自定义分界; 不传用 DEFAULT_TIER_THRESHOLDS
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

function classifyDynamicTier(
  studentRank: number,
  adjustedMinRank: number,
  t: TierThresholds = DEFAULT_TIER_THRESHOLDS,
): DynamicGradientTier {
  const edge = adjustedMinRank / studentRank - 1;
  if (edge < t.jiChong) return 'JI_CHONG';
  if (edge < t.chong) return 'CHONG';
  if (edge < t.xiaoChong) return 'XIAO_CHONG';
  if (edge <= t.wen) return 'WEN';
  if (edge <= t.wenBao) return 'WEN_BAO';
  if (edge <= t.bao) return 'BAO';
  if (edge <= t.qiangBao) return 'QIANG_BAO';
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
  const tier = classifyDynamicTier(input.studentRank, baseMinRank, input.thresholds ?? DEFAULT_TIER_THRESHOLDS);
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
