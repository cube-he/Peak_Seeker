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
  it('单键: 办学性质 公办优先(asc) — 二元(公办/民办), 其它沉底', () => {
    const items = [
      mk({ id: 1, schoolNature: '民办' }),
      mk({ id: 2, schoolNature: '公办' }),
      // 真实数据: 中外合作院校的 runningNature 是"公办 中外合作办学"复合串 → 视同公办, 不再单分一档
      mk({ id: 3, schoolNature: '公办 中外合作办学' }),
      // 港澳/境外/未知 → null 沉底
      mk({ id: 4, schoolNature: '境外高校独立办学' }),
      mk({ id: 5, schoolNature: null }),
    ];
    const rules: SortRule[] = [{ key: 'SCHOOL_NATURE', dir: 'asc' }];
    // 公办(2,3 稳定保持原序) → 民办(1) → 沉底(4,5 稳定保持原序)
    expect(sortPlanItems(items, rules, ctx).map((i) => i.id)).toEqual([2, 3, 1, 4, 5]);
  });

  it('单键: 办学性质 民办优先(desc) — 翻转后民办在前, 沉底项位置不变', () => {
    const items = [
      mk({ id: 1, schoolNature: '公办' }),
      mk({ id: 2, schoolNature: '民办' }),
      mk({ id: 3, schoolNature: null }),
    ];
    const rules: SortRule[] = [{ key: 'SCHOOL_NATURE', dir: 'desc' }];
    expect(sortPlanItems(items, rules, ctx).map((i) => i.id)).toEqual([2, 1, 3]);
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

import { buildAppliedOrder, resolveTierRenderOrder, applyMove, moveToPositionOrder } from '../plan-sort';

describe('applyMove / moveToPositionOrder (自由排序)', () => {
  it('applyMove: 把第 5 位(idx4)移到第 2 位(idx1)', () => {
    expect(applyMove([1, 2, 3, 4, 5], 4, 1)).toEqual([1, 5, 2, 3, 4]);
  });
  it('applyMove: from===to 或越界 → 原数组', () => {
    expect(applyMove([1, 2, 3], 1, 1)).toEqual([1, 2, 3]);
    expect(applyMove([1, 2, 3], 0, 9)).toEqual([1, 2, 3]);
  });
  it('moveToPositionOrder: 输入 N(1-based) → 该 item 移到第 N 位', () => {
    const items = [{ id: 10 }, { id: 20 }, { id: 30 }, { id: 40 }, { id: 50 }];
    // id=50 现在第 5 位, 移到第 2 位
    expect(moveToPositionOrder(items, 50, 2)).toEqual([10, 50, 20, 30, 40]);
    // id=10 移到第 3 位
    expect(moveToPositionOrder(items, 10, 3)).toEqual([20, 30, 10, 40, 50]);
  });
  it('moveToPositionOrder: 越界位置夹到 [1, len]', () => {
    const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(moveToPositionOrder(items, 1, 99)).toEqual([2, 3, 1]); // 夹到末位
    expect(moveToPositionOrder(items, 3, 0)).toEqual([3, 1, 2]);  // 夹到首位
  });
});

describe('resolveTierRenderOrder', () => {
  const tiers = ['rush', 'stable', 'safe'];

  it('段序翻转仅在预览态生效: 预览 + desc → 反转', () => {
    expect(resolveTierRenderOrder(tiers, true, 'desc')).toEqual(['safe', 'stable', 'rush']);
  });

  it('预览 + asc → 原序', () => {
    expect(resolveTierRenderOrder(tiers, true, 'asc')).toEqual(['rush', 'stable', 'safe']);
  });

  it('非预览态即使 desc 也不反转(防恢复/应用后段序倒置)', () => {
    expect(resolveTierRenderOrder(tiers, false, 'desc')).toEqual(['rush', 'stable', 'safe']);
  });

  it('非预览态 asc → 原序', () => {
    expect(resolveTierRenderOrder(tiers, false, 'asc')).toEqual(['rush', 'stable', 'safe']);
  });

  it('不修改入参数组', () => {
    const input = ['rush', 'stable', 'safe'];
    resolveTierRenderOrder(input, true, 'desc');
    expect(input).toEqual(['rush', 'stable', 'safe']);
  });
});

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
