import { STUDENT_NAV_ITEMS, isStudentNavActive } from '../studentNav';

describe('studentNav', () => {
  it('marks exact route matches as active', () => {
    expect(isStudentNavActive('/student/profile', '/student/profile')).toBe(true);
  });

  it('marks nested route matches as active', () => {
    expect(isStudentNavActive('/student/plans/12', '/student/plans')).toBe(true);
  });

  it('does not match sibling routes with the same prefix', () => {
    expect(isStudentNavActive('/student/plans-extra', '/student/plans')).toBe(false);
  });

  it('keeps the expected student navigation order', () => {
    expect(STUDENT_NAV_ITEMS.map((item) => item.key)).toEqual([
      'dashboard',
      'plans',
      'recommend',
      'universities',
      'profile',
    ]);
  });
});
