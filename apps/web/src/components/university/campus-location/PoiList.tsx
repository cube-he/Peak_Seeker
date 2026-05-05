// apps/web/src/components/university/campus-location/PoiList.tsx
'use client';

import * as React from 'react';
import { Spin } from 'antd';
import { usePoi } from './usePoi';
import type { PoiCategory } from './types';

interface PoiListProps {
  universityId: number;
  campusId: number | null;
  category: PoiCategory;
  limit?: number;
}

const CATEGORY_LABELS: Record<PoiCategory, string> = {
  subway: '最近地铁',
  mall: '周边商圈',
  airport: '最近机场',
};

const CATEGORY_ICONS: Record<PoiCategory, string> = {
  subway: '🚇',
  mall: '🛍',
  airport: '✈️',
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

export function PoiList({ universityId, campusId, category, limit }: PoiListProps) {
  const { data, isLoading, isError } = usePoi({ universityId, campusId, category, limit });

  return (
    <div>
      <div className="flex items-center gap-1 mb-2 text-sm text-text-tertiary">
        <span>{CATEGORY_ICONS[category]}</span>
        <span>{CATEGORY_LABELS[category]}</span>
      </div>
      {isLoading && <Spin size="small" />}
      {isError && (
        <div className="text-xs text-text-muted">暂时无法加载{CATEGORY_LABELS[category]}信息</div>
      )}
      {!isLoading && !isError && data && data.length === 0 && (
        <div className="text-xs text-text-muted">暂无周边{CATEGORY_LABELS[category]}信息</div>
      )}
      {!isLoading && !isError && data && data.length > 0 && (
        <ul className="space-y-1.5">
          {data.map((p) => (
            <li key={p.id} className="flex justify-between gap-3 text-sm">
              <span className="truncate text-text-secondary">{p.name}</span>
              <span className="shrink-0 text-text-tertiary [font-variant-numeric:tabular-nums]">
                {formatDistance(p.distance)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default PoiList;
