import { create } from 'zustand';
import type { UniversityListItem } from '@/services/university';

/**
 * 院校对比清单 — 提升为全局 store: 列表页勾选后进详情页确认细节,
 * 返回列表清单仍在; 详情页也能直接加入对比。
 */
interface CompareState {
  list: UniversityListItem[];
  /** 返回 'added' | 'removed' | 'full' (满 4 所拒绝) */
  toggle: (u: UniversityListItem) => 'added' | 'removed' | 'full';
  clear: () => void;
}

export const useUniversityCompare = create<CompareState>((set, get) => ({
  list: [],
  toggle: (u) => {
    const cur = get().list;
    if (cur.some((c) => c.id === u.id)) {
      set({ list: cur.filter((c) => c.id !== u.id) });
      return 'removed';
    }
    if (cur.length >= 4) return 'full';
    set({ list: [...cur, u] });
    return 'added';
  },
  clear: () => set({ list: [] }),
}));
