import api from './api';

export interface Consultation {
  id: number;
  studentId: number;
  teacherId: number;
  scheduledAt: string;
  durationEst: number | null;
  durationAct: number | null;
  channel: 'phone' | 'wechat' | 'in_person' | 'video';
  purpose: string | null;
  status: 'requested' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  createdByActor?: 'teacher' | 'student' | null;
  notes: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
  student?: {
    user: { realName: string | null; username: string };
  };
}

// NOTE: axios response interceptor in ./api.ts already unwraps response.data.
// All methods below MUST `return (await api.xxx(...)) as T` (NOT res.data) —
// otherwise the second .data access returns undefined and breaks every caller.
export const consultationApi = {
  async create(payload: {
    studentId: number;
    scheduledAt: string;
    durationEst?: number;
    channel: 'phone' | 'wechat' | 'in_person' | 'video';
    purpose?: string;
    notes?: string;
  }) {
    return (await api.post('/consultations', payload)) as unknown as Consultation;
  },

  async update(
    id: number,
    payload: Partial<Omit<Consultation, 'id' | 'studentId' | 'teacherId' | 'createdAt' | 'updatedAt'>>,
  ) {
    return (await api.put(`/consultations/${id}`, payload)) as unknown as Consultation;
  },

  async start(id: number) {
    return (await api.post(`/consultations/${id}/start`)) as unknown as Consultation;
  },

  async end(id: number, notes?: string) {
    return (await api.post(`/consultations/${id}/end`, { notes })) as unknown as Consultation;
  },

  async listByStudent(studentId: number | string) {
    return (await api.get(`/consultations?studentId=${studentId}`)) as unknown as Consultation[];
  },

  async listToday() {
    return (await api.get('/consultations/today')) as unknown as Consultation[];
  },

  async remove(id: number) {
    return await api.delete(`/consultations/${id}`);
  },

  async requestByParent(payload: {
    scheduledAt: string;
    durationEst?: number;
    channel: 'phone' | 'wechat' | 'in_person' | 'video';
    purpose?: string;
    notes?: string;
  }) {
    return (await api.post('/consultations/request', payload)) as unknown as Consultation;
  },

  async confirmRequest(id: number) {
    return (await api.post(`/consultations/${id}/confirm`)) as unknown as Consultation;
  },

  async rejectRequest(id: number, reason?: string) {
    return (await api.post(`/consultations/${id}/reject`, { reason })) as unknown as Consultation;
  },

  async listPendingRequests() {
    return (await api.get('/consultations/pending-requests')) as unknown as Consultation[];
  },

  async listMine() {
    return (await api.get('/consultations/mine')) as unknown as Consultation[];
  },

  async getMyInsights(range: 'week' | 'month' = 'month') {
    return (await api.get(`/consultations/insights/me?range=${range}`)) as unknown as {
      range: 'week' | 'month';
      totalCount: number;
      totalMinutes: number;
      byStudent: Array<{ studentId: number; name: string; count: number; minutes: number }>;
      byChannel: Record<string, { count: number; minutes: number }>;
      estimation: { avgEst: number | null; avgAct: number | null; sampleSize: number };
    };
  },

  async enqueue(id: number) {
    return await api.post(`/consultations/${id}/enqueue`);
  },

  async getClinicState() {
    return (await api.get('/consultations/clinic/state')) as unknown as {
      inProgress: any | null;
      waiting: any[];
      done: any[];
    };
  },

  async callNext(currentNotes?: string) {
    return (await api.post('/consultations/clinic/call-next', { currentNotes })) as unknown as {
      endedId?: number;
      startedId?: number;
    };
  },

  async getTeamInsights(range: 'week' | 'month' = 'month') {
    return (await api.get(`/consultations/insights/team?range=${range}`)) as unknown as {
      range: 'week' | 'month';
      totalTeachers: number;
      totalCount: number;
      totalMinutes: number;
      byTeacher: Array<{
        teacherId: number;
        name: string;
        count: number;
        minutes: number;
        studentCount: number;
      }>;
      alerts: {
        lowProductivity: Array<{ teacherId: number; name: string; minutes: number }>;
        threshold: number;
      };
    };
  },
};
