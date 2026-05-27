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

export const consultationApi = {
  async create(payload: {
    studentId: number;
    scheduledAt: string;
    durationEst?: number;
    channel: 'phone' | 'wechat' | 'in_person' | 'video';
    purpose?: string;
    notes?: string;
  }) {
    const res = await api.post('/consultations', payload);
    return res.data as Consultation;
  },

  async update(
    id: number,
    payload: Partial<Omit<Consultation, 'id' | 'studentId' | 'teacherId' | 'createdAt' | 'updatedAt'>>,
  ) {
    const res = await api.put(`/consultations/${id}`, payload);
    return res.data as Consultation;
  },

  async start(id: number) {
    const res = await api.post(`/consultations/${id}/start`);
    return res.data as Consultation;
  },

  async end(id: number, notes?: string) {
    const res = await api.post(`/consultations/${id}/end`, { notes });
    return res.data as Consultation;
  },

  async listByStudent(studentId: number | string) {
    const res = await api.get(`/consultations?studentId=${studentId}`);
    return res.data as Consultation[];
  },

  async listToday() {
    const res = await api.get('/consultations/today');
    return res.data as Consultation[];
  },

  async remove(id: number) {
    const res = await api.delete(`/consultations/${id}`);
    return res.data;
  },

  async requestByParent(payload: {
    scheduledAt: string;
    durationEst?: number;
    channel: 'phone' | 'wechat' | 'in_person' | 'video';
    purpose?: string;
    notes?: string;
  }) {
    const res = await api.post('/consultations/request', payload);
    return res.data as Consultation;
  },

  async confirmRequest(id: number) {
    const res = await api.post(`/consultations/${id}/confirm`);
    return res.data as Consultation;
  },

  async rejectRequest(id: number, reason?: string) {
    const res = await api.post(`/consultations/${id}/reject`, { reason });
    return res.data as Consultation;
  },

  async listPendingRequests() {
    const res = await api.get('/consultations/pending-requests');
    return res.data as Consultation[];
  },

  async listMine() {
    const res = await api.get('/consultations/mine');
    return res.data as Consultation[];
  },

  async getMyInsights(range: 'week' | 'month' = 'month') {
    const res = await api.get(`/consultations/insights/me?range=${range}`);
    return res.data as {
      range: 'week' | 'month';
      totalCount: number;
      totalMinutes: number;
      byStudent: Array<{ studentId: number; name: string; count: number; minutes: number }>;
      byChannel: Record<string, { count: number; minutes: number }>;
      estimation: { avgEst: number | null; avgAct: number | null; sampleSize: number };
    };
  },

  async enqueue(id: number) {
    const res = await api.post(`/consultations/${id}/enqueue`);
    return res.data;
  },

  async getClinicState() {
    const res = await api.get('/consultations/clinic/state');
    return res.data as {
      inProgress: any | null;
      waiting: any[];
      done: any[];
    };
  },

  async callNext(currentNotes?: string) {
    const res = await api.post('/consultations/clinic/call-next', { currentNotes });
    return res.data as { endedId?: number; startedId?: number };
  },

  async getTeamInsights(range: 'week' | 'month' = 'month') {
    const res = await api.get(`/consultations/insights/team?range=${range}`);
    return res.data as {
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
