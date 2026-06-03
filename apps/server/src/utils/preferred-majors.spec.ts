// Helper: 兼容学生意向专业字段的两种 shape:
//   旧 shape: string[]          (历史扁平数组)
//   新 shape: PreferredMajorTier[]  (梯队结构)
// migration 之后线上只有新 shape, 但兼容层兜底防迁移失败/测试 mock。

import {
  flattenPreferredMajors,
  getTierMajors,
  listTiers,
  isTierShape,
} from './preferred-majors';

describe('preferred-majors helper', () => {
  describe('flattenPreferredMajors', () => {
    it('返回空数组: null / undefined / 非数组', () => {
      expect(flattenPreferredMajors(null)).toEqual([]);
      expect(flattenPreferredMajors(undefined)).toEqual([]);
      expect(flattenPreferredMajors({} as any)).toEqual([]);
    });
    it('新 shape: 拼接所有 tier 的 majors', () => {
      const v = [
        { tier: 1, majors: ['A', 'B'] },
        { tier: 2, majors: ['C'] },
      ];
      expect(flattenPreferredMajors(v)).toEqual(['A', 'B', 'C']);
    });
    it('旧 shape (字符串数组): 直接返回', () => {
      expect(flattenPreferredMajors(['A', 'B'])).toEqual(['A', 'B']);
    });
    it('混合脏数据: 过滤掉非法 entry', () => {
      const v = [{ tier: 1, majors: ['A'] }, { tier: 2 } as any, null as any];
      expect(flattenPreferredMajors(v)).toEqual(['A']);
    });
    it('空数组', () => {
      expect(flattenPreferredMajors([])).toEqual([]);
    });
  });

  describe('getTierMajors', () => {
    const tiers = [{ tier: 1, majors: ['A'] }, { tier: 2, majors: ['B', 'C'] }];
    it('返回指定 tier 的 majors', () => {
      expect(getTierMajors(tiers, 1)).toEqual(['A']);
      expect(getTierMajors(tiers, 2)).toEqual(['B', 'C']);
    });
    it('tier 不存在 / tier=0 / 越界 / 非数组 → 空', () => {
      expect(getTierMajors(tiers, 0)).toEqual([]);
      expect(getTierMajors(tiers, 99)).toEqual([]);
      expect(getTierMajors(null, 1)).toEqual([]);
      expect(getTierMajors(['A'], 1)).toEqual([]); // 旧 shape 不支持 tier 查询
    });
  });

  describe('listTiers', () => {
    it('过滤掉无效 entry', () => {
      const v = [
        { tier: 1, majors: ['A'] },
        { tier: 'x', majors: [] } as any, // tier 非 number
        { tier: 2, majors: 'not array' } as any,
        { tier: 3, majors: ['B'] },
      ];
      expect(listTiers(v)).toEqual([
        { tier: 1, majors: ['A'] },
        { tier: 3, majors: ['B'] },
      ]);
    });
    it('null / 旧 shape → 空', () => {
      expect(listTiers(null)).toEqual([]);
      expect(listTiers(['A', 'B'])).toEqual([]);
    });
  });

  describe('isTierShape', () => {
    it('新 shape 返回 true', () => {
      expect(isTierShape([{ tier: 1, majors: ['A'] }])).toBe(true);
    });
    it('旧 shape / 空 / null 返回 false', () => {
      expect(isTierShape(['A'])).toBe(false);
      expect(isTierShape([])).toBe(false);
      expect(isTierShape(null)).toBe(false);
    });
  });
});
