'use client';

import styles from './styles.module.css';

export type GradeKey =
  | 'JI_CHONG' | 'CHONG' | 'XIAO_CHONG'
  | 'WEN' | 'WEN_BAO'
  | 'BAO' | 'QIANG_BAO' | 'DIBAO';

export type TierFilter = '985' | '211' | 'DFC' | 'other';
export type ProvinceFilter = 'all' | 'local' | 'outside';

export interface FilterState {
  grades: Set<GradeKey>;
  tiers: Set<TierFilter>;
  province: ProvinceFilter;
}

export const ALL_GRADES: GradeKey[] = [
  'JI_CHONG', 'CHONG', 'XIAO_CHONG', 'WEN', 'WEN_BAO', 'BAO', 'QIANG_BAO', 'DIBAO',
];

const GRADE_LABEL: Record<GradeKey, string> = {
  JI_CHONG: '极冲', CHONG: '冲', XIAO_CHONG: '小冲',
  WEN: '稳', WEN_BAO: '稳保',
  BAO: '保', QIANG_BAO: '强保', DIBAO: '兜底',
};

export const ALL_TIERS: TierFilter[] = ['985', '211', 'DFC', 'other'];

const TIER_LABEL: Record<TierFilter, string> = {
  '985': '985', '211': '211', DFC: '双一流', other: '其他',
};

const PROVINCE_OPTIONS: Array<{ value: ProvinceFilter; label: string }> = [
  { value: 'all', label: '不限' },
  { value: 'local', label: '本省' },
  { value: 'outside', label: '外省' },
];

export const DEFAULT_FILTERS: FilterState = {
  grades: new Set(ALL_GRADES),
  tiers: new Set(ALL_TIERS),
  province: 'all',
};

export function isDefaultFilters(filters: FilterState): boolean {
  return (
    filters.grades.size === ALL_GRADES.length &&
    filters.tiers.size === ALL_TIERS.length &&
    filters.province === 'all'
  );
}

interface Props {
  filters: FilterState;
  setFilters: (next: FilterState) => void;
  filteredCount: number;
  totalCount: number;
}

export function FilterBar({ filters, setFilters, filteredCount, totalCount }: Props) {
  const toggleGrade = (g: GradeKey) => {
    const next = new Set(filters.grades);
    if (next.has(g)) next.delete(g); else next.add(g);
    setFilters({ ...filters, grades: next });
  };
  const toggleTier = (t: TierFilter) => {
    const next = new Set(filters.tiers);
    if (next.has(t)) next.delete(t); else next.add(t);
    setFilters({ ...filters, tiers: next });
  };
  const setProvince = (v: ProvinceFilter) => setFilters({ ...filters, province: v });

  const filteredSame = filteredCount === totalCount;

  return (
    <div className={styles.filterBar}>
      <div className={styles.filterGroup}>
        <span className={styles.filterGroupLabel}>梯度</span>
        <div className={styles.filterChips}>
          {ALL_GRADES.map((g) => (
            <button
              key={g}
              type="button"
              className={`${styles.filterChip} ${filters.grades.has(g) ? styles.filterChipActive : ''}`}
              onClick={() => toggleGrade(g)}
            >
              {GRADE_LABEL[g]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterGroup}>
        <span className={styles.filterGroupLabel}>院校档次</span>
        <div className={styles.filterChips}>
          {ALL_TIERS.map((t) => (
            <button
              key={t}
              type="button"
              className={`${styles.filterChip} ${filters.tiers.has(t) ? styles.filterChipActive : ''}`}
              onClick={() => toggleTier(t)}
            >
              {TIER_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterGroup}>
        <span className={styles.filterGroupLabel}>地域</span>
        <div className={styles.filterChips}>
          {PROVINCE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`${styles.filterChip} ${filters.province === o.value ? styles.filterChipActive : ''}`}
              onClick={() => setProvince(o.value)}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.filterRight}>
        <span className={styles.filterCount}>
          {filteredSame ? <>共 <b>{totalCount}</b> 个</> : <>显示 <b>{filteredCount}</b> / {totalCount} 个</>}
        </span>
        {!isDefaultFilters(filters) ? (
          <button
            type="button"
            className={styles.filterReset}
            onClick={() => setFilters(DEFAULT_FILTERS)}
          >
            重置
          </button>
        ) : null}
      </div>
    </div>
  );
}
