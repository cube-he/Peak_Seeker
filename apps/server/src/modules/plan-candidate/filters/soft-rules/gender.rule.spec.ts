// gender.rule.spec.ts
import { GenderRule } from './gender.rule';

const rule = new GenderRule();
const female = { user: { gender: '女' } } as any;
const male = { user: { gender: '男' } } as any;
const noGender = { user: { gender: null } } as any;

const candWithMaleOnly = { major: { notes: '本专业仅限男生报考' }, planNotes: null } as any;
const candWithFemaleOnly = { major: { notes: null }, planNotes: '仅招收女生' } as any;
const candNoRestrict = { major: { notes: null }, planNotes: null } as any;

describe('GenderRule', () => {
  it('女生 + 仅限男生 → 软不符合', () => {
    const r = rule.check(female, candWithMaleOnly);
    expect(r.pass).toBe(false);
    expect(r.reason?.rule).toBe('gender');
    expect(r.reason?.expected).toBe('男');
    expect(r.reason?.actual).toBe('女');
  });

  it('男生 + 仅限女生 → 软不符合', () => {
    const r = rule.check(male, candWithFemaleOnly);
    expect(r.pass).toBe(false);
    expect(r.reason?.expected).toBe('女');
  });

  it('男生 + 仅限男生 → 通过', () => {
    expect(rule.check(male, candWithMaleOnly).pass).toBe(true);
  });

  it('无限制 → 通过', () => {
    expect(rule.check(female, candNoRestrict).pass).toBe(true);
  });

  it('学生未填性别 → 通过（无法判断不算软不符合）', () => {
    expect(rule.check(noGender, candWithMaleOnly).pass).toBe(true);
  });
});
