import api from './api';

// NOTE: axios 拦截器已 unwrap response.data; 所有方法 return (await api.xxx) as T

export interface HistoricalCaseListItem {
  id: number;
  examYear: number | null;
  examType: 'PHYSICS' | 'HISTORY' | null;
  totalScore: number | null;
  provincialRank: number | null;
  firstChoice: string | null;
  reChoices: string[] | null;
  county: string | null;
  user: { realName: string | null; username: string; gender: string | null };
  admissionResult: {
    admittedUniName: string;
    admittedMinScore: number | null;
    admittedMinRank: number | null;
    scoreDiff: number | null;
    sequenceNo: number | null;
    batchName: string | null;
  } | null;
  teacher: { user: { realName: string | null; username: string } } | null;
}

export interface HistoricalCaseDetail extends HistoricalCaseListItem {
  height: string | null;
  weight: string | null;
  visionLeft: string | null;
  visionRight: string | null;
  politicalStatus: string | null;
  preferredProvinces: string[] | null;
  priorityMode: string | null;
  volunteerPlans: Array<{
    id: number;
    name: string;
    batchName: string | null;
    versionNote: string | null;
    status: string;
  }>;
  attachments: Array<{
    id: number;
    category: 'consultation' | 'submission_screenshot' | 'admission_proof' | 'other';
    originalName: string;
    fileSize: number | null;
    mimeType: string | null;
  }>;
}

export interface HistoricalStats {
  total: number;
  byExamType: { PHYSICS?: number; HISTORY?: number };
  byBatch: Record<string, number>;
  avgScoreDiff: number | null;
  sampleSize: number;
  topUniversities: Array<{ name: string; count: number }>;
}

export const historicalCasesApi = {
  async list(params: {
    examYear?: number;
    examType?: 'PHYSICS' | 'HISTORY';
    batch?: string;
    scoreFrom?: number;
    scoreTo?: number;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }) {
    return (await api.get('/historical-cases', { params })) as unknown as {
      data: HistoricalCaseListItem[];
      total: number;
      page: number;
      pageSize: number;
    };
  },

  async getById(id: number | string) {
    return (await api.get(`/historical-cases/${id}`)) as unknown as HistoricalCaseDetail;
  },

  async stats(examYear?: number) {
    return (await api.get('/historical-cases/stats', { params: { examYear } })) as unknown as HistoricalStats;
  },

  async similar(params: { examType: 'PHYSICS' | 'HISTORY'; score?: number; rank?: number; limit?: number }) {
    return (await api.get('/historical-cases/similar', { params })) as unknown as HistoricalCaseListItem[];
  },

  /** 强制下载到本地 (Content-Disposition: attachment) */
  attachmentDownloadUrl(attachmentId: number) {
    return `/api/v1/historical-cases/attachments/${attachmentId}/download`;
  },

  /** 浏览器内预览 (Content-Disposition: inline). 图片直出, PDF 走内置 viewer. */
  attachmentPreviewUrl(attachmentId: number) {
    return `/api/v1/historical-cases/attachments/${attachmentId}/preview`;
  },
};
