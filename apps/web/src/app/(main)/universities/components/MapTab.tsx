'use client';

import { useEffect, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { universityService, type MapUniversity } from '@/services/university';
import { loadAMap } from '@/components/university/campus-location/amap-loader';
import {
  useUniversityFilters,
  pickMapFilters,
} from '@/stores/universityFilterStore';

/**
 * 院校地图 Tab。流程:
 * 1. loadAMap() → 加载 AMap.MarkerCluster 插件
 * 2. 初始化地图(中国中心 zoom 5),一次性创建,filter 改不重建
 * 3. 拉 /universities/map(filter 联动)
 * 4. 数据到位后,创建 MarkerCluster:每点按类型分色,点 cluster 自动放大,
 *    点单 marker 弹 InfoWindow(校名 + 标签 + 详情链接)
 */

/** marker 按类型分色,见 getDotColor 注释 */
function getDotColor(uni: MapUniversity): string {
  // 优先级 985 > 211 > 双一流 > 本科 > 专科
  if (uni.is985) return '#d4af37'; // 金
  if (uni.is211) return '#9333ea'; // 紫
  if (uni.isDoubleFirstClass) return '#0ea5e9'; // 蓝
  if (uni.level === '专科') return '#f97316'; // 橙
  return '#64748b'; // 灰(普通本科)
}

function buildDotHtml(color: string): string {
  return `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`;
}

function buildInfoHtml(uni: MapUniversity): string {
  const tags: string[] = [];
  if (uni.is985) tags.push('985');
  if (uni.is211) tags.push('211');
  if (uni.isDoubleFirstClass) tags.push('双一流');
  if (uni.type) tags.push(uni.type);
  if (uni.level) tags.push(uni.level);

  const location = [uni.province, uni.city, uni.district].filter(Boolean).join(' · ');
  const tagHtml = tags
    .map(
      (t) =>
        `<span style="display:inline-block;padding:1px 6px;margin-right:4px;font-size:11px;background:#f1f5f9;border-radius:3px;color:#475569">${escapeHtml(t)}</span>`,
    )
    .join('');

  return `
    <div style="min-width:200px;padding:4px 2px;font-family:inherit">
      <div style="font-weight:600;font-size:14px;color:#0f172a;margin-bottom:4px">${escapeHtml(
        uni.name,
      )}</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">${escapeHtml(location)}</div>
      <div style="margin-bottom:8px">${tagHtml}</div>
      <a href="/universities/${uni.id}"
         style="display:inline-block;padding:4px 12px;font-size:12px;color:#fff;background:#0f172a;border-radius:4px;text-decoration:none">
        查看详情
      </a>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function MapTab() {
  const filters = useUniversityFilters((s) => s.filters);
  const mapQuery = pickMapFilters(filters);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const clusterRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const amapRef = useRef<any>(null);

  const [mapLoading, setMapLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<Error | null>(null);

  const { data: universities, isLoading: dataLoading, isError: dataError } = useQuery({
    queryKey: ['universities-map', mapQuery],
    queryFn: () => universityService.getMap(mapQuery),
    staleTime: 60_000,
  });

  // Effect 1: 初始化地图(仅一次)。MarkerCluster/HeatMap 已在 loadAMap 的
  // plugins 里预声明(amap-loader.ts),这里直接 new 即可。
  useEffect(() => {
    let cancelled = false;
    loadAMap()
      .then((AMap) => {
        if (cancelled || !containerRef.current) return;
        amapRef.current = AMap;
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 5,
          center: [104, 36],
        });
        infoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -10),
          closeWhenClickMap: true,
        });
        setMapLoading(false);
        setMapReady(true); // 通知 Effect 2 可以建 cluster 了(否则数据先到时会被早退)
      })
      .catch((err) => {
        if (cancelled) return;
        setMapError(err);
        setMapLoading(false);
      });

    return () => {
      cancelled = true;
      if (clusterRef.current) {
        try {
          clusterRef.current.setMap(null);
        } catch {
          // noop
        }
        clusterRef.current = null;
      }
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

  // Effect 2: 数据/filter 变化(且 map 就绪)时重建 cluster
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!map || !AMap || !universities) return;

    // 清掉旧 cluster
    if (clusterRef.current) {
      try {
        clusterRef.current.setMap(null);
      } catch {
        // noop
      }
      clusterRef.current = null;
    }
    if (universities.length === 0) return;

    const points = universities.map((u) => ({
      lnglat: [u.lng, u.lat] as [number, number],
      data: u,
    }));

    clusterRef.current = new AMap.MarkerCluster(map, points, {
      gridSize: 60,
      maxZoom: 14,
      // 单点 marker:按类型分色
      renderMarker: (context: any) => {
        const uni: MapUniversity = context.data[0].data;
        context.marker.setContent(buildDotHtml(getDotColor(uni)));
        context.marker.setOffset(new AMap.Pixel(-7, -7));
        context.marker.on('click', () => {
          if (!infoWindowRef.current) return;
          infoWindowRef.current.setContent(buildInfoHtml(uni));
          infoWindowRef.current.open(map, [uni.lng, uni.lat]);
        });
      },
    });

    // 聚合 marker 点击:自动 fitBounds 到该聚合点范围(放大)
    clusterRef.current.on('click', (e: any) => {
      const { clusterData, lnglat } = e;
      if (!clusterData || clusterData.length <= 1) return;
      const bounds = new AMap.Bounds(lnglat, lnglat);
      clusterData.forEach((p: any) => bounds.extend(p.lnglat));
      map.setBounds(bounds, false, [40, 40, 40, 40]);
    });
  }, [universities, mapReady]);

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
        {/* 颜色图例 */}
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#d4af37' }} />
            985
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#9333ea' }} />
            211
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#0ea5e9' }} />
            双一流
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#64748b' }} />
            本科
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: '#f97316' }} />
            专科
          </span>
        </div>
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
