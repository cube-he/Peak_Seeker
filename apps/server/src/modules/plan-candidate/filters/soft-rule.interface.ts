// soft-rule.interface.ts
import { StudentProfile, User, EnrollmentPlan, University, Major } from '@prisma/client';

export type CandidateRow = EnrollmentPlan & {
  university: University;
  major: Major;
};

export type StudentContext = StudentProfile & { user: User };

export type SoftRuleSeverity = 'SOFT_RESTRICTED' | 'SOFT_PREFERENCE';

export interface SoftFailReason {
  rule: string;
  expected?: string | number | null;
  actual?: string | number | null;
  severity: SoftRuleSeverity;
  note: string;
}

export interface SoftRuleResult {
  pass: boolean;
  reason?: SoftFailReason;
}

export interface SoftRule {
  readonly name: string;
  check(student: StudentContext, candidate: CandidateRow): SoftRuleResult;
}
