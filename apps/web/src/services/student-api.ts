import api from './api';

export interface CreateStudentDto {
  username: string;
  password: string;
  realName: string;
  phone?: string;
  gender?: 'MALE' | 'FEMALE';
}

export interface UpdateStudentDto {
  realName?: string;
  phone?: string;
  gender?: string;
  examType?: string;
  score?: number;
  rank?: number;
  examYear?: number;
  subjects?: string[];
  preferredProvinces?: string[];
  preferredMajorCategories?: string[];
  excludedUniversities?: string[];
  excludedMajors?: string[];
  physicalConditions?: string[];
  economicLevel?: string;
  interests?: string[];
  personalityType?: string;
  careerDirection?: string;
  notes?: string;
  dataVersion?: number;
}

export interface StudentListParams {
  search?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}

export const studentApi = {
  // Teacher endpoints — manage students
  getList(params?: StudentListParams): Promise<any> {
    return api.get('/students', { params }) as any;
  },

  getById(id: string): Promise<any> {
    return api.get(`/students/${id}`) as any;
  },

  create(data: CreateStudentDto): Promise<any> {
    return api.post('/students', data) as any;
  },

  update(id: string, data: UpdateStudentDto): Promise<any> {
    return api.put(`/students/${id}`, data) as any;
  },

  delete(id: string): Promise<any> {
    return api.delete(`/students/${id}`) as any;
  },

  // Student self-service endpoints
  getMyProfile(): Promise<any> {
    return api.get('/students/me') as any;
  },

  updateMyProfile(data: Record<string, unknown>): Promise<any> {
    return api.put('/students/me', data) as any;
  },

  // Light recommendation for student self-service
  quickRecommend(params: { score: number }): Promise<any> {
    return api.post('/recommend/quick', params) as any;
  },
};
