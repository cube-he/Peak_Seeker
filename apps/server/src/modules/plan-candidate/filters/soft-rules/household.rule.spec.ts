// household.rule.spec.ts
import { HouseholdRule } from './household.rule';

const rule = new HouseholdRule();

describe('HouseholdRule', () => {
  it('农村学生 + 国家专项 → 通过', () => {
    const s = { isRural: true } as any;
    const c = { recruitType: '国家专项计划' } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });

  it('非农村学生 + 国家专项 → 软不符合', () => {
    const s = { isRural: false } as any;
    const c = { recruitType: '国家专项计划' } as any;
    const r = rule.check(s, c);
    expect(r.pass).toBe(false);
    expect(r.reason?.rule).toBe('household.rural');
  });

  it('普通学生 + 普通批 → 通过', () => {
    const s = { isRural: false } as any;
    const c = { recruitType: '普通类' } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });

  it('农村学生 + 地方专项 → 通过', () => {
    const s = { isRural: true } as any;
    const c = { recruitType: '地方专项计划' } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });
});
