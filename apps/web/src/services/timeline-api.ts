import api from './api';

export interface TimelineEvent {
  id: number;
  key: string;
  name: string;
  status: string;
  sortOrder: number;
  startDate: string | null;
  endDate: string | null;
  detail: Record<string, unknown> | null;
  sourceUrl: string | null;
  year: number;
}

interface TimelineResponse {
  events: TimelineEvent[];
}

export const timelineApi = {
  getTimeline(year?: number): Promise<TimelineResponse> {
    const params = year ? { year } : {};
    return api.get('/timeline', { params });
  },
};
