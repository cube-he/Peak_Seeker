import { confirmedBonusPoints } from './bonus-points.util';

describe('confirmedBonusPoints', () => {
  it('HAS_BONUS + 单项 → 取该项分值', () => {
    expect(confirmedBonusPoints({
      bonusPolicyStatus: 'HAS_BONUS',
      bonusItems: [{ type: 'ETHNIC_AREA_MINORITY', value: 20, source: '三州十七县两区少数民族 +20' }],
    })).toBe(20);
  });

  it('多项不叠加, 取最高一项', () => {
    expect(confirmedBonusPoints({
      bonusPolicyStatus: 'HAS_BONUS',
      bonusItems: [
        { type: 'OVERSEAS_RETURNED', value: 5 },
        { type: 'MARTYR_CHILD', value: 20 },
        { type: 'VETERAN_SELF_EMPLOYED', value: 10 },
      ],
    })).toBe(20);
  });

  it('优先录取项 (value=0) 不产生加分', () => {
    expect(confirmedBonusPoints({
      bonusPolicyStatus: 'HAS_BONUS',
      bonusItems: [{ type: 'PRIORITY_MILITARY_CHILD', value: 0 }],
    })).toBe(0);
  });

  it('状态非 HAS_BONUS 时即使有细则也不加分', () => {
    expect(confirmedBonusPoints({
      bonusPolicyStatus: 'UNKNOWN',
      bonusItems: [{ type: 'ETHNIC_AREA_MINORITY', value: 20 }],
    })).toBe(0);
    expect(confirmedBonusPoints({ bonusPolicyStatus: null, bonusItems: [] })).toBe(0);
  });

  it('脏数据防御: 非数组/非对象/NaN 一律 0', () => {
    expect(confirmedBonusPoints({ bonusPolicyStatus: 'HAS_BONUS', bonusItems: 'oops' })).toBe(0);
    expect(confirmedBonusPoints({ bonusPolicyStatus: 'HAS_BONUS', bonusItems: [null, 'x', { value: 'NaN' }] })).toBe(0);
    expect(confirmedBonusPoints(null)).toBe(0);
  });
});
