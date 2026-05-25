'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
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
 * 院校地图 Tab(完整版 = Batch 1+2+3):
 *
 * 三级行政区下钻 + 区县内单 markers + 顶部面包屑导航。
 *
 * 视图栈 currentPath:
 *   [中国] → 点河北 → [中国, 河北] → 点石家庄 → [中国, 河北, 石家庄]
 *     → 点长安区 → [中国, 河北, 石家庄, 长安区](叶子,渲染单 markers)
 *
 * 渲染规则:
 *   - 叶子之前(country/province/city):子级 polygon + 中心 [name N] 数字标签
 *   - 叶子(district):无 polygon,单院校 markers(按 985/211/双一流/本科/专科 分色) + click 弹卡片
 *
 * 聚合用 subLevel(子级的层级)区分:子级 province → 按 U.province 聚合;
 * city → U.city;district → U.district。
 * 直辖市(北京/上海/天津/重庆) sub features 直接 level=district,自然跳过市级。
 */

const PROVINCE_SUFFIX_RE = /(壮族自治区|维吾尔自治区|回族自治区|特别行政区|自治区|省|市)$/;
// 区/县名(如"武侯区")跟 DB 一致不剥;省/市名剥后缀跟 DB 短名匹配
function normalizeAreaName(full: string, level: string): string {
  if (level === 'district') return full;
  return full.replace(PROVINCE_SUFFIX_RE, '');
}

interface PathNode {
  adcode: number;
  name: string;
  level: 'country' | 'province' | 'city' | 'district';
}

const ROOT: PathNode = { adcode: 100000, name: '中国', level: 'country' };

function aggregateForSubLevel(
  unis: MapUniversity[],
  parent: PathNode,
  subLevel: 'province' | 'city' | 'district',
): Map<string, number> {
  const m = new Map<string, number>();
  for (const u of unis) {
    let key: string | null = null;
    if (parent.level === 'country') {
      key = u.province;
    } else if (parent.level === 'province') {
      if (u.province !== parent.name) continue;
      key = subLevel === 'district' ? u.district : u.city;
    } else if (parent.level === 'city') {
      if (u.city !== parent.name) continue;
      key = u.district;
    }
    if (key) m.set(key, (m.get(key) ?? 0) + 1);
  }
  return m;
}

/** 选出"叶子层"(district)内的所有院校,渲染单 markers */
function pickDistrictUnis(unis: MapUniversity[], path: PathNode[]): MapUniversity[] {
  // path 至少是 [中国, 省, (市), 区];筛 province + (city) + district 匹配的院校
  const province = path.find((n) => n.level === 'province')?.name;
  const city = path.find((n) => n.level === 'city')?.name;
  const district = path.find((n) => n.level === 'district')?.name;
  if (!district) return [];
  return unis.filter((u) => {
    if (district && u.district !== district) return false;
    if (city && u.city !== city) return false;
    if (province && u.province !== province) return false;
    return true;
  });
}

