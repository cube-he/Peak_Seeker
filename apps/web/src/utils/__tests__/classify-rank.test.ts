import { classifyRank, getTier, isHistorical } from '../classify-rank';

describe('getTier', () => {
  it('985 wins over 211', () => {
    expect(getTier({ is985: true, is211: true, batch: '本科批A段' })).toBe('985');
  });
  it('211 wins when 985 false', () => {
    expect(getTier({ is985: false, is211: true, batch: '本科批A段' })).toBe('211');
  });
  it('专科 batch maps to 专科', () => {
    expect(getTier({ is985: false, is211: false, batch: '高职(专科)批' })).toBe('专科');
    expect(getTier({ is985: false, is211: false, batch: '本科专科' })).toBe('专科');
  });
  it('default to 普通本科', () => {
    expect(getTier({ is985: false, is211: false, batch: '本科批B段' })).toBe('普通本科');
  });
});

describe('isHistorical', () => {
  it('returns true for 历史 / 历史类 / 文科', () => {
    expect(isHistorical('历史')).toBe(true);
    expect(isHistorical('历史类')).toBe(true);
    expect(isHistorical('文科')).toBe(true);
  });
  it('returns false for 物理 / 理科 / empty', () => {
    expect(isHistorical('物理')).toBe(false);
    expect(isHistorical('理科')).toBe(false);
    expect(isHistorical('')).toBe(false);
  });
});

describe('classifyRank', () => {
  const TIER = '普通本科';

  it('returns unknown when predictedRank is null', () => {
    expect(classifyRank(50000, null, TIER, false)).toBe('unknown');
  });

  it('rush: predicted way below user (negative diff)', () => {
    expect(classifyRank(50000, 20000, TIER, false)).toBe('rush');
  });

  it('stable: small positive diff within stable threshold', () => {
    expect(classifyRank(50000, 55000, TIER, false)).toBe('stable');
  });

  it('safe: diff in [stable, safe) range', () => {
    expect(classifyRank(50000, 70000, TIER, false)).toBe('safe');
  });

  it('elite: diff >= safe but ratio still < safeMax 0.50', () => {
    expect(classifyRank(50000, 72000, TIER, false)).toBe('safe');
  });

  it('elite: very large positive diff', () => {
    expect(classifyRank(50000, 200000, TIER, false)).toBe('elite');
  });

  it('rush by ratio when absolute too small (low userRank scenario)', () => {
    // tier=985, user=2000, predicted=1700 → diff=-300, |diff|<stable(1500) → abs says stable.
    // ratio = -300/2000 = -0.15 < -10% → rush. Risker = rush.
    expect(classifyRank(2000, 1700, '985', false)).toBe('rush');
  });

  it('historical multiplier widens stable band', () => {
    // tier=普通本科, user=50000, predicted=64000 → diff=14000.
    // With 1.5x multiplier: stable band = 10000*1.5=15000 → diff<15000 → abs stable.
    // ratio = 14000/50000 = 0.28 → stableMax(0.15) <= ratio < safeMax(0.50) → ratio safe.
    // RISK_ORDER = ['rush','stable','safe','elite']; min(stable.idx=1, safe.idx=2)=1 → 'stable'.
    expect(classifyRank(50000, 64000, '普通本科', true)).toBe('stable');
  });

  it('userRank zero degenerates to ratio safely (no division crash)', () => {
    // user=0 → ratio uses Math.max(1, userRank) = 1 → ratio = predicted = 10000.
    // abs: diff=10000 → in [stable=10000, safe=30000) → 'safe'
    // ratio: 10000 > safeMax(0.5) → 'elite'
    // risker (lower RISK_ORDER index): min(safe=2, elite=3) = 'safe'
    expect(classifyRank(0, 10000, TIER, false)).toBe('safe');
  });
});
