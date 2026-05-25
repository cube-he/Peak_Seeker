import api from './api';

/** 首页统计数据 —— 对应后端 GET /stats/homepage 返回结构 */
export interface HomepageStats {
  /** 在川招生院校数 */
  universityCount: number;
  /** 录取记录总数 */
  admissionRecordCount: number;
  /** 招生专业数 */
  majorCount: number;
  /** 数据年份跨度(distinct year 个数) */
  dataYearSpan: number;
}

export const statsApi = {
  getHomepageStats(): Promise<HomepageStats> {
    return api.get('/stats/homepage');
  },
};
