import api from './api';

export interface CreatePlanDto {
  name: string;
  year: number;
  province?: string;
  items: any[];
  strategy?: string;
  notes?: string;
}

export interface UpdatePlanDto {
  name?: string;
  items?: any[];
  strategy?: string;
  notes?: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'ARCHIVED';
  isFavorite?: boolean;
}

export const planService = {
  getList(): Promise<any> {
    return api.get('/plans') as any;
  },

  getById(id: number): Promise<any> {
    return api.get(`/plans/${id}`) as any;
  },

  create(data: CreatePlanDto): Promise<any> {
    return api.post('/plans', data) as any;
  },

  update(id: number, data: UpdatePlanDto): Promise<any> {
    return api.put(`/plans/${id}`, data) as any;
  },

  delete(id: number): Promise<any> {
    return api.delete(`/plans/${id}`) as any;
  },

  toggleFavorite(id: number): Promise<any> {
    return api.post(`/plans/${id}/favorite`) as any;
  },
};