function buildCountLabel(name: string, count: number): string {
  const dim = count === 0 ? 'opacity:0.5;' : '';
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
    ${dim}
  ">
    <span>${name}</span>
    <span style="margin-left:6px;opacity:0.85">${count}</span>
  </div>`;
}

function getDotColor(uni: MapUniversity): string {
  if (uni.is985) return '#d4af37';
  if (uni.is211) return '#9333ea';
  if (uni.isDoubleFirstClass) return '#0ea5e9';
  if (uni.level === '专科') return '#f97316';
  return '#64748b';
}

function buildDotHtml(color: string): string {
  return `<div style="
    width:12px;height:12px;border-radius:50%;
    background:${color};
    border:2px solid #fff;
    box-shadow:0 1px 3px rgba(0,0,0,0.35);
    cursor:pointer;
  "></div>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      <div style="font-weight:600;font-size:14px;color:#0f172a;margin-bottom:4px">${escapeHtml(uni.name)}</div>
      <div style="font-size:11px;color:#64748b;margin-bottom:6px">${escapeHtml(location)}</div>
      <div style="margin-bottom:8px">${tagHtml}</div>
      <a href="/universities/${uni.id}"
         style="display:inline-block;padding:4px 12px;font-size:12px;color:#fff;background:#0f172a;border-radius:4px;text-decoration:none">
        查看详情
      </a>
    </div>
  `;
}

export function MapTab() {
  const filters = useUniversityFilters((s) => s.filters);
  const mapQuery = pickMapFilters(filters);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const explorerRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  const countMarkersRef = useRef<any[]>([]);
  const uniMarkersRef = useRef<any[]>([]);
  const universitiesRef = useRef<MapUniversity[]>([]);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<Error | null>(null);
  const [currentPath, setCurrentPath] = useState<PathNode[]>([ROOT]);

  const {
    data: universities,
    isLoading: dataLoading,
    isError: dataError,
  } = useQuery({
    queryKey: ['universities-map', mapQuery],
    queryFn: () => universityService.getMap(mapQuery),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (universities) universitiesRef.current = universities;
  }, [universities]);

  // Effect 1: 初始化地图 + DistrictExplorer + click handler(仅一次)
  useEffect(() => {
    let cancelled = false;

    Promise.all([loadAMap(), loadDistrictExplorer()])
      .then(([AMap, DistrictExplorer]) => {
        if (cancelled || !containerRef.current) return;
        amapRef.current = AMap;
        mapRef.current = new AMap.Map(containerRef.current, {
          zoom: 4,
          center: [104, 36],
          features: ['bg', 'road'],
        });
        explorerRef.current = new DistrictExplorer({
          map: mapRef.current,
          eventSupport: true,
        });
        infoWindowRef.current = new AMap.InfoWindow({
          offset: new AMap.Pixel(0, -12),
          closeWhenClickMap: true,
        });

        // polygon 点击 → 下钻一级(包括 district,作为叶子)
        explorerRef.current.on('featureClick', (_e: any, feature: any) => {
          const level: PathNode['level'] = feature.properties.level;
          const adcode: number = feature.properties.adcode;
          const shortName = normalizeAreaName(feature.properties.name, level);
          setCurrentPath((prev) => {
            // 已是当前层级最后一项 → 不重复 push
            if (prev[prev.length - 1]?.adcode === adcode) return prev;
            return [...prev, { adcode, name: shortName, level }];
          });
        });

        setMapReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setMapError(err);
      });

    return () => {
      cancelled = true;
      countMarkersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* noop */ }
      });
      countMarkersRef.current = [];
      uniMarkersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* noop */ }
      });
      uniMarkersRef.current = [];
      if (explorerRef.current) {
        try { explorerRef.current.clearFeaturePolygons(); } catch { /* noop */ }
      }
      if (mapRef.current) {
        try { mapRef.current.destroy(); } catch { /* noop */ }
        mapRef.current = null;
      }
    };
  }, []);

  // Effect 2: 渲染当前层级(map 就绪 + 数据到位 + path 变化时)
  useEffect(() => {
    if (!mapReady || !universities) return;
    const explorer = explorerRef.current;
    const map = mapRef.current;
    const AMap = amapRef.current;
    if (!explorer || !map || !AMap) return;

    const current = currentPath[currentPath.length - 1];

    // 公共清理:每次重渲都先把 polygon + 数字标签 + 单 markers 清掉
    const clearAll = () => {
      try { explorer.clearFeaturePolygons(); } catch { /* noop */ }
      countMarkersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* noop */ }
      });
      countMarkersRef.current = [];
      uniMarkersRef.current.forEach((m) => {
        try { m.setMap(null); } catch { /* noop */ }
      });
      uniMarkersRef.current = [];
      try { infoWindowRef.current?.close(); } catch { /* noop */ }
    };

    explorer.loadAreaNode(current.adcode, (err: any, areaNode: any) => {
      if (err) {
        console.error('DistrictExplorer loadAreaNode failed:', current, err);
        return;
      }

      clearAll();

      // 叶子(district):画单 markers,不画 polygon/数字标签
      if (current.level === 'district') {
        const districtUnis = pickDistrictUnis(universities, currentPath);
        districtUnis.forEach((u) => {
          const marker = new AMap.Marker({
            position: [u.lng, u.lat],
            content: buildDotHtml(getDotColor(u)),
            offset: new AMap.Pixel(-8, -8),
            anchor: 'top-left',
            cursor: 'pointer',
          });
          marker.on('click', () => {
            if (!infoWindowRef.current) return;
            infoWindowRef.current.setContent(buildInfoHtml(u));
            infoWindowRef.current.open(map, [u.lng, u.lat]);
          });
          map.add(marker);
          uniMarkersRef.current.push(marker);
        });
        try {
          map.setBounds(areaNode.getBounds(), false, [60, 60, 60, 60]);
        } catch (e) {
          console.warn('setBounds failed for district', current, e);
        }
        return;
      }

      // 非叶子:子级 polygon + 数字标签
      explorer.renderSubFeatures(areaNode, () => ({
        cursor: 'pointer',
        bubble: true,
        strokeColor: '#94a3b8',
        strokeWeight: 1.2,
        strokeOpacity: 0.75,
        fillColor: '#cbd5e1',
        fillOpacity: 0.25,
      }));

      const subs: any[] = areaNode.getSubFeatures();
      if (subs.length === 0) return;

      const subLevel: 'province' | 'city' | 'district' =
        subs[0].properties.level ?? 'province';
      const counts = aggregateForSubLevel(universities, current, subLevel);

      subs.forEach((feature: any) => {
        const fLevel: PathNode['level'] = feature.properties.level;
        const shortName = normalizeAreaName(feature.properties.name, fLevel);
        const count = counts.get(shortName) ?? 0;
        const center = feature.properties.center || feature.properties.centroid;
        if (!center) return;

        const marker = new AMap.Marker({
          position: center,
          content: buildCountLabel(shortName, count),
          offset: new AMap.Pixel(-40, -12),
          anchor: 'top-left',
          clickable: false,
          bubble: true,
          zIndex: 200,
        });
        map.add(marker);
        countMarkersRef.current.push(marker);
      });

      // 平滑 setBounds:除初始全国视图外都 fly to(默认带动画)
      if (current.level !== 'country') {
        try {
          map.setBounds(areaNode.getBounds(), false, [60, 60, 60, 60]);
        } catch (e) {
          console.warn('setBounds failed for', current, e);
        }
      }
    });
  }, [mapReady, universities, currentPath]);

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
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        {/* 面包屑导航:点任一级回到该层 */}
        <div className="flex items-center gap-2">
          {currentPath.map((p, i) => (
            <Fragment key={`${p.adcode}-${i}`}>
              {i > 0 && <span className="text-text-faint">/</span>}
              {i === currentPath.length - 1 ? (
                <span className="font-medium text-text">{p.name}</span>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPath((prev) => prev.slice(0, i + 1))
                  }
                  className="border-0 bg-transparent p-0 text-primary hover:underline cursor-pointer"
                >
                  {p.name}
                </button>
              )}
            </Fragment>
          ))}
        </div>
        <span className="text-text-muted">
          {dataLoading
            ? '加载院校位置中...'
            : dataError
            ? '数据加载失败'
            : `共 ${universities?.length ?? 0} 所院校（含坐标）`}
        </span>
      </div>
      <div
        className="relative overflow-hidden rounded-xl bg-surface shadow-card"
        style={{ height: 640 }}
      >
        <div ref={containerRef} className="h-full w-full" />
        {!mapReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface-dim/50">
            <Spin />
          </div>
        )}
      </div>
    </div>
  );
}
