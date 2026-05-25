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
 * 院校地图 Tab(4 层下钻:全国 → 省 → 市 → 区县 → 学校 markers):
 *
 *   [全国] → 点河北 → [全国, 河北] → 点石家庄 → [全国, 河北, 石家庄]
 *     → 点长安区 → [全国, 河北, 石家庄, 长安区](叶子,渲染 markers)
 *
 * 渲染规则:
 *   - 全国:32 省 polygon + 每省 [省名 N] 数字标签
 *   - 省:各市 polygon + [市名 N] 数字标签
 *   - 市:各区/县 polygon + [区名 N] 数字标签
 *   - 区/县(叶子):该区/县内院校 markers(按 985/211/双一流/本科/专科 分色),
 *     click 弹卡片 + 跳详情
 *   - 直辖市(北京/上海/天津/重庆) sub features 直接是 district,
 *     省级点击进入直接看到「市 = 直辖市」的各区,再点区到 markers
 *
 * 视野控制:
 *   - 点省/市/区 → 平滑 setBounds 动画到对应行政区
 *   - 点"全国"面包屑 → setZoomAndCenter(4, [104,36], true) 即时还原,无动画
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

const ROOT: PathNode = { adcode: 100000, name: '全国', level: 'country' };
const ROOT_CENTER: [number, number] = [104, 36];
const ROOT_ZOOM = 4;

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

/** 选出当前 path 范围内的所有院校(只在 district 叶子或子级空时调用)。
 *  限定 province + (可选 city,直辖市可能缺) + (可选 district) */
function pickUnisInScope(unis: MapUniversity[], path: PathNode[]): MapUniversity[] {
  const province = path.find((n) => n.level === 'province')?.name;
  const city = path.find((n) => n.level === 'city')?.name;
  const district = path.find((n) => n.level === 'district')?.name;
  if (!province) return [];
  return unis.filter((u) => {
    if (u.province !== province) return false;
    if (city && u.city !== city) return false;
    if (district && u.district !== district) return false;
    return true;
  });
}

function buildCountLabel(name: string, count: number): string {
  const dim = count === 0 ? 'opacity:0.5;' : '';
  // 不能 pointer-events:none — 这个 label 自己要接 click 触发下钻
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
    cursor:pointer;
    user-select:none;
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

        // polygon 点击 → 下钻一级(province/city/district 都可点,district 是叶子)
        explorerRef.current.on('featureClick', (_e: any, feature: any) => {
          const level: PathNode['level'] = feature.properties.level;
          const adcode: number = feature.properties.adcode;
          const shortName = normalizeAreaName(feature.properties.name, level);
          setCurrentPath((prev) => {
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
      const m = mapRef.current;
      countMarkersRef.current.forEach((marker) => {
        try { m?.remove(marker); } catch { /* noop */ }
      });
      countMarkersRef.current = [];
      uniMarkersRef.current.forEach((marker) => {
        try { m?.remove(marker); } catch { /* noop */ }
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

    // 公共清理:每次重渲都先把 polygon + 数字标签 + 单 markers 清掉。
    // 注:marker.setMap(null) 在 AMap 2.0 + DistrictExplorer 组合下可能静默失败,
    // 用 map.remove(marker) 才稳。
    const clearAll = () => {
      try { explorer.clearFeaturePolygons(); } catch { /* noop */ }
      countMarkersRef.current.forEach((m) => {
        try { map.remove(m); } catch { /* noop */ }
      });
      countMarkersRef.current = [];
      uniMarkersRef.current.forEach((m) => {
        try { map.remove(m); } catch { /* noop */ }
      });
      uniMarkersRef.current = [];
      try { infoWindowRef.current?.close(); } catch { /* noop */ }
    };

    explorer.loadAreaNode(current.adcode, (err: any, areaNode: any) => {
      if (err) {
        console.error('[map] loadAreaNode failed:', current, err);
        return;
      }

      clearAll();

      const subs: any[] = areaNode.getSubFeatures();
      const subLevel: 'province' | 'city' | 'district' | undefined =
        subs[0]?.properties.level;
      // 诊断:看 loadAreaNode 在每一层返回的 sub features 数量 + 层级
      console.log(
        `[map] level=${current.level} adcode=${current.adcode} name=${current.name}`,
        `subs=${subs.length} subLevel=${subLevel ?? '(none)'}`,
        subs.length > 0 && subs.length <= 5
          ? subs.map((s) => s.properties.name)
          : '',
      );

      // markers 模式只在叶子(district)触发;subs 为空也兜底显示 markers
      const showMarkers = current.level === 'district' || subs.length === 0;

      if (showMarkers) {
        const scopeUnis = pickUnisInScope(universities, currentPath);
        scopeUnis.forEach((u) => {
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
          console.warn('setBounds failed (markers)', current, e);
        }
        return;
      }

      // 非 markers 模式:子级 polygon + 数字标签(全国 view / 非直辖省 view)
      explorer.renderSubFeatures(areaNode, () => ({
        cursor: 'pointer',
        bubble: true,
        strokeColor: '#94a3b8',
        strokeWeight: 1.2,
        strokeOpacity: 0.75,
        fillColor: '#cbd5e1',
        fillOpacity: 0.25,
      }));

      if (subs.length === 0) return;

      const counts = aggregateForSubLevel(universities, current, subLevel ?? 'province');
      subs.forEach((feature: any) => {
        const fLevel: PathNode['level'] = feature.properties.level;
        const shortName = normalizeAreaName(feature.properties.name, fLevel);
        const count = counts.get(shortName) ?? 0;
        const center = feature.properties.center || feature.properties.centroid;
        if (!center) return;

        // label 自己可点,而不是靠"事件穿透到 polygon"——AMap.Marker 即便
        // clickable:false + 内联 pointer-events:none 仍会吃掉点击,导致
        // featureClick 不触发。直接给 label 绑 click handler dispatch 下钻。
        const fAdcode: number = feature.properties.adcode;
        const marker = new AMap.Marker({
          position: center,
          content: buildCountLabel(shortName, count),
          offset: new AMap.Pixel(-40, -12),
          anchor: 'top-left',
          clickable: true,
          cursor: 'pointer',
          zIndex: 200,
        });
        marker.on('click', () => {
          setCurrentPath((prev) => {
            if (prev[prev.length - 1]?.adcode === fAdcode) return prev;
            return [...prev, { adcode: fAdcode, name: shortName, level: fLevel }];
          });
        });
        map.add(marker);
        countMarkersRef.current.push(marker);
      });

      // 视野控制:
      //   - 全国:即时还原 zoom+center(无动画),让点"全国"面包屑能"直接还原"
      //   - 省:平滑 fly to 该省 bounds
      if (current.level === 'country') {
        map.setZoomAndCenter(ROOT_ZOOM, ROOT_CENTER, true);
      } else {
        try {
          map.setBounds(areaNode.getBounds(), false, [60, 60, 60, 60]);
        } catch (e) {
          console.warn('setBounds failed (polygon)', current, e);
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
