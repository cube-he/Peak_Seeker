import api from './api';

export interface UniversityQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  province?: string;
  city?: string;
  type?: string;
  level?: string;
  nature?: string;
  grade?: string;
  isDoubleFirstClass?: boolean;
  is985?: boolean;
  is211?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const universityService = {
  getList: (params: UniversityQueryParams): Promise<any> => api.get('/universities', { params }) as any,
  getById: (id: number): Promise<any> => api.get(`/universities/${id}`) as any,
  getMajors: (id: number, year?: number): Promise<any> =>
    api.get(`/universities/${id}/majors`, { params: { year } }) as any,
  getAdmissions: (id: number): Promise<any> => api.get(`/universities/${id}/admissions`) as any,
  getHot: (limit?: number): Promise<any> => api.get('/universities/hot', { params: { limit } }) as any,
  getFilters: (): Promise<any> => api.get('/universities/filters') as any,
};
