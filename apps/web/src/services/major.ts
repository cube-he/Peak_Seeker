import api from './api';

export interface MajorQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  level?: string;
  discipline?: string;
}

export const majorService = {
  getList(params: MajorQueryParams = {}): Promise<any> {
    return api.get('/majors', { params }) as any;
  },

  getById(id: number): Promise<any> {
    return api.get(`/majors/${id}`) as any;
  },

  getCategories(): Promise<any> {
    return api.get('/majors/categories') as any;
  },

  getHot(limit = 10): Promise<any> {
    return api.get('/majors/hot', { params: { limit } }) as any;
  },

  getUniversities(id: number, year?: number): Promise<any> {
    return api.get(`/majors/${id}/universities`, { params: { year } }) as any;
  },
};
