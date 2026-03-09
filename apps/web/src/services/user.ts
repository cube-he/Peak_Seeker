import api from './api';

export interface UpdateProfileDto {
  realName?: string;
  gender?: string;
  birthDate?: string;
  avatar?: string;
}

export interface UpdateExamInfoDto {
  province?: string;
  city?: string;
  examType?: string;
  examYear?: number;
  score?: number;
  rank?: number;
  subjects?: Record<string, boolean>;
  batch?: string;
}

export interface UpdatePreferencesDto {
  preferredProvinces?: string[];
  preferredCities?: string[];
  preferredMajors?: string[];
  preferredUniversityTypes?: string[];
  careerDirection?: string;
}

export const userService = {
  getMe(): Promise<any> {
    return api.get('/users/me') as any;
  },

  updateProfile(data: UpdateProfileDto): Promise<any> {
    return api.put('/users/me', data) as any;
  },

  updateExamInfo(data: UpdateExamInfoDto): Promise<any> {
    return api.put('/users/me/exam-info', data) as any;
  },

  updatePreferences(data: UpdatePreferencesDto): Promise<any> {
    return api.put('/users/me/preferences', data) as any;
  },
};
