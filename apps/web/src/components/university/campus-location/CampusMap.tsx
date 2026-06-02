// apps/web/src/components/university/campus-location/CampusMap.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { loadAMap } from './amap-loader';
import type { Campus } from './types';

interface CampusMapProps {
  campuses: Campus[];
  height?: number;     // px
  onSelectCampus?: (campusId: number) => void;
}

const DEFAULT_HEIGHT = 480;

// 2026-06-02 fix:之前用的 https://webapi.amap.com/theme/v1.3/markers/n/mark_g.png
// 在高德 CDN 已失效(naturalWidth=0,加载失败)→ 分校 pin 不显示、setFitView 误把
// 它当不存在 → 主图保持初始 zoom,分校 marker 飘到屏幕外。
// 改用内联 SVG data URL,不再依赖第三方 CDN,稳定。
function pinSvgDataUrl(fill: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36">` +
    `<path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 22 14 22s14-11.5 14-22C28 6.3 21.7 0 14 0z" ` +
    `fill="${fill}" stroke="white" stroke-width="2"/>` +
    `<circle cx="14" cy="14" r="5" fill="white"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const MAIN_PIN_URL = pinSvgDataUrl('#2563eb');   // 蓝 — 主校区
const BRANCH_PIN_URL = pinSvgDataUrl('#16a34a'); // 绿 — 分校区

export function CampusMap({
  campuses,
  height = DEFAULT_HEIGHT,
  onSelectCampus,
}: CampusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  // 用 ref 保最新 onSelectCampus,让 useEffect 不必依赖它(避免每次父 rerender 都重建地图)
  const onSelectRef = useRef(onSelectCampus);
  useEffect(() => {
    onSelectRef.current = onSelectCampus;
  }, [onSelectCampus]);

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

        const markers = campuses.map((c) => {
          // 完全跟旧版 PNG 一样的 API 形态 — 只把 url 换成 inline SVG data URL。
          // 加 offset/anchor 会让 SDK 内部计算出错,瓦片不加载(实测)。
          const marker = new AMap.Marker({
            position: [c.longitude, c.latitude],
            title: c.name,
            icon: c.isMain ? MAIN_PIN_URL : BRANCH_PIN_URL,
          });
          marker.on('click', () => {
            onSelectRef.current?.(c.id);
          });
          return marker;
        });
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
    // 注意:依赖只有 campuses。selectedCampusId 变化不再重建地图(切换器影响的是
    // 右侧 panel,地图保持全校区视野;onSelectCampus 用 ref 拿最新值,不进依赖)。
  }, [campuses]);

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
