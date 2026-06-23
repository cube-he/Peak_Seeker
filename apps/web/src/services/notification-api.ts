import api from './api';

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  content: string;
  refId?: number | null;
  refType?: string | null;
  isRead: boolean;
  createdAt: string;
}

// 注：api 的响应拦截器已 `return response.data`，故这里直接拿到响应体，无需再 .data
export const notificationApi = {
  getUnread(): Promise<AppNotification[]> {
    return api.get('/notifications/unread') as any;
  },
  markRead(ids: number[]): Promise<unknown> {
    return api.post('/notifications/read', { ids }) as any;
  },
  markAllRead(): Promise<unknown> {
    return api.post('/notifications/read-all') as any;
  },
};
