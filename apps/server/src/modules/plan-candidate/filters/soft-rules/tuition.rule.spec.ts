import { TuitionRule } from './tuition.rule';

const rule = new TuitionRule();
const BUDGET_MAP: Record<string, number> = { LOW: 6000, MEDIUM: 15000, HIGH: 40000, UNLIMITED: Infinity };

describe('TuitionRule', () => {
  it('LOW 预算 + 学费 8000 → 软不符合', () => {
    const s = { tuitionBudget: 'LOW' } as any;
    const c = { tuition: 8000 } as any;
    const r = rule.check(s, c);
    expect(r.pass).toBe(false);
    expect(r.reason?.rule).toBe('tuition');
  });

  it('MEDIUM 预算 + 学费 12000 → 通过', () => {
    const s = { tuitionBudget: 'MEDIUM' } as any;
    const c = { tuition: 12000 } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });

  it('UNLIMITED 预算 → 永远通过', () => {
    const s = { tuitionBudget: 'UNLIMITED' } as any;
    const c = { tuition: 80000 } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });

  it('预算未填 → 通过（不评估）', () => {
    const s = { tuitionBudget: null } as any;
    const c = { tuition: 80000 } as any;
    expect(rule.check(s, c).pass).toBe(true);
  });
});
