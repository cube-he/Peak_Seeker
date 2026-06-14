import { normalize, addMajorToContainer, displayTiers, moveMajorBetweenContainers } from '../PreferredMajorTierEditor';
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

describe('moveMajorBetweenContainers', () => {
  it('池子 → 已存在的梯队1', () => {
    expect(
      moveMajorBetweenContainers({ pool: ['X'], tiers: [{ tier: 1, majors: [] }] }, 'pool', 'tier-1', 'X'),
    ).toEqual({ pool: [], tiers: [{ tier: 1, majors: ['X'] }] });
  });
  it('池子 → 占位梯队1(state 无梯队) 自动创建', () => {
    expect(
      moveMajorBetweenContainers({ pool: ['X'], tiers: [] }, 'pool', 'tier-1', 'X'),
    ).toEqual({ pool: [], tiers: [{ tier: 1, majors: ['X'] }] });
  });
  it('梯队1 → 池子', () => {
    expect(
      moveMajorBetweenContainers({ pool: [], tiers: [{ tier: 1, majors: ['X'] }] }, 'tier-1', 'pool', 'X'),
    ).toEqual({ pool: ['X'], tiers: [{ tier: 1, majors: [] }] });
  });
  it('梯队1 → 梯队2', () => {
    expect(
      moveMajorBetweenContainers(
        { pool: [], tiers: [{ tier: 1, majors: ['X'] }, { tier: 2, majors: [] }] },
        'tier-1',
        'tier-2',
        'X',
      ),
    ).toEqual({ pool: [], tiers: [{ tier: 1, majors: [] }, { tier: 2, majors: ['X'] }] });
  });
  it('src === dst → 原样同引用', () => {
    const s = { pool: [], tiers: [{ tier: 1, majors: ['X'] }] };
    expect(moveMajorBetweenContainers(s, 'tier-1', 'tier-1', 'X')).toBe(s);
  });
  it('无 major → 原样同引用', () => {
    const s = { pool: ['X'], tiers: [] };
    expect(moveMajorBetweenContainers(s, 'pool', 'tier-1', '')).toBe(s);
  });
  it('非法 dst → 不动(防数据丢失)', () => {
    const s = { pool: ['X'], tiers: [] };
    expect(moveMajorBetweenContainers(s, 'pool', 'bogus', 'X')).toBe(s);
  });
});
