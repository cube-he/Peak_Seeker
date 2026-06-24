// 共享类型：候选池 V2 设计涉及的对外接口

export type Gradient = 'rush' | 'stable' | 'safe';

export interface PrefMatch {
  province?: 'match' | 'mismatch';
  tuition?: 'within' | 'over';
  career?: 'strong' | 'weak' | 'none';
}

export interface YearPoint {
  year: number;
  score: number;
  rank: number;
}

export interface RankPrediction {
  year: number;
  score: number;
  rank: number;
  scoreLow: number;
  scoreHigh: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface SupplementaryRound {
  round: number;
  count: number;
  lineDrop?: number;
  date?: string;
}

export interface SupplementaryYear {
  year: number;
  rounds: SupplementaryRound[];
}

// 备注分类（用于自动着色）
export type NoteTone = 'danger' | 'warn' | 'info';
export type NoteType = 'health' | 'subject' | 'gender' | 'tuition' | 'new' | 'political' | 'physical' | 'other';
