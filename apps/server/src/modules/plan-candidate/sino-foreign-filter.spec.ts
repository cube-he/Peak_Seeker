import {
  groupHasSinoForeign,
  matchSinoForeign,
  filterGroupsBySinoForeign,
  filterUniversitiesBySinoForeign,
  isSinoForeignFromNotes,
} from './sino-foreign-filter';

describe('isSinoForeignFromNotes: 直接读专业备注判定中外合作', () => {
  it('备注含(中外合作办学) → true', () => {
    expect(isSinoForeignFromNotes('(中外合作办学)(与英国雷丁大学合作办学)')).toBe(true);
  });
  it('普通专业声明"不含中外合作办学" → false(不误判)', () => {
    expect(
      isSinoForeignFromNotes('(录取分数线不低于我校普通类本科所在批次相应科类(不含中外合作办学)提档线下40分)(民族班)'),
    ).toBe(false);
  });
  it('"中外合作办学，/,专业除外" → false', () => {
    expect(isSinoForeignFromNotes('(中外合作办学，专业除外)')).toBe(false);
    expect(isSinoForeignFromNotes('(中外合作办学,专业除外)')).toBe(false);
  });
  it('不含"中外合作"四字 / 空备注 → false', () => {
    expect(isSinoForeignFromNotes('(中外人文交流计划)')).toBe(false);
    expect(isSinoForeignFromNotes(null)).toBe(false);
    expect(isSinoForeignFromNotes(undefined)).toBe(false);
  });
});

const g = (majors: Array<{ isSinoForeign?: boolean }>) => ({ majors });

describe('groupHasSinoForeign', () => {
  it('组内任一专业 isSinoForeign → true', () => {
    expect(groupHasSinoForeign(g([{ isSinoForeign: false }, { isSinoForeign: true }]))).toBe(true);
  });
  it('组内无中外 → false', () => {
    expect(groupHasSinoForeign(g([{ isSinoForeign: false }]))).toBe(false);
  });
  it('空 majors / 缺字段 / null → false', () => {
    expect(groupHasSinoForeign(g([]))).toBe(false);
    expect(groupHasSinoForeign({} as any)).toBe(false);
    expect(groupHasSinoForeign(null as any)).toBe(false);
  });
});

describe('matchSinoForeign', () => {
  it('only: 有中外才通过', () => {
    expect(matchSinoForeign(true, 'only')).toBe(true);
    expect(matchSinoForeign(false, 'only')).toBe(false);
  });
  it('exclude: 没中外才通过', () => {
    expect(matchSinoForeign(true, 'exclude')).toBe(false);
    expect(matchSinoForeign(false, 'exclude')).toBe(true);
  });
  it('空 mode → 全通过', () => {
    expect(matchSinoForeign(true)).toBe(true);
    expect(matchSinoForeign(false, null)).toBe(true);
  });
});

describe('filterGroupsBySinoForeign', () => {
  const groups = [g([{ isSinoForeign: true }]), g([{ isSinoForeign: false }])];
  it('only → 只留含中外的组', () => {
    expect(filterGroupsBySinoForeign(groups, 'only')).toEqual([groups[0]]);
  });
  it('exclude → 去掉含中外的组', () => {
    expect(filterGroupsBySinoForeign(groups, 'exclude')).toEqual([groups[1]]);
  });
  it('空 mode → 原样返回(同引用)', () => {
    expect(filterGroupsBySinoForeign(groups)).toBe(groups);
  });
});

describe('filterUniversitiesBySinoForeign', () => {
  const u = (groups: any[]) => ({ groups });
  const unis = [u([g([{ isSinoForeign: true }])]), u([g([{ isSinoForeign: false }])])];
  it('only → 只留校内有中外组的院校', () => {
    expect(filterUniversitiesBySinoForeign(unis, 'only')).toEqual([unis[0]]);
  });
  it('exclude → 去掉校内有中外组的院校', () => {
    expect(filterUniversitiesBySinoForeign(unis, 'exclude')).toEqual([unis[1]]);
  });
  it('空 mode → 原样返回(同引用)', () => {
    expect(filterUniversitiesBySinoForeign(unis)).toBe(unis);
  });
});
