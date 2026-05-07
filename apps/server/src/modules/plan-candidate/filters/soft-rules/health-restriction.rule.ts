// health-restriction.rule.ts
import { SoftRule, StudentContext, CandidateRow, SoftRuleResult } from '../soft-rule.interface';
import { HealthRestriction } from '@prisma/client';

export class HealthRestrictionRule implements SoftRule {
  readonly name = 'health';

  constructor(private restrictions: HealthRestriction[]) {}

  check(student: StudentContext, candidate: CandidateRow): SoftRuleResult {
    const majorCode = candidate.majorCode || candidate.major?.code || '';
    const matched = this.restrictions.filter(
      (r) => r.majorCode && majorCode.startsWith(r.majorCode),
    );

    for (const r of matched) {
      if (r.conditionCode === 'COLOR_BLIND' && student.colorBlind) {
        return {
          pass: false,
          reason: {
            rule: 'health.color', expected: '非色盲', actual: '色盲',
            severity: 'SOFT_RESTRICTED', note: `${r.conditionName}：${r.restrictionType}`,
          },
        };
      }
      if (r.conditionCode === 'VISION_LOW') {
        const left = Number(student.visionLeft ?? 5);
        const right = Number(student.visionRight ?? 5);
        if (Math.min(left, right) < 4.8) {
          return {
            pass: false,
            reason: {
              rule: 'health.vision', expected: '裸眼视力≥4.8', actual: `${Math.min(left, right)}`,
              severity: 'SOFT_RESTRICTED', note: r.conditionName,
            },
          };
        }
      }
    }
    return { pass: true };
  }
}
