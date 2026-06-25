import api from './api';

// 8 段动态梯度的 7 个分界(edge = 组门槛位次 ÷ 学生位次 - 1; 负=偏冲/正=偏保), 严格单调递增。
export interface TierThresholds {
  jiChong: number;
  chong: number;
  xiaoChong: number;
  wen: number;
  wenBao: number;
  bao: number;
  qiangBao: number;
}

export interface GradientConfigResponse {
  thresholds: TierThresholds;
  isDefault: boolean;
  default: TierThresholds;
}

// 与后端 DEFAULT_TIER_THRESHOLDS 对齐(配置未加载时的兜底)。
export const DEFAULT_TIER_THRESHOLDS: TierThresholds = {
  jiChong: -0.2,
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

export const teacherApi = {
  getGradientConfig(): Promise<GradientConfigResponse> {
    return api.get('/teachers/me/gradient-config') as unknown as Promise<GradientConfigResponse>;
  },
  updateGradientConfig(thresholds: TierThresholds): Promise<GradientConfigResponse> {
    return api.put('/teachers/me/gradient-config', thresholds) as unknown as Promise<GradientConfigResponse>;
  },
};
