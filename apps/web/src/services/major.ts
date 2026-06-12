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
  sortBy?: string;           // 'salary' 薪资 / 'popularity' 热度 / 'plan' 在川计划人数
  subjectLane?: string;      // '物理'|'历史': 只看该科类在川有计划的专业（学生模式）
  batch?: string;            // 在某批次有招生计划
  recruitType?: string;      // 特殊招生形式（公费师范/订单定向/民族班…）
  hasSupplementary?: boolean; // 仅看有征集志愿的专业（没录满, 捡漏）
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

  /** 专业排行榜: 考公/热度/分数/计划/征集/薪酬/就业/满意度; 默认在川有招生范围 */
  getRankings(params: {
    board?: string;
    sub?: string;
    examType?: string;
    scope?: string;
    limit?: number;
  } = {}): Promise<any> {
    return api.get('/majors/rankings', { params }) as any;
  },
};
