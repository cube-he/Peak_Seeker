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
