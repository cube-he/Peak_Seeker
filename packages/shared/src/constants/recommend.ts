// 推荐策略常量
export const RECOMMEND_STRATEGIES = {
  // 默认冲稳保比例
  DEFAULT_RUSH_COUNT: 20,
  DEFAULT_STABLE_COUNT: 40,
  DEFAULT_SAFE_COUNT: 36,

  // 位次范围
  DEFAULT_RUSH_RANGE: 10000,   // 冲：位次 + 10000
  DEFAULT_STABLE_RANGE: 3000, // 稳：位次 ± 3000
  DEFAULT_SAFE_RANGE: 5000,   // 保：位次 - 5000

  // 录取概率阈值
  ACCEPT_RATE_THRESHOLDS: {
    RUSH: { min: 0.1, max: 0.4 },
    STABLE: { min: 0.5, max: 0.75 },
    SAFE: { min: 0.8, max: 0.95 },
  },
} as const;

// 风险等级
export const RISK_LEVELS = {
  HIGH: { value: 'high', label: '高风险', color: '#ff4d4f' },
  MEDIUM: { value: 'medium', label: '中风险', color: '#faad14' },
  LOW: { value: 'low', label: '低风险', color: '#52c41a' },
} as const;

// 策略类型
export const STRATEGY_TYPES = {
  RUSH: { value: 'rush', label: '冲', color: '#ff4d4f' },
  STABLE: { value: 'stable', label: '稳', color: '#1890ff' },
  SAFE: { value: 'safe', label: '保', color: '#52c41a' },
} as const;
