import api from './api';

export interface RecommendPlanParams {
  score: number;
  rank: number;
  province: string;
  subjects?: string[];
  preferences?: {
    provinces?: string[];
    cities?: string[];
    universityTypes?: string[];
    majorCategories?: string[];
    excludeProvinces?: string[];
    excludeMajors?: string[];
  };
  strategy?: {
    rushCount?: number;
    stableCount?: number;
    safeCount?: number;
    rushRange?: number;
    safeRange?: number;
  };
}

export const recommendService = {
  generatePlan: (params: RecommendPlanParams) => api.post('/recommend/plan', params),
  recommendUniversities: (params: {
    score: number;
    rank: number;
    province: string;
    limit?: number;
  }) => api.post('/recommend/universities', params),
};
