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
  /** 招生考试报前言原文文案 */
  policyText?: string;
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
  /** 后端在当年线缺失时回退用 (examYear-1) 估算, 透出年份让前端加"按 N 年估"标注. */
  lineYearUsed?: number;
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

export interface StudentSummary {
  id: number;
  realName: string | null;
  examType: string | null;
  examYear: number | null;
  totalScore: number | null;
  provincialRank: number | null;
  firstChoice: string | null;
  reChoices: string[] | null;
  intakeReviewComment: string | null;
  /** 位次按往年一分一段估算 (后端 rankCheck.isEstimated). 前端给位次加"按 N 年估"小尾注. */
  rankEstimated?: boolean;
  rankSourceYear?: number;
}

export interface BatchRecommendationsResponse {
  batches: BatchRecommendation[];
  batchesConfirmedAt: string | null;
  /** 老师上次 confirm 时选定的批次列表 (DB 里的 preferredBatches), null 表示从未 confirm 过. */
  preferredBatches: string[] | null;
  intakeGap: IntakeDataGap;
  student: StudentSummary;
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
    const studentRaw = (await api.get(`/students/${studentId}`)) as unknown as Record<string, any>;
    const rankCheck = studentRaw?.rankCheck ?? null;
    const summary: StudentSummary = {
      id: studentRaw?.id ?? studentId,
      realName: studentRaw?.user?.realName ?? studentRaw?.realName ?? null,
      examType: studentRaw?.examType ?? null,
      examYear: studentRaw?.examYear ?? null,
      totalScore: studentRaw?.totalScore ?? null,
      provincialRank: studentRaw?.provincialRank ?? null,
      firstChoice: studentRaw?.firstChoice ?? null,
      reChoices: Array.isArray(studentRaw?.reChoices) ? studentRaw.reChoices : null,
      intakeReviewComment: studentRaw?.intakeReviewComment ?? null,
      rankEstimated: rankCheck?.isEstimated === true,
      rankSourceYear: typeof rankCheck?.sourceYear === 'number' ? rankCheck.sourceYear : undefined,
    };
    return {
      batches: eb.batches ?? [],
      intakeGap: eb.intakeGap ?? { ok: true, missing: [] },
      batchesConfirmedAt: studentRaw?.batchesConfirmedAt ?? null,
      preferredBatches: Array.isArray(studentRaw?.preferredBatches) ? studentRaw.preferredBatches : null,
      student: summary,
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
