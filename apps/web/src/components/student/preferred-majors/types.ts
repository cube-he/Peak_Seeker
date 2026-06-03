// 学生意向专业的梯队结构 (新 shape)
// 与 backend `apps/server/src/utils/preferred-majors.ts` 的 PreferredMajorTier 一致
export interface PreferredMajorTier {
  tier: number;     // 1-based, 严格递增, 无空缺
  majors: string[]; // 该梯队的专业名 (1 个或多个)
}
