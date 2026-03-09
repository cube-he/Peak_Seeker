import api from './api';

export interface AdmissionByScoreParams {
  score: number;
  province: string;
  year?: number;
  range?: number;
}

export interface AdmissionByRankParams {
  rank: number;
  province: string;
  year?: number;
  range?: number;
}

export const admissionService = {
  getByScore(params: AdmissionByScoreParams): Promise<any> {
    return api.get('/admissions/by-score', { params }) as any;
  },

  getByRank(params: AdmissionByRankParams): Promise<any> {
    return api.get('/admissions/by-rank', { params }) as any;
  },

  getStatistics(province: string, year?: number): Promise<any> {
    return api.get('/admissions/statistics', { params: { province, year } }) as any;
  },
};
