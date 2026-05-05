// apps/web/src/components/university/campus-location/CampusMap.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { loadAMap } from './amap-loader';
import type { Campus } from './types';

interface CampusMapProps {
  campuses: Campus[];
  selectedCampusId: number;
  height?: number;     // px
}

const DEFAULT_HEIGHT = 480;

// Icon URLs hosted by AMap CDN — official red/blue/green pins.
const MAIN_ICON_URL = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_b.png';
const BRANCH_ICON_URL = 'https://webapi.amap.com/theme/v1.3/markers/n/mark_g.png';

export function CampusMap({ campuses, selectedCampusId, height = DEFAULT_HEIGHT }: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let mapInstance: any = null;

    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        const main = campuses.find((c) => c.isMain) ?? campuses[0];
        mapInstance = new AMap.Map(containerRef.current, {
          zoom: 14,
          center: [main.longitude, main.latitude],
        });

        const markers = campuses.map((c) =>
          new AMap.Marker({
            position: [c.longitude, c.latitude],
            title: c.name,
            icon: c.isMain ? MAIN_ICON_URL : BRANCH_ICON_URL,
          }),
        );
        mapInstance.add(markers);

        if (campuses.length > 1) {
          mapInstance.setFitView(markers, false, [60, 60, 60, 60], 16);
        }
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (mapInstance) {
        try {
          mapInstance.destroy();
        } catch {
          // noop — destroy can throw if already disposed
        }
      }
    };
  }, [campuses, selectedCampusId]);

  if (error) {
    return (
      <div
        className="flex items-center justify-center bg-surface-dim rounded-lg text-sm text-text-muted"
        style={{ height }}
      >
        地图加载失败,请刷新重试
      </div>
    );
  }

  return (
    <div className="relative rounded-lg overflow-hidden" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-surface-dim/50">
          <Spin />
        </div>
      )}
    </div>
  );
}

export default CampusMap;
