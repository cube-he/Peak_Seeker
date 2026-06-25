// gradient-calculator.spec.ts
import { calcDynamicGradient, calcGradient, sanitizeTierThresholds, DEFAULT_TIER_THRESHOLDS } from './gradient-calculator';

describe('sanitizeTierThresholds', () => {
  it('合法(7项齐全+严格递增)→ 归一返回', () => {
    expect(sanitizeTierThresholds(DEFAULT_TIER_THRESHOLDS)).toEqual(DEFAULT_TIER_THRESHOLDS);
  });
  it('非严格递增 → null', () => {
    expect(sanitizeTierThresholds({ ...DEFAULT_TIER_THRESHOLDS, chong: -0.20 })).toBeNull(); // chong==jiChong
  });
  it('缺项/非数字/空 → null', () => {
    const { qiangBao: _omit, ...missing } = DEFAULT_TIER_THRESHOLDS;
    expect(sanitizeTierThresholds(missing)).toBeNull();
    expect(sanitizeTierThresholds({ ...DEFAULT_TIER_THRESHOLDS, wen: 'x' })).toBeNull();
    expect(sanitizeTierThresholds(null)).toBeNull();
  });
});

describe('calcDynamicGradient 自定义阈值', () => {
  it('老师把"稳"区间放宽 → 同一组从冲变稳', () => {
    // edge = 9000/10000 - 1 = -0.10。默认 chong=-0.12 → edge>=-0.12 落 XIAO_CHONG(< -0.02);
    // 自定义把 xiaoChong 收紧到 -0.15 → edge(-0.10) 不再 < -0.15, 落 WEN(<= wen)。
    const custom = { ...DEFAULT_TIER_THRESHOLDS, jiChong: -0.30, chong: -0.20, xiaoChong: -0.15, wen: 0.0 };
    const def = calcDynamicGradient({ studentRank: 10000, historyMinRank: 9000 });
    const cus = calcDynamicGradient({ studentRank: 10000, historyMinRank: 9000, thresholds: custom });
    expect(def.tier).toBe('XIAO_CHONG');
    expect(cus.tier).toBe('WEN');
  });
});

describe('calcGradient', () => {
  it('returns CHONG when the historical admission rank is much better than the student rank', () => {
    expect(calcGradient(156000, 45000)).toBe('CHONG');
  });

  it('returns WEN when the ranks are close', () => {
    expect(calcGradient(10000, 10000)).toBe('WEN');
    expect(calcGradient(10000, 9500)).toBe('WEN');
    expect(calcGradient(10000, 10500)).toBe('WEN');
  });

  it('returns BAO when the student rank is much better than the historical admission rank', () => {
    expect(calcGradient(8000, 12000)).toBe('BAO');
  });

  it('keeps threshold boundaries in the stable band', () => {
    expect(calcGradient(10000, 9000)).toBe('WEN');
    expect(calcGradient(10000, 11000)).toBe('WEN');
  });

  it('returns BAO when historical rank is missing', () => {
    expect(calcGradient(10000, null)).toBe('BAO');
    expect(calcGradient(10000, undefined as any)).toBe('BAO');
    expect(calcGradient(10000, 0)).toBe('BAO');
  });

  it('supports custom thresholds', () => {
    expect(calcGradient(10000, 8400, { chong: 0.85, bao: 1.05 })).toBe('CHONG');
    expect(calcGradient(10000, 10600, { chong: 0.85, bao: 1.05 })).toBe('BAO');
  });
});

describe('calcDynamicGradient', () => {
  it('splits dynamic risk into detailed tiers while preserving broad gradient groups', () => {
    const cases = [
      { historyMinRank: 7600, tier: 'JI_CHONG', gradient: 'CHONG' },
      { historyMinRank: 8500, tier: 'CHONG', gradient: 'CHONG' },
      { historyMinRank: 9300, tier: 'XIAO_CHONG', gradient: 'CHONG' },
      { historyMinRank: 10200, tier: 'WEN', gradient: 'WEN' },
      { historyMinRank: 10900, tier: 'WEN_BAO', gradient: 'WEN' },
      { historyMinRank: 11600, tier: 'BAO', gradient: 'BAO' },
      { historyMinRank: 12800, tier: 'QIANG_BAO', gradient: 'BAO' },
      { historyMinRank: 14000, tier: 'DIBAO', gradient: 'BAO' },
    ] as const;

    for (const item of cases) {
      const result = calcDynamicGradient({
        studentRank: 10000,
        historyMinRank: item.historyMinRank,
      });
      expect(result.tier).toBe(item.tier);
      expect(result.gradient).toBe(item.gradient);
    }
  });

  it('keeps BAO compatibility while exposing a DIBAO tier for very strong safety margins', () => {
    const result = calcDynamicGradient({
      studentRank: 7000,
      historyMinRank: 12000,
    });

    expect(result.gradient).toBe('BAO');
    expect(result.tier).toBe('DIBAO');
  });
});
