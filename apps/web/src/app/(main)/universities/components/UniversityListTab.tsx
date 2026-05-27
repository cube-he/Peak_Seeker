'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { universityService, type UniversityQueryParams, type UniversityListItem } from '@/services/university';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useStudentRank } from '@/stores/studentRankStore';
import { useUniversityFilters } from '@/stores/universityFilterStore';
import { SubjectToggle } from './shared/SubjectToggle';
import { Empty } from './shared/Empty';
import { SearchIcon } from './shared/Icon';
import { ListCard } from './list/ListCard';
import { ListFiltersPanel } from './list/ListFiltersPanel';
import { SortCluster } from './list/SortCluster';

type ActiveFilter = { key: keyof UniversityQueryParams; label: string };
const FEATURE_LABEL: Record<string, string> = {
  is985: '985 工程',
  is211: '211 工程',
  isDoubleFirstClass: '双一流',
};

/**
 * 全部院校 tab。设计稿:
 * - 顶部 hero(总数 + 985/211/双一流 计数横排)
 * - card:科类切换 + 搜索框 + SortCluster + 可折叠 filter panel
 * - applied chips 行 + 找到 N 所
 * - ListCard 列表
 * - 分页
 */
export function UniversityListTab() {
  const filters = useUniversityFilters((s) => s.filters);
  const setFilters = useUniversityFilters((s) => s.setFilters);
  const [keywordInput, setKeywordInput] = useState(filters.keyword ?? '');
  const debouncedKeyword = useDebouncedValue(keywordInput, 300);
  const examType = useStudentRank((s) => s.examType);
  const setExamType = useStudentRank((s) => s.setExamType);
  const studentRank = useStudentRank((s) => s.rank);

  // 位次清空时重置依赖位次的排序/筛选
  useEffect(() => {
    if (studentRank != null) return;
    setFilters((prev) => {
      if (prev.sortBy !== 'tier' && prev.tierFilter == null) return prev;
      return {
        ...prev,
        sortBy: prev.sortBy === 'tier' ? 'name' : prev.sortBy,
        sortOrder: prev.sortBy === 'tier' ? 'asc' : prev.sortOrder,
        tierFilter: undefined,
      };
    });
  }, [studentRank, setFilters]);

  useEffect(() => {
    setFilters((prev) => ({ ...prev, keyword: debouncedKeyword || undefined, page: 1 }));
  }, [debouncedKeyword, setFilters]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['universities', filters, examType, studentRank],
    queryFn: () =>
      universityService.getList({
        ...filters,
        examType: examType as '物理' | '历史',
        userRank: studentRank ?? undefined,
      }),
  });

  const universities = data?.data || [];
  const total = data?.pagination?.total || 0;
  const pageSize = filters.pageSize ?? 12;
  const page = filters.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 985/211/双一流 横排:filter options 接口当前不返回这 3 个计数,临时用固定估算
  // (后续可加 endpoint 或在 getFilters response 加 cumulative tags 字段)
  const elite985 = 39;
  const elite211 = 116;
  const eliteDfc = 147;

  const applied = useMemo<ActiveFilter[]>(() => {
    const items: ActiveFilter[] = [];
    if (filters.province) items.push({ key: 'province', label: filters.province });
    if (filters.city) items.push({ key: 'city', label: filters.city });
    if (filters.type) items.push({ key: 'type', label: filters.type });
    if (filters.nature) items.push({ key: 'nature', label: filters.nature });
    if (filters.level) items.push({ key: 'level', label: filters.level });
    if (filters.is985) items.push({ key: 'is985', label: FEATURE_LABEL.is985 });
    if (filters.is211) items.push({ key: 'is211', label: FEATURE_LABEL.is211 });
    if (filters.isDoubleFirstClass) items.push({ key: 'isDoubleFirstClass', label: FEATURE_LABEL.isDoubleFirstClass });
    if (filters.tierFilter) {
      const m = { rush: '冲一冲', stable: '稳一稳', safe: '保一保' } as const;
      items.push({ key: 'tierFilter', label: `录取概率:${m[filters.tierFilter as keyof typeof m]}` });
    }
    if (filters.hasTag) items.push({ key: 'hasTag', label: filters.hasTag });
    return items;
  }, [filters]);

  const removeFilter = (key: keyof UniversityQueryParams) => {
    const next: UniversityQueryParams = { ...filters, [key]: undefined, page: 1 };
    if (key === 'province') next.city = undefined;
    setFilters(next);
  };

  const clearAll = () => {
    setFilters({
      page: 1,
      pageSize,
      keyword: filters.keyword,
      sortBy: filters.sortBy,
      sortOrder: filters.sortOrder,
    });
  };

  // 分页按钮序列(...省略中间页)
  const pageButtons = useMemo(() => {
    const items: Array<number | 'gap'> = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
        items.push(i);
      } else if (i === 2 || i === totalPages - 1) {
        items.push('gap');
      }
    }
    return items;
  }, [page, totalPages]);

  return (
    <div className="fade-up">
      {/* —— Page hero —— */}
      <div
        style={{
          padding: '24px 0 18px',
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 18,
          flexWrap: 'wrap',
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-heading)',
            fontWeight: 600,
            fontSize: 24,
            color: 'var(--text)',
            letterSpacing: '-.005em',
            lineHeight: 1.2,
          }}
        >
          <span style={{ color: 'var(--accent)' }}>{total.toLocaleString()}</span>
          <span style={{ marginLeft: 8, color: 'var(--text-tertiary)', fontSize: 15, fontWeight: 400 }}>
            所院校 · 在川招生
          </span>
        </h1>
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <EliteCount value={elite985} label="所 985" />
          <EliteCount value={elite211} label="所 211" />
          <EliteCount value={eliteDfc} label="所双一流" />
        </div>
      </div>

      {/* —— Toolbar card —— */}
      <div
        style={{
          padding: '14px 18px',
          marginBottom: 16,
          background: 'var(--surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 12,
          boxShadow: 'var(--shadow-card)',
        }}
      >
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <SubjectToggle value={examType} onChange={setExamType} />
          <div style={{ width: 1, height: 22, background: 'var(--border)', alignSelf: 'center' }} />
          <div style={{ position: 'relative', flex: '1 1 300px', minWidth: 240 }}>
            <span
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                width: 14,
                height: 14,
                pointerEvents: 'none',
              }}
            >
              <SearchIcon />
            </span>
            <input
              type="text"
              placeholder="搜索学校 / 城市 / 关键词,例如:成都、医科、政法"
              value={keywordInput}
              onChange={(e) => setKeywordInput(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                fontSize: 13.5,
                border: '1px solid var(--border)',
                background: 'var(--surface-dim)',
                color: 'var(--text)',
                borderRadius: 8,
                outline: 'none',
                height: 36,
                transition: 'all .2s',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--primary)';
                e.target.style.background = '#fff';
                e.target.style.boxShadow = '0 0 0 3px rgba(30,58,95,.10)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)';
                e.target.style.background = 'var(--surface-dim)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>
          <SortCluster filters={filters} setFilters={setFilters} />
        </div>
        <ListFiltersPanel filters={filters} setFilters={setFilters} studentRank={studentRank ?? null} />
      </div>

      {/* —— Applied chips + 总数 —— */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          找到{' '}
          <strong style={{ fontFamily: 'var(--font-heading)', fontSize: 18, color: 'var(--text)' }}>{total}</strong>{' '}
          所院校
          <span style={{ color: 'var(--text-faint)', marginLeft: 8 }}>
            第 {page} 页 / 共 {totalPages} 页 · 每页 {pageSize} 所
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {applied.length === 0 ? (
            <span
              style={{
                fontSize: 11,
                color: 'var(--text-faint)',
                padding: '3px 10px',
                border: '1px dashed var(--border)',
                borderRadius: 999,
              }}
            >
              未限定条件
            </span>
          ) : (
            <>
              {applied.map((a) => (
                <button
                  key={a.key as string}
                  type="button"
                  className="applied-chip"
                  onClick={() => removeFilter(a.key)}
                >
                  {a.label}
                  <span className="x">×</span>
                </button>
              ))}
              <button
                type="button"
                onClick={clearAll}
                style={{
                  background: 'transparent',
                  border: 0,
                  fontSize: 11.5,
                  color: 'var(--text-muted)',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                清除全部
              </button>
            </>
          )}
        </div>
      </div>

      {/* —— List —— */}
      {isLoading ? (
        <div className="card" style={{ padding: 80, display: 'flex', justifyContent: 'center' }}>
          <Spin size="large" />
        </div>
      ) : isError ? (
        <div className="card" style={{ padding: 24 }}>
          <Alert
            type="error"
            showIcon
            message="院校数据加载失败"
            description={(error as Error)?.message || '请稍后刷新重试。'}
          />
        </div>
      ) : universities.length === 0 ? (
        <Empty msg="暂无匹配的院校,试试放宽筛选条件" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {universities.map((uni: UniversityListItem) => (
            <ListCard
              key={uni.id}
              uni={uni}
              userRank={studentRank ?? null}
              examType={examType as '物理' | '历史'}
            />
          ))}
        </div>
      )}

      {/* —— Pagination —— */}
      {totalPages > 1 && (
        <div className="pagn">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => {
              setFilters({ ...filters, page: page - 1 });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            ‹ 上一页
          </button>
          {pageButtons.map((p, i) =>
            p === 'gap' ? (
              <span key={`gap-${i}`} className="gap">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={p === page ? 'is-active' : ''}
                onClick={() => {
                  setFilters({ ...filters, page: p });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            disabled={page === totalPages}
            onClick={() => {
              setFilters({ ...filters, page: page + 1 });
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          >
            下一页 ›
          </button>
        </div>
      )}
    </div>
  );
}

function EliteCount({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-heading)' }}>
        {value}
      </strong>{' '}
      {label}
    </span>
  );
}
