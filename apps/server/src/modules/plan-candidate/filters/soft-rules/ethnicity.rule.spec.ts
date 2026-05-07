// ethnicity.rule.spec.ts
import { EthnicityRule } from './ethnicity.rule';

const rule = new EthnicityRule();

describe('EthnicityRule', () => {
  it('彝族学生 + 民语班 → 通过', () => {
    const s = { user: { ethnicity: '彝族' } } as any;
    const c = { recruitType: '民语彝文一类' } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });

  it('汉族学生 + 民语班 → 软不符合', () => {
    const s = { user: { ethnicity: '汉族' } } as any;
    const c = { recruitType: '民语彝文一类' } as any;
    const r = rule.check(s, c);
    expect(r.pass).toBe(false);
    expect(r.reason?.rule).toBe('ethnicity');
  });

  it('未填民族 + 民语班 → 通过', () => {
    const s = { user: { ethnicity: null } } as any;
    const c = { recruitType: '民语彝文一类' } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });

  it('普通批 → 通过', () => {
    const s = { user: { ethnicity: '汉族' } } as any;
    const c = { recruitType: '普通类' } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });
});
