/**
 * 灰度开关 / feature flags
 *
 * 通过环境变量控制功能在生产的渐进发布,默认全部 false 保护存量数据。
 * 测试代码可以直接 mutation 对应字段 (类型上是 mutable 字段, 不是 readonly)。
 *
 * 见 docs/superpowers/specs/2026-06-02-batch-selection-at-intake-design.md § 十
 */
export const FEATURE_FLAGS = {
  /**
   * 严格批次校验: 创建 plan / 取候选池时, 若 plan 批次不在学生 preferredBatches 中则抛 400。
   * 默认 false: 只在 server 日志 warn, 不影响业务, 给数据团队推动学生补全 preferredBatches 的窗口。
   */
  STRICT_BATCH_VALIDATION: process.env.STRICT_BATCH_VALIDATION === 'true',
};
