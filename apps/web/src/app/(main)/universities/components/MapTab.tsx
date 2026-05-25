'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Spin } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { universityService, type MapUniversity } from '@/services/university';
import {
  loadAMap,
  loadDistrictExplorer,
} from '@/components/university/campus-location/amap-loader';
import {
  useUniversityFilters,
  pickMapFilters,
} from '@/stores/universityFilterStore';

/**
 * 院校地图 Tab — Batch 1:基于 AMapUI.DistrictExplorer 的全国视图。
 * - 加载 adcode=100000(全国),renderSubFeatures 画 32 省 polygon
 * - 每省 centroid 上叠数字标签 `省名 N`(N=该省院校数)
 * - 点 polygon / 单 markers / 面包屑 在 Batch 2+3 接入
 */

// 把 "河北省" / "新疆维吾尔自治区" / "广西壮族自治区" 等行政全名 → 短名,
// 跟 University.province (DB 里 "河北" / "新疆" / "广西") 匹配。
// 后缀按长度倒序:更长的特殊后缀先匹配。
const PROVINCE_SUFFIX_RE = /(壮族自治区|维吾尔自治区|回族自治区|特别行政区|自治区|省|市)$/;
function normalizeProvinceName(full: string): string {
  return full.replace(PROVINCE_SUFFIX_RE, '');
}

function aggregateByProvince(unis: MapUniversity[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of unis) {
    if (!u.province) continue;
    m.set(u.province, (m.get(u.province) ?? 0) + 1);
  }
  return m;
}

function buildCountLabel(name: string, count: number): string {
  return `<div style="
    padding:4px 10px;
    border-radius:14px;
    background:rgba(15,23,42,0.88);
    color:#fff;
    font-size:12px;
    font-weight:500;
    white-space:nowrap;
    box-shadow:0 2px 6px rgba(0,0,0,0.25);
    border:1px solid rgba(255,255,255,0.12);
    pointer-events:none;
  ">
    <span>${name}</span>
    <span style="margin-left:6px;opacity:0.85">${count}</span>
  </div>`;
}

export function MapTab() {
  const filters = useUniversityFilters((s) => s.filters);
  const mapQuery = pickMapFilters(filters);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const explorerRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const countMarkersRef = useRef<any[]>([]);

  const [mapLoading, setMapLoading] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<Error | null>(null);

  const {
    data: universities,
    isLoading: dataLoading,
    isError: dataError,
  } = useQuery({
    queryKey: ['universities-map', mapQuery],
    queryFn: () => universityService.getMap(mapQuery),
    staleTime: 60_000,
  });

  const provinceCount = useMemo(
    () => (universities ? aggregateByProvince(universities) : new Map<string, number>()),
    [universities],
  );

  // Effect 1: 初始化地图 + DistrictExplorer(仅一次)
  useEffect(() => {
    let cancelled = false;
    Promise.all([loadAMap(), loadDistrictExplorer()])
      .then(([AMap, DistrictExplorer]) => {
        if (cancelled || !containerRef.current) return;
        amapRef.current = AMap;
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 4,
          center: [104, 36],
          // 默认地图自带省市边界会跟我们的 polygon 重叠;关闭 building 减少噪音
          features: ['bg', 'road'],
        });
        explorerRef.current = new DistrictExplorer({
          map: mapRef.current,
          eventSupport: true,
        });
        setMapLoading(false);
        setMapReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setMapError(err);
        setMapLoading(false);
      });

    return () => {
      cancelled = true;
      countMarkersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* noop */ }
      });
      countMarkersRef.current = [];
      if (explorerRef.current) {
        try { explorerRef.current.clearFeaturePolygons(); } catch { /* noop */ }
      }
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch { /* noop */ }
        mapRef.current = null;
      }
    };
  }, []);

  // Effect 2: map 就绪 + 数据到位 → 画省级 polygon + 数字标签
  useEffect(() => {
    if (!mapReady) return;
    const explorer = explorerRef.current;
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!explorer || !map || !AMap || !universities) return;

    explorer.loadAreaNode(100000, (err: any, areaNode: any) => {
      if (err) {
        console.error('DistrictExplorer loadAreaNode(全国) failed:', err);
        return;
      }
      // 清前一轮(filter 切换重渲染)
      explorer.clearFeaturePolygons();
      countMarkersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* noop */ }
      });
      countMarkersRef.current = [];

      // 32 省 polygon — 灰色边、淡色填充
      explorer.renderSubFeatures(areaNode, () => ({
        cursor: 'pointer',
        bubble: true,
        strokeColor: '#94a3b8',
        strokeWeight: 1.2,
        strokeOpacity: 0.75,
        fillColor: '#cbd5e1',
        fillOpacity: 0.25,
      }));

      // 每省中心叠数字标签
      const subs: any[] = areaNode.getSubFeatures();
      subs.forEach((feature: any) => {
        const fullName: string = feature.properties.name;
        const shortName = normalizeProvinceName(fullName);
        const count = provinceCount.get(shortName) ?? 0;
        // DistrictExplorer 的 centroid 字段名是 'center'(数组 [lng, lat]),
        // 个别 feature 可能没有 — 退化到 polygon bounds 中心
        const center = feature.properties.center || feature.properties.centroid;
        if (!center) return;

        const marker = new AMap.Marker({
          position: center,
          content: buildCountLabel(shortName, count),
          // 标签 ~80x24,offset 让标签锚点居中
          offset: new AMap.Pixel(-40, -12),
          anchor: 'top-left',
          clickable: false, // 让 polygon 收事件,不被标签拦截
          bubble: true,
          zIndex: 200,
        });
        map.add(marker);
        countMarkersRef.current.push(marker);
      });
    });
  }, [mapReady, universities, provinceCount]);

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
            : `共 ${universities?.length ?? 0} 所院校（含坐标）— 点击省份进入下一级（Batch 2 接入）`}
        </span>
      </div>
      <div
        className="relative overflow-hidden rounded-xl bg-surface shadow-card"
        style={{ height: 640 }}
      >
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
