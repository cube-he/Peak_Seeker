import {
  groupInRankWindow,
  filterGroupsByRankWindow,
  filterUniversitiesByRankWindow,
  poolRankBounds,
} from './rank-window-filter';

const grp = (point: number | null) => ({ groupMinRank: point });

describe('groupInRankWindow', () => {
  const w = { minRank: 5000, maxRank: 12000 };
  it('point 在窗口内 → true', () => {
    expect(groupInRankWindow(grp(8000), w)).toBe(true);
    expect(groupInRankWindow(grp(5000), w)).toBe(true);
    expect(groupInRankWindow(grp(12000), w)).toBe(true);
  });
  it('point 在窗口外 → false', () => {
    expect(groupInRankWindow(grp(4000), w)).toBe(false);
    expect(groupInRankWindow(grp(13000), w)).toBe(false);
  });
  it('无预测(null/缺失) → false', () => {
    expect(groupInRankWindow(grp(null), w)).toBe(false);
    expect(groupInRankWindow({} as any, w)).toBe(false);
    expect(groupInRankWindow(null as any, w)).toBe(false);
  });
});

describe('filterGroupsByRankWindow', () => {
  const groups = [grp(8000), grp(4000), grp(null)];
  it('窗口内保留, 窗口外+无预测剔除', () => {
    expect(filterGroupsByRankWindow(groups, { minRank: 5000, maxRank: 12000 })).toEqual([grp(8000)]);
  });
  it('窗口 null → 原样返回同引用', () => {
    expect(filterGroupsByRankWindow(groups, null)).toBe(groups);
  });
});

describe('filterUniversitiesByRankWindow', () => {
  const u = (points: Array<number | null>) => ({ groups: points.map(grp) });
  const unis = [u([8000, null]), u([4000])];
  it('校内任一组命中 → 保留', () => {
    expect(filterUniversitiesByRankWindow(unis, { minRank: 5000, maxRank: 12000 })).toEqual([unis[0]]);
  });
  it('窗口 null → 原样返回同引用', () => {
    expect(filterUniversitiesByRankWindow(unis, null)).toBe(unis);
  });
});

describe('poolRankBounds', () => {
  it('取最小/最大 point, 忽略 null', () => {
    expect(poolRankBounds([grp(8000), grp(4000), grp(null), grp(12000)])).toEqual({
      minPoint: 4000,
      maxPoint: 12000,
    });
  });
  it('全无预测 → null', () => {
    expect(poolRankBounds([grp(null), {} as any])).toBe(null);
  });
});
