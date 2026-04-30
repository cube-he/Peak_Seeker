import api from './api';

export type ExamType = '物理' | '历史' | '理科' | '文科';

export interface LookupResult {
  year: number;
  examType: ExamType;
  score: number;
  rank: number;
  percentile: number;
}

export interface EquivalentResult {
  base: LookupResult;
  equivalents: LookupResult[];
}

export const scoreSegmentApi = {
  lookup(params: {
    year: number;
    examType: ExamType;
    score?: number;
    rank?: number;
  }): Promise<LookupResult> {
    return api.post('/score-segment/lookup', params);
  },
  equivalent(params: {
    baseYear: number;
    examType: ExamType;
    rank: number;
  }): Promise<EquivalentResult> {
    return api.post('/score-segment/equivalent', params);
  },
};
