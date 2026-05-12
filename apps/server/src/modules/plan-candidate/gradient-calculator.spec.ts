// gradient-calculator.spec.ts
import { calcDynamicGradient, calcGradient } from './gradient-calculator';

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

  it('loosens the expected rank when plan supply grows and the batch competition pool shrinks', () => {
    const result = calcDynamicGradient({
      studentRank: 11200,
      historyMinRank: 10000,
      currentPlanCount: 36,
      previousPlanCount: 30,
      currentCompetitionCount: 190000,
      previousCompetitionCount: 210000,
    });

    expect(result.adjustedMinRank).toBeGreaterThan(10000);
    expect(result.gradient).toBe('WEN');
    expect(result.tier).toBe('WEN');
    expect(result.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('plan increased'),
      expect.stringContaining('competition pool decreased'),
    ]));
  });

  it('tightens the expected rank and downgrades safety when plan supply drops sharply', () => {
    const result = calcDynamicGradient({
      studentRank: 9000,
      historyMinRank: 12000,
      currentPlanCount: 18,
      previousPlanCount: 30,
    });

    expect(result.adjustedMinRank).toBeLessThan(12000);
    expect(result.tier).toBe('WEN_BAO');
    expect(result.gradient).toBe('WEN');
    expect(result.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('plan decreased sharply'),
      expect.stringContaining('risk level downgraded'),
    ]));
  });

  it('uses supplementary vacancies as an accessibility signal', () => {
    const result = calcDynamicGradient({
      studentRank: 11300,
      historyMinRank: 10000,
      supplementary: {
        totalPlanCount: 8,
        totalRounds: 2,
        supplementaryRate: 0.18,
      },
    });

    expect(result.adjustedMinRank).toBeGreaterThan(10000);
    expect(result.gradient).toBe('WEN');
    expect(result.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('supplementary vacancies'),
    ]));
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
