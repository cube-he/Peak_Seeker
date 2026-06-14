import {
  groupHasSinoForeign,
  matchSinoForeign,
  filterGroupsBySinoForeign,
  filterUniversitiesBySinoForeign,
} from './sino-foreign-filter';

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
