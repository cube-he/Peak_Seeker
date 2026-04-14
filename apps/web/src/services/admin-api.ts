import api from './api';

export interface UserListParams {
  role?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export const adminApi = {
  // Dashboard
  getDashboardStats(): Promise<any> {
    return api.get('/admin/stats') as any;
  },

  // Users
  getUsers(params?: UserListParams): Promise<any> {
    return api.get('/admin/users', { params }) as any;
  },

  createUser(data: Record<string, unknown>): Promise<any> {
    return api.post('/admin/users', data) as any;
  },

  updateUser(id: number, data: Record<string, unknown>): Promise<any> {
    return api.put(`/admin/users/${id}`, data) as any;
  },

  deleteUser(id: number): Promise<any> {
    return api.delete(`/admin/users/${id}`) as any;
  },

  updatePermissions(id: number, permissions: Record<string, boolean>): Promise<any> {
    return api.put(`/admin/users/${id}/permissions`, { permissions }) as any;
  },

  // Config
  getConfig(): Promise<any> {
    return api.get('/admin/config') as any;
  },

  updateConfig(data: Record<string, unknown>): Promise<any> {
    return api.put('/admin/config', data) as any;
  },

  // Data Import
  validateImportFile(formData: FormData): Promise<any> {
    return api.post('/data-import/validate', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as any;
  },

  importData(formData: FormData): Promise<any> {
    return api.post('/data-import/import', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }) as any;
  },
};
