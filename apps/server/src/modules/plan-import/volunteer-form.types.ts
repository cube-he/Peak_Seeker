export interface ParsedMajor { code: string; name: string; }
export interface ParsedVolunteer {
  seq: number;
  schoolCode: string;
  schoolName: string;
  groupCode: string;
  majors: ParsedMajor[];
  acceptAdjust: boolean;
}
export interface ParsedIdentity {
  name: string;
  examNumber?: string;
  classInfo?: string;
  idMasked?: string;
}
export interface ParsedForm {
  identity: ParsedIdentity;
  batch: string;
  volunteers: ParsedVolunteer[];
}
export interface ResolvedSelectedMajor {
  order: number;
  enrollmentPlanId: number;
  majorId: number;
  majorName: string;
  majorCode: string | null;
}
export type GroupStatus = 'matched' | 'unmatched';
export interface ResolvedGroup {
  seq: number;
  schoolCode: string;
  schoolName: string;
  groupCode: string;
  status: GroupStatus;
  anchorEnrollmentPlanId?: number;
  selectedMajors: ResolvedSelectedMajor[];
  acceptAdjust: boolean;
  unmatchedReason?: string;
  note?: string;
}
export interface ResolveSummary { total: number; matched: number; unmatched: number; }
export interface ResolveResult { groups: ResolvedGroup[]; summary: ResolveSummary; }
