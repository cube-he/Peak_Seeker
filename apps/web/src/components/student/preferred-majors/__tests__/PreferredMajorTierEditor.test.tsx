import { normalize } from '../PreferredMajorTierEditor';
import type { PreferredMajorTier } from '../types';

describe('PreferredMajorTierEditor / normalize', () => {
  it('剔除空梯队 + renumber', () => {
    const input: PreferredMajorTier[] = [
      { tier: 1, majors: ['A'] },
      { tier: 2, majors: [] },  // 空梯队
      { tier: 3, majors: ['B'] },
    ];
    expect(normalize(input)).toEqual([
      { tier: 1, majors: ['A'] },
      { tier: 2, majors: ['B'] },  // 原 tier 3 → 2
    ]);
  });

  it('跨梯队同专业去重 (以前梯队为准)', () => {
    const input: PreferredMajorTier[] = [
      { tier: 1, majors: ['A', 'B'] },
      { tier: 2, majors: ['A', 'C'] },  // A 已在 tier 1
    ];
    expect(normalize(input)).toEqual([
      { tier: 1, majors: ['A', 'B'] },
      { tier: 2, majors: ['C'] },
    ]);
  });

  it('全空梯队被剔除', () => {
    const input: PreferredMajorTier[] = [
      { tier: 1, majors: [] },
      { tier: 2, majors: [] },
    ];
    expect(normalize(input)).toEqual([]);
  });

  it('过滤非法 entry (非字符串 / 空字符串)', () => {
    const input: any = [
      { tier: 1, majors: ['A', '', null, undefined, 'B'] },
    ];
    expect(normalize(input)).toEqual([{ tier: 1, majors: ['A', 'B'] }]);
  });

  it('正常梯队不变', () => {
    const input: PreferredMajorTier[] = [
      { tier: 1, majors: ['A'] },
      { tier: 2, majors: ['B', 'C'] },
    ];
    expect(normalize(input)).toEqual(input);
  });
});
