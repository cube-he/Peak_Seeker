// gender.rule.ts
import { SoftRule, StudentContext, CandidateRow, SoftRuleResult } from '../soft-rule.interface';

const MALE_PATTERNS = [/仅限?男(生|性|考生)/, /只(招|录)男(生|性)/, /本专业仅限男/, /仅招收男/];
const FEMALE_PATTERNS = [/仅限?女(生|性|考生)/, /只(招|录)女(生|性)/, /本专业仅限女/, /仅招收女/];

function detect(text: string | null | undefined): '男' | '女' | null {
  if (!text) return null;
  if (MALE_PATTERNS.some((p) => p.test(text))) return '男';
  if (FEMALE_PATTERNS.some((p) => p.test(text))) return '女';
  return null;
}

export class GenderRule implements SoftRule {
  readonly name = 'gender';

  check(student: StudentContext, candidate: CandidateRow): SoftRuleResult {
    const studentGender = student.user.gender;
    if (!studentGender) return { pass: true };

    const text = `${candidate.major?.notes ?? ''}\n${candidate.planNotes ?? ''}`;
    const expected = detect(text);
    if (!expected) return { pass: true };
    if (expected === studentGender) return { pass: true };

    return {
      pass: false,
      reason: {
        rule: 'gender',
        expected,
        actual: studentGender,
        severity: 'SOFT_RESTRICTED',
        note: `该专业组限${expected}生`,
      },
    };
  }
}
