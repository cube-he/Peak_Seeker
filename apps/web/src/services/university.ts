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
  isDoubleFirstClass?: boolean;
  is985?: boolean;
  is211?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export const universityService = {
  getList: (params: UniversityQueryParams) => api.get('/universities', { params }),
  getById: (id: number) => api.get(`/universities/${id}`),
  getMajors: (id: number, year?: number) =>
    api.get(`/universities/${id}/majors`, { params: { year } }),
  getAdmissions: (id: number) => api.get(`/universities/${id}/admissions`),
  getHot: (limit?: number) => api.get('/universities/hot', { params: { limit } }),
  getFilters: () => api.get('/universities/filters'),
};
