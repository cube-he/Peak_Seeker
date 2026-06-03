import api from './api';

export type Verdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'DATA_PENDING';

export interface ReferenceItem {
  title: string;
  filename: string | null;
  type: 'pdf' | 'xlsx' | 'announcement';
  downloadUrl: string | null;
  available: boolean;
  sourceNote?: string;
}

export interface SubsetResult {
  code: string;
  name: string;
  description: string;
  verdict: Verdict;
  rulesEval: Array<{
    ruleCode: string;
    requirement: string;
    actual: string;
    pass: 'PASS' | 'FAIL' | 'UNCERTAIN' | 'SOFT_HINT';
  }>;
  references: ReferenceItem[];
}

export interface BatchRecommendation {
  batchConfigId: number;
  batchName: string;
  volunteerMode: string;
  admissionOrder: number;
  verdict: Verdict;
  reasons: Array<{ type: string; message: string }>;
  subsetResults?: SubsetResult[];
}

export interface BatchRecommendationsResponse {
  batches: BatchRecommendation[];
  batchesConfirmedAt: string | null;
}

// axios 响应拦截器 (services/api.ts) 已 unwrap 成 response.data,
// 故 api.get<T> 实际返回 T (而非 AxiosResponse<T>). TS 签名仍是
// AxiosResponse<T>, 所以保持 `as any` 与现有 service 一致.
export const batchRecommendationsApi = {
  async fetch(studentId: number): Promise<BatchRecommendationsResponse> {
    // 复用现有 eligible-batches 端点 + 学生 lock 状态
    const batches = (await api.get<BatchRecommendation[]>(
      `/students/${studentId}/eligible-batches`,
    )) as unknown as BatchRecommendation[];
    const student = (await api.get<{ batchesConfirmedAt: string | null }>(
      `/students/${studentId}`,
    )) as unknown as { batchesConfirmedAt: string | null };
    return {
      batches,
      batchesConfirmedAt: student.batchesConfirmedAt,
    };
  },

  async confirm(
    studentId: number,
    preferredBatches: string[],
    reviewComment?: string,
  ): Promise<void> {
    await api.post(`/students/${studentId}/confirm-batches`, {
      preferredBatches,
      reviewComment,
    });
  },

  async unlock(studentId: number): Promise<void> {
    await api.post(`/students/${studentId}/unlock-batches`, {});
  },
};
