import api from './api';

export type Verdict = 'ELIGIBLE' | 'CONDITIONAL' | 'INELIGIBLE' | 'DATA_PENDING';

export interface ReferenceItem {
  title: string;
  filename: string | null;
  type: 'pdf' | 'xlsx' | 'doc' | 'announcement';
  downloadUrl: string | null;
  available: boolean;
  sourceNote?: string;
  /** true: 外站资源 (官网公告), 只显示"查看"按钮; false/undefined: 本地文件 显示"预览"+"下载" */
  external?: boolean;
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

export interface ScoreInfo {
  studentScore: number | null;
  lineScore: number | null;
  lineType: 'BATCH_LINE' | 'SPECIAL_LINE' | 'ZHUANKE_LINE';
  lineMissing: boolean;
  gap: number | null;
  passesLine: boolean | null;
  leniency?: number;
  withinLeniency: boolean | null;
}

export interface BatchRecommendation {
  batchConfigId: number;
  batchName: string;
  volunteerMode: string;
  admissionOrder: number;
  verdict: Verdict;
  reasons: Array<{ type: string; message: string }>;
  subsetResults?: SubsetResult[];
  scoreInfo?: ScoreInfo;
}

export interface IntakeDataGap {
  ok: boolean;
  missing: Array<{ field: string; label: string }>;
}

export interface BatchRecommendationsResponse {
  batches: BatchRecommendation[];
  batchesConfirmedAt: string | null;
  /** 老师上次 confirm 时选定的批次列表 (DB 里的 preferredBatches), null 表示从未 confirm 过. */
  preferredBatches: string[] | null;
  intakeGap: IntakeDataGap;
}

// axios 响应拦截器 (services/api.ts) 已 unwrap 成 response.data,
// 故 api.get<T> 实际返回 T (而非 AxiosResponse<T>). TS 签名仍是
// AxiosResponse<T>, 所以保持 `as any` 与现有 service 一致.
export const batchRecommendationsApi = {
  async fetch(studentId: number): Promise<BatchRecommendationsResponse> {
    // 服务端 eligible-batches 现在返回 { batches, intakeGap }
    // 兼容旧返回 (数组): Array.isArray 检查后 fallback
    const raw = (await api.get(`/students/${studentId}/eligible-batches`)) as unknown;
    const eb: { batches: BatchRecommendation[]; intakeGap: IntakeDataGap } = Array.isArray(raw)
      ? { batches: raw as BatchRecommendation[], intakeGap: { ok: true, missing: [] } }
      : (raw as { batches: BatchRecommendation[]; intakeGap: IntakeDataGap });
    const student = (await api.get<{
      batchesConfirmedAt: string | null;
      preferredBatches: string[] | null;
    }>(`/students/${studentId}`)) as unknown as {
      batchesConfirmedAt: string | null;
      preferredBatches: string[] | null;
    };
    return {
      batches: eb.batches ?? [],
      intakeGap: eb.intakeGap ?? { ok: true, missing: [] },
      batchesConfirmedAt: student?.batchesConfirmedAt ?? null,
      preferredBatches: Array.isArray(student?.preferredBatches) ? student.preferredBatches : null,
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
