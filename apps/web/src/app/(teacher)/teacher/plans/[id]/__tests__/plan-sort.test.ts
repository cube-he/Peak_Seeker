import { sortPlanItems, type SortableItem, type SortRule } from '../plan-sort';

const mk = (over: Partial<SortableItem> & { id: number }): SortableItem => ({
  id: over.id,
  gradient: 'WEN',
  schoolNature: null, province: null, inSichuan: false,
  score25Group: null, rank25Group: null, planCount: null, tuition: null,
  softRanking: null, is985: false, is211: false, isDoubleFirstClass: false,
  rank25Major: null, lastYearMinRank: null,
  ...over,
});

const ctx = { studentRank: 10000 };

describe('sortPlanItems', () => {
  it('单键: 办学性质 公办优先(asc)', () => {
    const items = [mk({ id: 1, schoolNature: '民办' }), mk({ id: 2, schoolNature: '公办' })];
    const rules: SortRule[] = [{ key: 'SCHOOL_NATURE', dir: 'asc' }];
    expect(sortPlanItems(items, rules, ctx).map((i) => i.id)).toEqual([2, 1]);
  });

  it('多级: 川内优先 → 分数线高到低', () => {
    const items = [
      mk({ id: 1, inSichuan: true, province: '四川', score25Group: 600 }),
      mk({ id: 2, inSichuan: true, province: '四川', score25Group: 650 }),
      mk({ id: 3, inSichuan: false, province: '北京', score25Group: 700 }),
    ];
    const rules: SortRule[] = [
      { key: 'PROVINCE_INOUT', dir: 'asc' },
      { key: 'GROUP_MIN_SCORE', dir: 'desc' },
    ];
    expect(sortPlanItems(items, rules, ctx).map((i) => i.id)).toEqual([2, 1, 3]);
  });

  it('null 值一律沉底(无论方向)', () => {
    const items = [mk({ id: 1, score25Group: null }), mk({ id: 2, score25Group: 600 })];
    expect(sortPlanItems(items, [{ key: 'GROUP_MIN_SCORE', dir: 'desc' }], ctx).map((i) => i.id)).toEqual([2, 1]);
    expect(sortPlanItems(items, [{ key: 'GROUP_MIN_SCORE', dir: 'asc' }], ctx).map((i) => i.id)).toEqual([2, 1]);
  });

  it('稳定排序: 全键相等保持原相对顺序', () => {
    const items = [mk({ id: 5, schoolNature: '公办' }), mk({ id: 3, schoolNature: '公办' }), mk({ id: 9, schoolNature: '公办' })];
    expect(sortPlanItems(items, [{ key: 'SCHOOL_NATURE', dir: 'asc' }], ctx).map((i) => i.id)).toEqual([5, 3, 9]);
  });

  it('空规则栈: 原样返回', () => {
    const items = [mk({ id: 2 }), mk({ id: 1 })];
    expect(sortPlanItems(items, [], ctx).map((i) => i.id)).toEqual([2, 1]);
  });

  it('相对位次差: 偏稳(desc)把超出多的排前', () => {
    // histRank - studentRank 越大越稳; studentRank=10000
    const items = [
      mk({ id: 1, rank25Major: 9000 }),  // diff -1000 偏冲
      mk({ id: 2, rank25Major: 15000 }), // diff +5000 偏稳
    ];
    expect(sortPlanItems(items, [{ key: 'RANK_DIFF', dir: 'desc' }], ctx).map((i) => i.id)).toEqual([2, 1]);
  });
});

import { buildAppliedOrder } from '../plan-sort';

describe('buildAppliedOrder', () => {
  it('强制冲→稳→保 分块, 块内按规则排, 返回 itemId 顺序', () => {
    const items = [
      mk({ id: 1, gradient: 'BAO', score25Group: 500 }),
      mk({ id: 2, gradient: 'CHONG', score25Group: 680 }),
      mk({ id: 3, gradient: 'CHONG', score25Group: 700 }),
      mk({ id: 4, gradient: 'WEN', score25Group: 600 }),
    ];
    const rules: SortRule[] = [{ key: 'GROUP_MIN_SCORE', dir: 'desc' }];
    // 冲块(3:700, 2:680) → 稳块(4) → 保块(1)
    expect(buildAppliedOrder(items, rules, ctx)).toEqual([3, 2, 4, 1]);
  });

  it('未知梯度归入冲块兜底', () => {
    const items = [mk({ id: 1, gradient: 'WEN' }), mk({ id: 2, gradient: 'X' as any })];
    expect(buildAppliedOrder(items, [], ctx)).toEqual([2, 1]); // X→冲块在前, WEN→稳块
  });
});
