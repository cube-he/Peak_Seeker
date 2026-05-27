import api from './api';

export interface GeneratePlanParams {
  batch: string;
  rushRatio?: number;
  stableRatio?: number;
  safeRatio?: number;
  examSource?: string;
}

export interface CreatePlanForStudentParams {
  batchConfigId: number;
  name?: string;
  notes?: string;
}

export interface CandidateListParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  includeSoftFails?: boolean;
}

export type CandidateGroupSort =
  | 'MAJOR_MATCH'
  | 'RANK_FIT'
  | 'MAJOR_MIN_SCORE_DESC'
  | 'UNIVERSITY_RANK'
  | 'MAJOR_STRENGTH'
  | 'PLAN_COUNT_DESC'
  | 'SUPPLEMENTARY_RATE_DESC'
  | 'SAFETY_DESC';

export interface CandidateGroupListParams extends CandidateListParams {
  sort?: CandidateGroupSort;
}

export interface TeacherPlanListParams {
  search?: string;
  batch?: string;
  status?: string;
  studentId?: string;
  page?: number;
  pageSize?: number;
}

export interface StudentPlanListParams {
  batchConfigId?: number;
  latest?: boolean;
}

export const planApi = {
  // Teacher endpoints
  getTeacherPlans(params?: TeacherPlanListParams): Promise<any> {
    return api.get('/plans/teacher', {
      params: {
        search: params?.search?.trim() || undefined,
        batch: params?.batch || undefined,
        status: params?.status || undefined,
        studentId: params?.studentId || undefined,
        page: params?.page,
        pageSize: params?.pageSize,
      },
    }) as any;
  },

  generate(studentId: string, params: GeneratePlanParams): Promise<any> {
    return api.post(`/plans/generate/${studentId}`, params) as any;
  },

  createForStudent(studentId: string, data: CreatePlanForStudentParams): Promise<any> {
    return api.post(`/students/${studentId}/plans`, data) as any;
  },

  listForStudent(studentId: string, params?: StudentPlanListParams): Promise<any> {
    return api.get(`/students/${studentId}/plans`, {
      params: {
        batchConfigId: params?.batchConfigId,
        latest: params?.latest,
      },
    }) as any;
  },

  getCandidates(planId: string | number, params?: CandidateListParams): Promise<any> {
    return api.get(`/plans/${planId}/candidates`, {
      params: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 30,
        keyword: params?.keyword?.trim() || undefined,
        includeSoftFails: params?.includeSoftFails,
      },
    }) as any;
  },

  getCandidateGroups(planId: string | number, params?: CandidateGroupListParams): Promise<any> {
    return api.get(`/plans/${planId}/candidate-groups`, {
      params: {
        page: params?.page ?? 1,
        pageSize: params?.pageSize ?? 20,
        keyword: params?.keyword?.trim() || undefined,
        includeSoftFails: params?.includeSoftFails,
        sort: params?.sort ?? 'MAJOR_MATCH',
      },
    }) as any;
  },

  getById(id: string): Promise<any> {
    return api.get(`/plans/${id}`) as any;
  },

  addItem(planId: string | number, data: Record<string, unknown>): Promise<any> {
    return api.post(`/plans/${planId}/items`, data) as any;
  },

  updateItem(planId: string | number, itemId: string | number, data: Record<string, unknown>): Promise<any> {
    return api.patch(`/plans/${planId}/items/${itemId}`, data) as any;
  },

  updatePlan(id: string, data: Record<string, unknown>): Promise<any> {
    return api.put(`/plans/${id}`, data) as any;
  },

  deletePlan(id: string | number): Promise<any> {
    return api.delete(`/plans/${id}`) as any;
  },

  deleteItem(planId: string, itemId: number): Promise<any> {
    return api.delete(`/plans/${planId}/items/${itemId}`) as any;
  },

  submitForReview(id: string): Promise<any> {
    return api.post(`/plans/${id}/submit-review`) as any;
  },

  startReview(id: string): Promise<any> {
    return api.post(`/plans/${id}/start-review`) as any;
  },

  reviewPlan(id: string, data: { action: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGE' | 'COMMENT'; comment?: string; itemAnnotations?: Array<{ sequence: number; annotation: string }> }): Promise<any> {
    return api.post(`/plans/${id}/review`, data) as any;
  },

  // 获取当前用户对该方案的审核草稿，返回 null 表示未保存过草稿
  // NOTE: api.ts response interceptor already returns response.data; do NOT
  // re-access .data on the awaited value — that yields undefined.
  async getReviewDraft(planId: number | string): Promise<null | {
    id: number;
    planId: number;
    reviewerId: number;
    comment: string | null;
    itemAnnotations: { sequence: number; annotation: string }[] | null;
    updatedAt: string;
  }> {
    return (await api.get(`/plans/${planId}/review-draft`)) as any;
  },

  async upsertReviewDraft(
    planId: number | string,
    payload: {
      comment?: string;
      itemAnnotations?: { sequence: number; annotation: string }[];
    },
  ): Promise<any> {
    return await api.put(`/plans/${planId}/review-draft`, payload);
  },

  async deleteReviewDraft(planId: number | string): Promise<{ ok: true }> {
    return (await api.delete(`/plans/${planId}/review-draft`)) as unknown as { ok: true };
  },

  async getVersions(planId: number | string) {
    return (await api.get(`/plans/${planId}/versions`)) as unknown as {
      current: number;
      versions: Array<{
        id: number;
        versionNo: number;
        versionNote: string | null;
        status: string;
        parentVersionId: number | null;
        createdAt: string;
        updatedAt: string;
        name: string;
        isFinal: boolean;
      }>;
    };
  },

  approvePlan(id: string, comment?: string): Promise<any> {
    return api.post(`/plans/${id}/review`, { action: 'APPROVE', comment }) as any;
  },

  finalizePlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/finalize`) as any;
  },

  exportPlan(id: string): Promise<any> {
    return api.get(`/plans/${id}/export.pdf`, { responseType: 'blob' }) as any;
  },

  async exportPdf(planId: number | string) {
    // interceptor returns response.data, which IS the Blob for blob responseType.
    return (await api.get(`/plans/${planId}/export.pdf`, {
      responseType: 'blob',
    })) as unknown as Blob;
  },

  async getRisks(planId: number | string) {
    return (await api.get(`/plans/${planId}/risks`)) as unknown as Array<{
      id: number;
      planItemId: number;
      ruleCode: string;
      severity: 'critical' | 'moderate' | 'minor';
      category: string;
      message: string;
      detail: any;
      resolvedAt: string | null;
      resolution: string | null;
      planItem: { sequence: number; universityName: string; majorName: string };
    }>;
  },

  async recomputeRisks(planId: number | string) {
    return await api.post(`/plans/${planId}/risks/recompute`);
  },

  async resolveRisk(riskId: number, resolution: 'accepted' | 'replaced' | 'ignored', note?: string) {
    return await api.post(`/plans/risks/${riskId}/resolve`, { resolution, note });
  },

  // Student endpoints
  getMyPlans(): Promise<any> {
    return api.get('/plans/mine') as any;
  },

  confirmPlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/parent-confirm`) as any;
  },

  requestChange(id: string, comment: string): Promise<any> {
    return api.post(`/plans/${id}/parent-request-change`, { comment }) as any;
  },
};
