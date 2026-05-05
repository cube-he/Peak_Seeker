// apps/web/src/components/university/campus-location/CampusInfo.tsx
'use client';

import { EnvironmentOutlined } from '@ant-design/icons';
import type { Campus } from './types';

interface CampusInfoProps {
  campus: Campus;
}

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function CampusInfo({ campus }: CampusInfoProps) {
  const cityLine = [campus.city, campus.district].filter(Boolean).join(' · ');

  return (
    <div className="bg-surface-dim rounded-lg p-3 mb-3">
      <div className="font-serif text-base font-semibold text-text mb-1">
        {campus.name}
        {campus.isMain && (
          <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-primary-fixed text-primary font-medium">
            主校区
          </span>
        )}
      </div>
      {cityLine && (
        <div className="flex items-center gap-1 text-xs text-text-tertiary mb-1">
          <EnvironmentOutlined />
          <span>{cityLine}</span>
        </div>
      )}
      {campus.address && (
        <div className="text-xs text-text-muted truncate" title={campus.address}>
          {campus.address}
        </div>
      )}
      {campus.distanceToCityCenter != null && (
        <div className="text-xs text-text-tertiary mt-2">
          距市中心 {formatKm(campus.distanceToCityCenter)}
        </div>
      )}
    </div>
  );
}

export default CampusInfo;
