import { groupBoards } from '../groupBoards';
import type { RankingBoard } from '@/services/university';

const board = (key: string, groupKey: string, groupTitle: string): RankingBoard => ({
  key, groupKey, groupTitle, title: key, level: '本科', items: [],
});

describe('groupBoards', () => {
  it('groups boards by groupKey, preserving order', () => {
    const result = groupBoards([
      board('sichuan-undergrad', 'sichuan', '川内'),
      board('sichuan-college', 'sichuan', '川内'),
      board('national-elite', 'elite', '全国名校榜'),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].groupTitle).toBe('川内');
    expect(result[0].boards).toHaveLength(2);
    expect(result[1].boards).toHaveLength(1);
  });

  it('returns an empty array for no boards', () => {
    expect(groupBoards([])).toEqual([]);
  });
});
