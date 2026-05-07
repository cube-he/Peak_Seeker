// household.rule.ts
import { SoftRule, StudentContext, CandidateRow, SoftRuleResult } from '../soft-rule.interface';

const RURAL_REQUIRED = /(国家专项|地方专项|高校专项|农村专项)/;

export class HouseholdRule implements SoftRule {
  readonly name = 'household';

  check(student: StudentContext, candidate: CandidateRow): SoftRuleResult {
    const rt = candidate.recruitType || '';
    if (!RURAL_REQUIRED.test(rt)) return { pass: true };
    if (student.isRural) return { pass: true };
    return {
      pass: false,
      reason: {
        rule: 'household.rural', expected: '农村户籍', actual: '非农村户籍',
        severity: 'SOFT_RESTRICTED', note: `${rt} 限农村户籍考生`,
      },
    };
  }
}
