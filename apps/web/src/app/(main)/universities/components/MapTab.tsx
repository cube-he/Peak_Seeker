'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { universityService } from '@/services/university';
import { loadAMap } from '@/components/university/campus-location/amap-loader';
import {
  useUniversityFilters,
  pickMapFilters,
} from '@/stores/universityFilterStore';

/**
 * 院校地图 Tab(阶段 A 骨架):
 * - 默认中国中心 [104, 36],zoom 5
 * - 拉 /universities/map(filter 来自共享 store)
 * - 这一版只渲染空地图,marker 集群 + popover + drill 在阶段 B/C 加
 */
export function MapTab() {
  const filters = useUniversityFilters((s) => s.filters);
  const mapQuery = pickMapFilters(filters);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<Error | null>(null);

  // 拉院校点(给阶段 B 的 markers 用,这一版只触发请求 + 缓存)
  const { data: universities, isLoading: dataLoading, isError: dataError } = useQuery({
    queryKey: ['universities-map', mapQuery],
    queryFn: () => universityService.getMap(mapQuery),
    staleTime: 60_000,
  });

  // AMap 实例化(只跑一次,filter 改不重建地图)
  useEffect(() => {
    let cancelled = false;
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 5,
          center: [104, 36], // 中国大致中心
        });
        setMapLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setMapError(err);
        setMapLoading(false);
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        try {
          mapRef.current.destroy();
        } catch {
          // noop
        }
        mapRef.current = null;
      }
    };
  }, []);

  if (mapError) {
    return (
      <div className="rounded-xl bg-surface p-6 shadow-card">
        <Alert
          type="error"
          showIcon
          message="地图加载失败"
          description={mapError.message}
        />
      </div>
    );
  }

  return (
    <div className="pb-12">
      <div className="mb-3 flex items-center justify-between text-sm text-text-muted">
        <span>
          {dataLoading
            ? '加载院校位置中...'
            : dataError
            ? '数据加载失败'
            : `共 ${universities?.length ?? 0} 所院校（含坐标）`}
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl bg-surface shadow-card" style={{ height: 640 }}>
        <div ref={containerRef} className="h-full w-full" />
        {mapLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-dim/50">
            <Spin />
          </div>
        )}
      </div>
    </div>
  );
}
