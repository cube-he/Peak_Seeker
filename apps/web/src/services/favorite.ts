import api from './api';

export interface AddFavoriteDto {
  type: 'university' | 'major';
  universityId?: number;
  majorId?: number;
  notes?: string;
}

export const favoriteService = {
  getList(type?: 'university' | 'major'): Promise<any> {
    return api.get('/favorites', { params: { type } }) as any;
  },

  add(data: AddFavoriteDto): Promise<any> {
    return api.post('/favorites', data) as any;
  },

  remove(id: number): Promise<any> {
    return api.delete(`/favorites/${id}`) as any;
  },
};
