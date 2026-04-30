import api from './api';

export interface RushSafeStableThresholds {
  rush: { min: number; max: number };
  safe: { min: number; max: number };
  stable: { min: number; max: number };
}

export const algorithmConfigApi = {
  getRushSafeStableThresholds(): Promise<RushSafeStableThresholds> {
    return api.get('/algorithm-config/rush-safe-stable-thresholds');
  },
  setRushSafeStableThresholds(v: RushSafeStableThresholds): Promise<{ success: boolean }> {
    return api.put('/algorithm-config/rush-safe-stable-thresholds', v);
  },
};
