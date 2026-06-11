import api from './api';

export interface MajorQueryParams {
  page?: number;
  pageSize?: number;
  keyword?: string;
  category?: string;
  level?: string;
  discipline?: string;
  emerging?: boolean;        // 仅看新兴专业（2024 年起增设）
  electiveSubject?: string;  // 选考建议筛选
  sortBy?: string;           // 'salary' = 按平均薪资降序
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

  getUniversities(id: number, year?: number): Promise<any> {
    return api.get(`/majors/${id}/universities`, { params: { year } }) as any;
  },
};
