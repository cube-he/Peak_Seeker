// AI 相关类型
export enum AIProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  DEEPSEEK = 'deepseek',
  QWEN = 'qwen',
  ZHIPU = 'zhipu',
}

export interface AIChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIChatRequest {
  message: string;
  conversationId?: string;
  provider?: AIProvider;
  context?: {
    userScore?: number;
    userRank?: number;
    userProvince?: string;
    currentPlan?: any;
  };
}

export interface AIChatResponse {
  conversationId: string;
  message: string;
  provider: AIProvider;
  suggestions?: string[];
  relatedData?: {
    universities?: any[];
    majors?: any[];
  };
}

export interface AIAnalyzeRequest {
  type: 'plan' | 'university' | 'major';
  data: any;
  userInfo?: {
    score: number;
    rank: number;
    province: string;
  };
}

export interface AIAnalyzeResponse {
  analysis: string;
  score?: number;
  suggestions?: string[];
  risks?: string[];
}
