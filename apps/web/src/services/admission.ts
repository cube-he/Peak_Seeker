import api from './api';
import type {
  AggregatedAdmissionResponse,
  AggregatedAdmissionDetail,
  AggregatedAdmissionDetailQuery,
  LookupPredictionsRequest,
  LookupPredictionsResponse,
} from '@volunteer-helper/shared';

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

export interface GetAggregatedParams {
  rank: number;
  province: string;
  subjects: string;
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

  getAggregated(params: GetAggregatedParams): Promise<AggregatedAdmissionResponse> {
    return api.get('/admissions/aggregated', { params }) as any;
  },

  getAggregatedDetail(
    query: AggregatedAdmissionDetailQuery,
  ): Promise<AggregatedAdmissionDetail> {
    return api.get('/admissions/aggregated/detail', { params: query }) as any;
  },

  lookupPredictions(req: LookupPredictionsRequest): Promise<LookupPredictionsResponse> {
    return api.post('/admissions/lookup-predictions', req) as any;
  },
};
