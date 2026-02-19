// 推荐相关类型
export interface RecommendRequest {
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
  useAI?: boolean;
}

export interface RecommendItem {
  order: number;
  strategy: 'rush' | 'stable' | 'safe';
  university: {
    id: number;
    name: string;
    province: string | null;
    city: string | null;
    type: string | null;
    tags: string[];
    isDoubleFirstClass: boolean;
    is985: boolean;
    is211: boolean;
  };
  major: {
    id: number;
    name: string;
    category: string | null;
  };
  admission: {
    year: number;
    minScore: number | null;
    minRank: number | null;
    planCount: number | null;
  };
  prediction: {
    acceptRate: number;
    rankDiff: number;
    riskLevel: 'high' | 'medium' | 'low';
  };
}

export interface RecommendResponse {
  items: RecommendItem[];
  statistics: {
    totalCount: number;
    rushCount: number;
    stableCount: number;
    safeCount: number;
    avgAcceptRate: number;
  };
  aiAnalysis?: {
    summary: string;
    suggestions: string[];
    risks: string[];
    score: number;
  };
}
