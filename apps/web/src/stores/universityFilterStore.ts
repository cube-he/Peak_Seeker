import { create } from 'zustand';
import type { UniversityQueryParams } from '@/services/university';

/**
 * 院校页 filter 共享 store。「全部院校」「地图」两个 tab 都读这个 store,
 * 一处改动另一处自动同步。
 *
 * 不走 localStorage persist——筛选条件应是会话内瞬时状态,刷新 / 重进站
 * 都从默认开始,避免用户回来发现"为什么列表只有几所"。
 */

const DEFAULT_FILTERS: UniversityQueryParams = {
  page: 1,
  pageSize: 12,
  sortBy: 'softRank', // 与 master 上 list 重构后的默认一致(按软科排序)
  sortOrder: 'asc',
};

interface UniversityFilterState {
  filters: UniversityQueryParams;
  setFilters: (
    updater: UniversityQueryParams | ((prev: UniversityQueryParams) => UniversityQueryParams),
  ) => void;
  /** 重置 filter,可选保留某些字段(比如 page/pageSize) */
  resetFilters: (preserve?: Partial<UniversityQueryParams>) => void;
}

export const useUniversityFilters = create<UniversityFilterState>((set) => ({
  filters: DEFAULT_FILTERS,
  setFilters: (updater) =>
    set((state) => ({
      filters: typeof updater === 'function' ? updater(state.filters) : updater,
    })),
  resetFilters: (preserve) =>
    set(() => ({ filters: { ...DEFAULT_FILTERS, ...preserve } })),
}));

/** 用于地图视图:从共享 filter 提取与地图无关的字段(分页/排序),保留筛选维度 */
export function pickMapFilters(filters: UniversityQueryParams) {
  return {
    keyword: filters.keyword,
    province: filters.province,
    city: filters.city,
    type: filters.type,
    level: filters.level,
    grade: filters.grade,
    nature: filters.nature,
    is985: filters.is985,
    is211: filters.is211,
    isDoubleFirstClass: filters.isDoubleFirstClass,
  };
}
