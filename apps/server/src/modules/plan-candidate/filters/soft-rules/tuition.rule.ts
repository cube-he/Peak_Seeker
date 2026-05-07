import { SoftRule, StudentContext, CandidateRow, SoftRuleResult } from '../soft-rule.interface';

const BUDGET_CAP: Record<string, number> = {
  LOW: 6000, MEDIUM: 15000, HIGH: 40000, UNLIMITED: Number.POSITIVE_INFINITY,
};

export class TuitionRule implements SoftRule {
  readonly name = 'tuition';

  check(student: StudentContext, candidate: CandidateRow): SoftRuleResult {
    const budget = student.tuitionBudget;
    if (!budget) return { pass: true };
    const cap = BUDGET_CAP[budget];
    const tuition = candidate.tuition ?? 0;
    if (tuition <= cap) return { pass: true };
    return {
      pass: false,
      reason: {
        rule: 'tuition', expected: `≤${cap}`, actual: tuition,
        severity: 'SOFT_PREFERENCE', note: `学费 ${tuition} 超出 ${budget} 预算 ${cap}`,
      },
    };
  }
}
