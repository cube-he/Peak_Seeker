// region-match.spec.ts
import { normalizeRegion, isRegionMismatch, hasRegionPreference } from './region-match';

describe('region-match', () => {
  describe('normalizeRegion', () => {
    it('去掉末尾 省/市 后缀, 解决学生"成都市" vs 院校库"成都"对不上', () => {
      expect(normalizeRegion('成都市')).toBe('成都');
      expect(normalizeRegion('四川省')).toBe('四川');
      expect(normalizeRegion('成都')).toBe('成都');
      expect(normalizeRegion('  上海市 ')).toBe('上海');
      expect(normalizeRegion(null)).toBe('');
      expect(normalizeRegion(undefined)).toBe('');
    });
  });

  describe('hasRegionPreference', () => {
    it('省市都空 → false', () => {
      expect(hasRegionPreference([], [])).toBe(false);
      expect(hasRegionPreference(null, undefined)).toBe(false);
    });
    it('填了任一 → true', () => {
      expect(hasRegionPreference(['四川'], [])).toBe(true);
      expect(hasRegionPreference([], ['成都市'])).toBe(true);
    });
  });

  describe('isRegionMismatch', () => {
    it('学生没填意向地区 → 不算 mismatch (无偏好)', () => {
      expect(isRegionMismatch('湖北', '武汉', [], [])).toBe(false);
    });
    it('意向城市"成都市"命中院校城市"成都"(后缀归一) → 不 mismatch', () => {
      expect(isRegionMismatch('四川', '成都', [], ['成都市'])).toBe(false);
    });
    it('意向省命中(同省不同市也算) → 不 mismatch', () => {
      expect(isRegionMismatch('四川', '绵阳', ['四川'], [])).toBe(false);
    });
    it('院校省、市都不在意向内 → mismatch', () => {
      expect(isRegionMismatch('湖北', '武汉', ['四川'], ['成都市'])).toBe(true);
    });
  });
});
