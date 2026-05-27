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
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
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
};
