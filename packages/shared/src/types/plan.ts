// 志愿方案相关类型
export enum PlanStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  ARCHIVED = 'ARCHIVED',
}

export type Strategy = 'rush' | 'stable' | 'safe';

export interface PlanItem {
  order: number;
  universityId: number;
  universityName: string;
  majorId: number;
  majorName: string;
  strategy: Strategy;
  admission?: {
    year: number;
    minScore: number | null;
    minRank: number | null;
    planCount: number | null;
  };
  prediction?: {
    acceptRate: number;
    rankDiff: number;
    riskLevel: 'high' | 'medium' | 'low';
  };
}

export interface VolunteerPlan {
  id: number;
  userId: number;
  name: string;
  year: number;
  province: string | null;
  items: PlanItem[];
  strategy: string | null;
  status: PlanStatus;
  isFavorite: boolean;
  aiScore: number | null;
  aiAnalysis: AIAnalysis | null;
  riskLevel: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AIAnalysis {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  risks: string[];
  suggestions: string[];
  itemAnalysis?: {
    order: number;
    acceptRate: number;
    comment: string;
  }[];
}

export interface CreatePlanRequest {
  name: string;
  year: number;
  province?: string;
  items: Omit<PlanItem, 'prediction'>[];
  strategy?: string;
  notes?: string;
}

export interface UpdatePlanRequest {
  name?: string;
  items?: Omit<PlanItem, 'prediction'>[];
  strategy?: string;
  status?: PlanStatus;
  isFavorite?: boolean;
  notes?: string;
}
