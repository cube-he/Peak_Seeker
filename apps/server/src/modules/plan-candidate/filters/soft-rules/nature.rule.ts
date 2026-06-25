import { SoftRule, StudentContext, CandidateRow, SoftRuleResult } from '../soft-rule.interface';
import { isSinoForeignFromNotes } from '../../sino-foreign-filter';

export class NatureRule implements SoftRule {
  readonly name = 'nature';

  check(student: StudentContext, candidate: CandidateRow): SoftRuleResult {
    // 中外合作直接读专业备注判定(与候选展示/筛选同口径), 不读 is_sino_foreign 物化列。
    if (isSinoForeignFromNotes(candidate.planNotes) && student.acceptSinoForeign === false) {
      return {
        pass: false,
        reason: {
          rule: 'nature.sino_foreign', expected: '非中外合作', actual: '中外合作',
          severity: 'SOFT_PREFERENCE', note: '学生不接受中外合作办学',
        },
      };
    }
    const nature = candidate.university?.runningNature || '';
    if (nature.includes('民办') && student.acceptPrivate === 'STRICT') {
      return {
        pass: false,
        reason: {
          rule: 'nature.private', expected: '公办', actual: '民办',
          severity: 'SOFT_PREFERENCE', note: '学生明确拒绝民办院校',
        },
      };
    }
    return { pass: true };
  }
}
