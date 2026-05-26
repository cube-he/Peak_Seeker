'use client';

import { useState, useRef, useEffect } from 'react';
import type { UniversityQueryParams } from '@/services/university';

/**
 * 紧凑排序行(design `.sort-cluster`):3 个热门按钮直出 + 「更多排序」popover。
 * 按钮循环:第一次激活按 dir,第二次反向,第三次重置默认 softRank asc。
 */

type SortKey = NonNullable<UniversityQueryParams['sortBy']>;
type SortDir = 'asc' | 'desc';

const HOT: Array<{ key: SortKey; label: string; dir: SortDir }> = [
  { key: 'softRank', label: '软科排名', dir: 'asc' },
  // 后端 sortBy 同义:rank / minScore 已支持。
  { key: 'rank' as SortKey, label: '录取位次', dir: 'asc' },
  { key: 'minScore' as SortKey, label: '最低分数', dir: 'desc' },
];
const MORE: Array<{ key: SortKey; label: string; dir: SortDir }> = [
  { key: 'name' as SortKey, label: '院校名称', dir: 'asc' },
  { key: 'tier' as SortKey, label: '冲稳保', dir: 'asc' },
];

interface Props {
  filters: UniversityQueryParams;
  setFilters: (next: UniversityQueryParams) => void;
}

export function SortCluster({ filters, setFilters }: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 popover
  useEffect(() => {
    if (!moreOpen) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [moreOpen]);

  const set = (key: SortKey, dir: SortDir) =>
    setFilters({ ...filters, sortBy: key, sortOrder: dir, page: 1 });

  const cycle = (key: SortKey, defaultDir: SortDir) => {
    if (filters.sortBy !== key) return set(key, defaultDir);
    if (filters.sortOrder === defaultDir)
      return set(key, defaultDir === 'asc' ? 'desc' : 'asc');
    return set('softRank' as SortKey, 'asc'); // 关闭回默认
  };

  return (
    <div className="sort-cluster">
      {HOT.map((o) => {
        const active = filters.sortBy === o.key;
        const arr = active ? (filters.sortOrder === 'asc' ? '↑' : '↓') : '⇅';
        return (
          <button
            key={o.key}
            type="button"
            className={`sort-btn ${active ? 'is-active' : ''}`}
            onClick={() => cycle(o.key, o.dir)}
          >
            {o.label} <span className="arr">{arr}</span>
          </button>
        );
      })}
      <div style={{ position: 'relative' }} ref={wrapRef}>
        <button type="button" className="sort-btn" onClick={() => setMoreOpen((v) => !v)}>
          更多排序
        </button>
        {moreOpen && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: 'calc(100% + 4px)',
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: 6,
              minWidth: 160,
              boxShadow: '0 8px 24px rgba(0,0,0,.08)',
              zIndex: 20,
            }}
          >
            {MORE.map((o) => {
              const active = filters.sortBy === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    cycle(o.key, o.dir);
                    setMoreOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    border: 0,
                    borderRadius: 6,
                    marginBottom: 2,
                    padding: '6px 10px',
                    fontSize: 12.5,
                    cursor: 'pointer',
                    background: active ? 'var(--primary-fixed)' : 'transparent',
                    color: active ? 'var(--primary)' : 'var(--text-tertiary)',
                  }}
                >
                  {o.label} {active && (filters.sortOrder === 'asc' ? '↑' : '↓')}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
