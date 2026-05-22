import { getTier, isHistorical, classifyRank } from './rank-tier';

describe('getTier', () => {
  it('orders 985 > 211 > 专科 > 普通本科', () => {
    expect(getTier({ is985: true, is211: true, batch: '本科一批' })).toBe('985');
    expect(getTier({ is985: false, is211: true, batch: '本科一批' })).toBe('211');
    expect(getTier({ is985: false, is211: false, batch: '专科批' })).toBe('专科');
    expect(getTier({ is985: false, is211: false, batch: '本科二批' })).toBe('普通本科');
    expect(getTier({ is985: false, is211: false, batch: '高职单招批' })).toBe('专科');
  });
});

describe('classifyRank', () => {
  it('returns unknown when predictedRank is null', () => {
    expect(classifyRank(10000, null, '985', false)).toBe('unknown');
  });

  it('classifies a far-easier school as safe/elite and a far-harder one as rush', () => {
    // 985: stable=1500. userRank 10000.
    expect(classifyRank(10000, 5000, '985', false)).toBe('rush');   // diff -5000 < -1500
    expect(classifyRank(10000, 10000, '985', false)).toBe('stable'); // diff 0
    // safe: diff 3000 ∈ [1500, 5000) → safe
    expect(classifyRank(10000, 13000, '985', false)).toBe('safe');
    // elite: diff 6000 ≥ safe(5000) → elite
    expect(classifyRank(10000, 16000, '985', false)).toBe('elite');
  });
});

describe('isHistorical', () => {
  it('detects history/arts subject strings', () => {
    expect(isHistorical('历史')).toBe(true);
    expect(isHistorical('文科')).toBe(true);
    expect(isHistorical('物理')).toBe(false);
  });
});
