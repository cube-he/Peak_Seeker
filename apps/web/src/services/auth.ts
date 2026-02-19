import api from './api';

export interface LoginParams {
  username: string;
  password: string;
}

export interface RegisterParams {
  username: string;
  password: string;
  phone?: string;
  email?: string;
  province?: string;
}

export const authService = {
  login: (params: LoginParams) => api.post('/auth/login', params),
  register: (params: RegisterParams) => api.post('/auth/register', params),
  logout: () => api.post('/auth/logout'),
  refresh: (refreshToken: string) => api.post('/auth/refresh', { refreshToken }),
  getMe: () => api.get('/users/me'),
};
