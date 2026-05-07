// ethnicity.rule.ts
import { SoftRule, StudentContext, CandidateRow, SoftRuleResult } from '../soft-rule.interface';

const MIN_LANG_PATTERN = /(民语|加授民文)/;

export class EthnicityRule implements SoftRule {
  readonly name = 'ethnicity';

  check(student: StudentContext, candidate: CandidateRow): SoftRuleResult {
    const rt = candidate.recruitType || '';
    if (!MIN_LANG_PATTERN.test(rt)) return { pass: true };
    const eth = student.user.ethnicity;
    if (!eth) return { pass: true };
    if (eth !== '汉族') return { pass: true };
    return {
      pass: false,
      reason: {
        rule: 'ethnicity', expected: '少数民族', actual: '汉族',
        severity: 'SOFT_RESTRICTED', note: `${rt} 仅限少数民族考生`,
      },
    };
  }
}
