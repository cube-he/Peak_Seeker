import api from './api';

export interface PreviewIdentity {
  name?: string;
  examNumber?: string;
  idMasked?: string;
  classInfo?: string;
}

export interface PreviewCandidateStudent {
  id: number;
  realName?: string;
  classInfo?: string | null;
}

export interface PreviewSelectedMajor {
  order: number;
  enrollmentPlanId: number;
  majorId: number;
  majorName: string;
  majorCode: string | null;
}

export interface PreviewGroup {
  seq: number;
  schoolCode: string;
  schoolName: string;
  groupCode: string;
  status: 'matched' | 'unmatched';
  anchorEnrollmentPlanId?: number;
  selectedMajors: PreviewSelectedMajor[];
  acceptAdjust: boolean;
  unmatchedReason?: string;
  note?: string;
}

export interface PreviewResponse {
  identity: PreviewIdentity;
  batch: string;
  examTypeHint: 'PHYSICS' | 'HISTORY';
  batchConfig: { id: number; batch: string } | null;
  candidateStudents: PreviewCandidateStudent[];
  groups: PreviewGroup[];
  summary: { total: number; matched: number; unmatched: number };
}

export interface CommitResponse {
  planId: number;
  versionNo: number;
  importedCount: number;
  failures: Array<{ seq: number; reason: string }>;
}

export const planImportApi = {
  // 注意: api.ts 的 response 拦截器已经把 axios response 脱壳为 response.data,
  // 这里直接 return 即可, 不要再 .then(r => r.data) (否则 r 是 undefined)。
  preview(file: File, studentId?: number): Promise<PreviewResponse> {
    const fd = new FormData();
    fd.append('file', file);
    if (studentId) fd.append('studentId', String(studentId));
    return api.post('/plan-import/volunteer-form/preview', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as unknown as Promise<PreviewResponse>;
  },
  commit(payload: {
    studentId: number;
    batchConfigId: number;
    resolvedGroups: PreviewGroup[];
    versionNote?: string;
  }): Promise<CommitResponse> {
    return api.post('/plan-import/volunteer-form/commit', payload) as unknown as Promise<CommitResponse>;
  },
};
