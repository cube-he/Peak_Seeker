import { normalize, addMajorToContainer, displayTiers } from '../PreferredMajorTierEditor';
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

describe('addMajorToContainer', () => {
  it('空 state 加入梯队1 → 自动建梯队1', () => {
    expect(addMajorToContainer({ pool: [], tiers: [] }, 'tier-1', '计算机')).toEqual({
      pool: [],
      tiers: [{ tier: 1, majors: ['计算机'] }],
    });
  });
  it('梯队1已存在 → 追加', () => {
    expect(
      addMajorToContainer({ pool: [], tiers: [{ tier: 1, majors: ['A'] }] }, 'tier-1', 'B'),
    ).toEqual({ pool: [], tiers: [{ tier: 1, majors: ['A', 'B'] }] });
  });
  it('加入意向池', () => {
    expect(addMajorToContainer({ pool: [], tiers: [] }, 'pool', 'X')).toEqual({
      pool: ['X'],
      tiers: [],
    });
  });
  it('已存在(任意容器) → 原样返回(同引用)', () => {
    const s = { pool: ['X'], tiers: [{ tier: 1, majors: ['A'] }] };
    expect(addMajorToContainer(s, 'tier-1', 'X')).toBe(s);
    expect(addMajorToContainer(s, 'tier-1', 'A')).toBe(s);
  });
  it('加入更高梯队 → 按 tier 升序插入', () => {
    expect(
      addMajorToContainer({ pool: [], tiers: [{ tier: 1, majors: ['A'] }] }, 'tier-2', 'B'),
    ).toEqual({ pool: [], tiers: [{ tier: 1, majors: ['A'] }, { tier: 2, majors: ['B'] }] });
  });
  it('空字符串 major → 原样返回同引用', () => {
    const s = { pool: [], tiers: [] };
    expect(addMajorToContainer(s, 'tier-1', '')).toBe(s);
  });
  it('未识别的 containerId → 原样返回同引用(静默 no-op)', () => {
    const s = { pool: [], tiers: [{ tier: 1, majors: ['A'] }] };
    expect(addMajorToContainer(s, 'unknown-container', 'X')).toBe(s);
  });
});

describe('displayTiers', () => {
  it('无梯队 → 注入空梯队1', () => {
    expect(displayTiers({ pool: ['X'], tiers: [] })).toEqual([{ tier: 1, majors: [] }]);
  });
  it('有梯队 → 原样(同引用)', () => {
    const tiers = [{ tier: 1, majors: ['A'] }];
    expect(displayTiers({ pool: [], tiers })).toBe(tiers);
  });
});
