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

  getById(id: string): Promise<any> {
    return api.get(`/plans/${id}`) as any;
  },

  addItem(planId: string | number, data: Record<string, unknown>): Promise<any> {
    return api.post(`/plans/${planId}/items`, data) as any;
  },

  updatePlan(id: string, data: Record<string, unknown>): Promise<any> {
    return api.put(`/plans/${id}`, data) as any;
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

  approvePlan(id: string, comment?: string): Promise<any> {
    return api.post(`/plans/${id}/review`, { action: 'APPROVE', comment }) as any;
  },

  finalizePlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/finalize`) as any;
  },

  exportPlan(id: string): Promise<any> {
    return api.get(`/plans/${id}/export.pdf`, { responseType: 'blob' }) as any;
  },

  // Student endpoints
  getMyPlans(): Promise<any> {
    return api.get('/plans/mine') as any;
  },

  confirmPlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/student-confirm`) as any;
  },

  requestChange(id: string, comment: string): Promise<any> {
    return api.post(`/plans/${id}/student-request-change`, { comment }) as any;
  },
};
