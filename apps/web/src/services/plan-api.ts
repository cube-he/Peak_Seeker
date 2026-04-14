import api from './api';

export interface GeneratePlanParams {
  batch: string;
  rushRatio?: number;
  stableRatio?: number;
  safeRatio?: number;
  examSource?: string;
}

export interface TeacherPlanListParams {
  search?: string;
  batch?: string;
  status?: string;
  studentId?: string;
  page?: number;
  pageSize?: number;
}

export const planApi = {
  // Teacher endpoints
  getTeacherPlans(params?: TeacherPlanListParams): Promise<any> {
    return api.get('/plans/teacher', { params }) as any;
  },

  generate(studentId: string, params: GeneratePlanParams): Promise<any> {
    return api.post(`/plans/generate/${studentId}`, params) as any;
  },

  getById(id: string): Promise<any> {
    return api.get(`/plans/${id}`) as any;
  },

  updatePlan(id: string, data: Record<string, unknown>): Promise<any> {
    return api.put(`/plans/${id}`, data) as any;
  },

  deleteItem(planId: string, itemId: number): Promise<any> {
    return api.delete(`/plans/${planId}/items/${itemId}`) as any;
  },

  submitForReview(id: string): Promise<any> {
    return api.post(`/plans/${id}/submit`) as any;
  },

  approvePlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/approve`) as any;
  },

  finalizePlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/finalize`) as any;
  },

  exportPlan(id: string): Promise<any> {
    return api.get(`/plans/${id}/export`, { responseType: 'blob' }) as any;
  },

  // Student endpoints
  getMyPlans(): Promise<any> {
    return api.get('/plans/mine') as any;
  },

  confirmPlan(id: string): Promise<any> {
    return api.post(`/plans/${id}/confirm`) as any;
  },
};
