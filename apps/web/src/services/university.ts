import api from './api';
import type { ExamType } from './score-segment';

export interface RankedUniversity {
  rank: number;
  id: number;
  name: string;
  logoUrl: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  softRanking: number;
  /** 软科主榜体系标签（本科/民办/高职）；缺则显示无 list 的 fallback */
  softRankList: string | null;
  admissionMinRank: number | null;
  admissionMinScore: number | null;
}

export interface RankingBoard {
  key: string;
  title: string;
  groupKey: string;
  groupTitle: string;
  level: '本科' | '专科';
  items: RankedUniversity[];
}

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
  examType?: '物理' | '历史';
  tierFilter?: 'rush' | 'stable' | 'safe';
  userRank?: number;
}

export interface UniversityListItem {
  id: number;
  name: string;
  code: string | null;
  province: string | null;
  city: string | null;
  type: string | null;
  level: string | null;
  runningNature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  ranking: string | null;
  logoUrl: string | null;
  latestAdmission: { minScore: number; minRank: number | null } | null;
  predictedMinRank: number | null;
  softRanking: number | null;
  softRankList: string | null;
  softCategory: string | null;
  softCategoryRank: number | null;
  softRankYear: number | null;
}

export interface UniversityListResponse {
  data: UniversityListItem[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

export interface FilterOption {
  value: string;
  count: number;
}

export interface CityFilterOption extends FilterOption {
  province: string;
}

export interface UniversityFilters {
  provinces: FilterOption[];
  types: FilterOption[];
  levels: FilterOption[];
  cities: CityFilterOption[];
  grades: FilterOption[];
  natures: FilterOption[];
}

export interface CampusPoiQueryParams {
  category: 'subway' | 'mall' | 'airport';
  limit?: number;
}

/** 地图视图的查询参数(分页/排序 不需要,地图一次性返回全部匹配的点) */
export interface MapQueryParams {
  keyword?: string;
  province?: string;
  city?: string;
  type?: string;
  level?: string;
  grade?: string;
  nature?: string;
  is985?: boolean;
  is211?: boolean;
  isDoubleFirstClass?: boolean;
}

/** 地图视图的院校点 */
export interface MapUniversity {
  id: number;
  name: string;
  province: string | null;
  city: string | null;
  district: string | null;
  level: string | null;
  type: string | null;
  // 办学性质:公办 / 民办 / 中外合作办学 等(对应 DB runningNature)。
  // 用于地图 marker 边框色编码:民办 = 深红边,其他 = 白边
  nature: string | null;
  is985: boolean;
  is211: boolean;
  isDoubleFirstClass: boolean;
  lat: number;
  lng: number;
}

export const universityService = {
  getList: (params: UniversityQueryParams): Promise<UniversityListResponse> =>
    api.get('/universities', { params }),
  getById: (id: number, subject?: string): Promise<any> => api.get(`/universities/${id}`, { params: subject ? { subject } : undefined }) as any,
  getMajors: (id: number, year?: number): Promise<any> =>
    api.get(`/universities/${id}/majors`, { params: { year } }) as any,
  getAdmissions: (id: number): Promise<any> => api.get(`/universities/${id}/admissions`) as any,
  getHot: (limit?: number): Promise<any> => api.get('/universities/hot', { params: { limit } }) as any,
  getFilters: (): Promise<UniversityFilters> => api.get('/universities/filters'),
  getRankingBoard: (examType: ExamType): Promise<RankingBoard[]> =>
    api.get('/universities/ranking-board', { params: { examType } }) as any,
  getMap: (params: MapQueryParams): Promise<MapUniversity[]> =>
    api.get('/universities/map', { params }) as any,
  getCampusPois: (
    universityId: number,
    campusId: number,
    params: CampusPoiQueryParams,
  ): Promise<any> =>
    api.get(
      `/universities/${universityId}/campuses/${campusId}/pois`,
      { params },
    ) as any,
};
