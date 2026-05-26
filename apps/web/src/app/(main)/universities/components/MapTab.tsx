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
import { MapFilterBar } from './MapFilterBar';

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
// 全国视野:zoom 5 + center [104, 36] + container height 760 → 视野紧贴中国。
// 历史: setBounds(china_bbox) 实测在 AMap v2.0 silent fail,zoom 不变。
// 改 zoom 4 → 5 后 lng range 从 131° → 66°,东到 137 西到 71 基本只露中国 ±2°
// 边缘缓冲;配合 container height 760(aspect 1500/760 ≈ 1.97) lat range
// ~33° 也基本覆盖中国 36° lat。海南 18 / 漠河 54 各切 ~1°,可接受。
const ROOT_CENTER: [number, number] = [104, 36];
const ROOT_ZOOM = 5;

// 各层级目标 zoom(经验值,覆盖大省、中等市、小区县)。比 setBounds 自动算更稳定:
// 经验上 setBounds 在 renderSubFeatures 刚完成时 AMap 内部 layout 还在收敛,
// 自动 zoom 经常算偏低导致视野过广;固定 zoom + setZoomAndCenter 更可控。
const TARGET_ZOOM: Record<PathNode['level'], number> = {
  country: 5,
  province: 7,
  city: 10,
  district: 12,
};

// 学校 dot 尺寸按层级递增:全国时只是个细密点(类 heatmap),
// 越深入区/县 dot 越大、信息密度越高。视觉随放大有自然反馈。
const DOT_SIZE_BY_LEVEL: Record<PathNode['level'], number> = {
  country: 6,
  province: 10,
  city: 14,
  district: 18,
};

// 区域填充色:12 色 pastel 调色板(Tailwind -200 系列),按 adcode % 12 取色。
// 用 adcode 取色而非 index 保证同省/同市每次刷新颜色固定,用户能形成位置记忆。
// 配合 fillOpacity 0.25 视觉很淡,不会盖住 dot 和数字 label。
const REGION_COLORS = [
  '#fde68a', // amber
  '#fed7aa', // orange
  '#fecaca', // red
  '#fbcfe8', // pink
  '#ddd6fe', // violet
  '#c7d2fe', // indigo
  '#bfdbfe', // blue
  '#a5f3fc', // cyan
  '#a7f3d0', // emerald
  '#bbf7d0', // green
  '#d9f99d', // lime
  '#fef3c7', // yellow
];
function getRegionFill(adcode: number): string {
  return REGION_COLORS[Math.abs(adcode) % REGION_COLORS.length];
}

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

/** 选出当前 path 范围内的所有院校。
 *  从 path 末尾向前找每个 level 的 name(防御性:path 万一有重复项时,
 *  取最后那个才是当前位置;比 path.find(首个匹配)更鲁棒)。 */
function pickUnisInScope(unis: MapUniversity[], path: PathNode[]): MapUniversity[] {
  let province: string | undefined;
  let city: string | undefined;
  let district: string | undefined;
  for (let i = path.length - 1; i >= 0; i--) {
    const n = path[i];
    if (n.level === 'district' && district === undefined) district = n.name;
    else if (n.level === 'city' && city === undefined) city = n.name;
    else if (n.level === 'province' && province === undefined) province = n.name;
  }
  if (!province) return [];
  return unis.filter((u) => {
    if (u.province !== province) return false;
    if (city && u.city !== city) return false;
    if (district && u.district !== district) return false;
    return true;
  });
}

/** dispatch 下钻:已在 path 中的 area 走 slice 回退;否则 push。
 *  防御 user 反复点同名 polygon 把 path 撑长(每次只 dedup 末项的旧逻辑漏过) */
function buildDrillUpdater(adcode: number, name: string, level: PathNode['level']) {
  return (prev: PathNode[]) => {
    const existing = prev.findIndex((n) => n.adcode === adcode);
    if (existing >= 0) return prev.slice(0, existing + 1);
    return [...prev, { adcode, name, level }];
  };
}

// 学校 marker 颜色 = 主色(档次,5 级互斥) + 边框(办学性质,2 类) 双通道 encoding。
//   主色优先级: 985 > 211 > 双一流 > 本科 > 专科(取第一个命中的)
//   边框: 民办 = 深红 #b91c1c(粗 2.5px) / 其他(公办、合作办学等) = 白 2px
// 这样同一张图能同时读出"档次"和"是否民办",比单纯 7 色优先级链更直观——
// 985 不会因为也"是公办"被淹没,民办本科 / 民办专科 这种风险/学费敏感档次
// 也能一眼跟同档次公办区分。
type MarkerStyle = { fill: string; stroke: string; strokeWidth: number };
const TIER_COLORS = {
  is985: '#d4af37',          // 金
  is211: '#9333ea',          // 紫
  doubleFirstClass: '#0ea5e9',// 蓝
  bachelor: '#16a34a',       // 绿
  diploma: '#f97316',        // 橙
} as const;
const NATURE_STROKE = {
  publicLike: { stroke: '#ffffff', width: 2 },     // 公办 / 合作办学 等
  private: { stroke: '#b91c1c', width: 2.5 },      // 民办
} as const;
function getMarkerStyle(uni: MapUniversity): MarkerStyle {
  let fill: string;
  if (uni.is985) fill = TIER_COLORS.is985;
  else if (uni.is211) fill = TIER_COLORS.is211;
  else if (uni.isDoubleFirstClass) fill = TIER_COLORS.doubleFirstClass;
  else if (uni.level === '专科') fill = TIER_COLORS.diploma;
  else fill = TIER_COLORS.bachelor; // 默认按本科算(数据里 level 不一定填,但走到这里非专科非双一流非 211/985,基本是本科)
  const isPrivate = uni.nature === '民办';
  const s = isPrivate ? NATURE_STROKE.private : NATURE_STROKE.publicLike;
  return { fill, stroke: s.stroke, strokeWidth: s.width };
}

/** 院校 marker 的色点 icon(给 AMap.LabelMarker 用)。返回 SVG data URI。
 *  size x size 圆点,fill = 档次色,stroke = 办学性质色。
 *  size 默认 18(district view),全国/省/市 view 用更小的尺寸传入。
 *
 *  stroke 宽度按 size 比例缩放(基准 size=18 用 style.strokeWidth):
 *  小 dot 时若 stroke 不缩,白边会占绝大部分面积让 dot 远看发白看不清色。
 *  公式 = strokeWidth * (size / 18),但保底 0.5 防止 anti-alias 消失。 */
function dotIconUrl(style: MarkerStyle, size: number = 18): string {
  const half = size / 2;
  const scaledStroke = Math.max(style.strokeWidth * (size / 18), 0.5);
  // 半径 = (size - stroke)/2 - 留 anti-alias 边(随 size 缩小也缩小)
  const aaPad = Math.max(0.3, size / 36);
  const r = Math.max((size - scaledStroke) / 2 - aaPad, 1);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${half}" cy="${half}" r="${r}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="${scaledStroke}"/></svg>`;
  // utf8 编码(btoa 对中文不安全;这里 svg 是纯 ASCII 但保险起见用 utf8)
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
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

function LegendDot({
  fill,
  label,
  stroke = '#ffffff',
  strokeWidth = 1.5,
}: {
  fill: string;
  label: string;
  stroke?: string;
  strokeWidth?: number;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className="inline-block rounded-full"
        style={{
          width: 10,
          height: 10,
          backgroundColor: fill,
          border: `${strokeWidth}px solid ${stroke}`,
          boxShadow: '0 0 0 1px #cbd5e1',
        }}
      />
      {label}
    </span>
  );
}

export function MapTab() {
  const filters = useUniversityFilters((s) => s.filters);
  const mapQuery = pickMapFilters(filters);

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const explorerRef = useRef<any>(null);
  const amapRef = useRef<any>(null);
  const infoWindowRef = useRef<any>(null);
  // 学校 dot LabelsLayer(全 level 都画。country 时只是 6px 小点,
  // 类 heatmap 效果显示分布密度;province/city/district 随 level dot 变大。
  // collision 关掉 + allowCollision: true → 所有 dot 永远全显示,不参与避让)
  const schoolDotsLayerRef = useRef<any>(null);
  // 学校校名(只 district view 显示):用普通 AMap.Marker + content。
  // 之前用 LabelsLayer + LabelMarker(text-only)实测渲染不稳定 — 5 个全部不显示。
  // 普通 Marker DOM 定位永远全显示。district view 学校数量级不多(几所到几十所),
  // 不需要 LabelsLayer 的 canvas 优化。
  const schoolNameMarkersRef = useRef<any[]>([]);
  // 数字标签的 Markers([省名 N] [市名 N] [区名 N])。
  // 用普通 AMap.Marker + content HTML 而不是 LabelsLayer:LabelsLayer 即使
  // collision: false 也不一定渲染 text-only LabelMarker(实测全国 view 32 个
  // 省 label 全部不显示);改用普通 Marker 数组确保 100% 显示在中心位置。
  // 数量级:全国 32 / 省 21 市 / 市 20 区,普通 Marker 不卡。
  const countMarkersRef = useRef<any[]>([]);
  const universitiesRef = useRef<MapUniversity[]>([]);
  // 程序化 zoom 窗口:setBounds/setZoomAndCenter 期间 zoomend 会 fire 多次,
  // 期间 zoom 可能临时低于当前层级阈值。窗口里跳过 zoomend handler 防误 pop。
  const programmaticZoomUntilRef = useRef<number>(0);
  // 记录用户最后一次 mousewheel 时的 zoom。zoomend 后只在 zoom 比 wheel 时降低
  // 才算"用户主动缩小",再触发 auto-pop。否则忽略——彻底防 setBounds/setZoom
  // 等程序化 zoom 误触发 pop 造成 cascade。
  const zoomAtUserWheelRef = useRef<number | null>(null);

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

  // 诊断:每次 path 变化 log 一下,方便排查"点一次回全国"等异常 slice
  useEffect(() => {
    console.log('[map] path =', currentPath.map((n) => `${n.name}(${n.level})`).join(' / '));
  }, [currentPath]);

  // zoomend 自动 pop:用户滚轮缩小到 zoom < 当前 level 的下限时,自动回上一级。
  // 经验阈值(取自 AMap setBounds 各层级稳定缩放):
  //   district 内部 ~11-13;低于 10 视为"想退出区/县"
  //   city 内部 ~9;低于 7 视为"想退出市"
  //   province 内部 ~7;低于 5 视为"想退出省"
  //   country 在 4,不再 pop。
  // setBounds 触发的程序化 zoomend 也会进 handler,但新 level 阈值通常不会被
  // setBounds 后的 zoom 击穿,所以不会出无限 pop 循环。
  useEffect(() => {
    if (!mapReady) return;
    const map = mapRef.current;
    if (!map) return;
    const MIN_ZOOM: Record<PathNode['level'], number> = {
      country: 0,
      province: 5,
      city: 7,
      district: 10,
    };
    const handler = () => {
      // 跳过程序化 zoom 窗口期间的 zoomend(setBounds 动画中 zoom 临时低于
      // 当前层级阈值会被误 pop)
      if (Date.now() < programmaticZoomUntilRef.current) return;
      // 只在"用户最近一次滚轮 zoom 且 zoom 在减少"时才 pop。
      // 绕过所有程序化 zoom 触发的 zoomend(setBounds 完成 → 6.25 stable → 后续
      // 某些事件让 zoom 又跳 4.89 等莫名扰动,这些都不该触发 pop)。
      const wheelZoom = zoomAtUserWheelRef.current;
      if (wheelZoom == null) return;
      const z = map.getZoom();
      if (z >= wheelZoom) {
        // zoom 没减少 OR 反而增加,清掉记录 + 不 pop
        zoomAtUserWheelRef.current = null;
        return;
      }
      zoomAtUserWheelRef.current = null; // 消费掉
      setCurrentPath((prev) => {
        if (prev.length <= 1) return prev;
        const current = prev[prev.length - 1];
        const min = MIN_ZOOM[current.level];
        if (z < min) {
          console.log(`[map] zoom ${z.toFixed(2)} < ${min} for ${current.level} → pop (user wheel)`);
          return prev.slice(0, -1);
        }
        return prev;
      });
    };
    map.on('zoomend', handler);
    return () => { try { map.off('zoomend', handler); } catch { /* noop */ } };
  }, [mapReady]);

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

        // user mousewheel:记录滚轮发生时的 zoom。zoomend handler 用它判断
        // 是否是用户主动 zoom out。绕过 setBounds 等程序化 zoom 引发的 zoomend。
        mapRef.current.on('mousewheel', () => {
          zoomAtUserWheelRef.current = mapRef.current.getZoom();
        });

        // polygon 点击 → 下钻一级。dedup 走整条 path:已存在的 adcode → slice 回退,
        // 否则 push。避免点同名 area 把 path 撑长出"四川/.../四川/.../"那种乱序。
        explorerRef.current.on('featureClick', (_e: any, feature: any) => {
          const level: PathNode['level'] = feature.properties.level;
          const adcode: number = feature.properties.adcode;
          const shortName = normalizeAreaName(feature.properties.name, level);
          console.log('[map] featureClick (polygon)', { adcode, level, name: shortName });
          setCurrentPath(buildDrillUpdater(adcode, shortName, level));
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
      if (countMarkersRef.current.length > 0) {
        try { countMarkersRef.current.forEach((mk) => m?.remove(mk)); } catch { /* noop */ }
        countMarkersRef.current = [];
      }
      if (schoolNameMarkersRef.current.length > 0) {
        try { schoolNameMarkersRef.current.forEach((mk) => m?.remove(mk)); } catch { /* noop */ }
        schoolNameMarkersRef.current = [];
      }
      if (schoolDotsLayerRef.current) {
        try { m?.remove(schoolDotsLayerRef.current); } catch { /* noop */ }
        schoolDotsLayerRef.current = null;
      }
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

    // 公共清理:每次重渲都把所有 layer 清掉(polygon + 数字标签 + 学校 dots + 校名)
    const clearAll = () => {
      try { explorer.clearFeaturePolygons(); } catch { /* noop */ }
      if (countMarkersRef.current.length > 0) {
        try { countMarkersRef.current.forEach((m2) => map.remove(m2)); } catch { /* noop */ }
        countMarkersRef.current = [];
      }
      if (schoolNameMarkersRef.current.length > 0) {
        try { schoolNameMarkersRef.current.forEach((mk) => map.remove(mk)); } catch { /* noop */ }
        schoolNameMarkersRef.current = [];
      }
      if (schoolDotsLayerRef.current) {
        try { map.remove(schoolDotsLayerRef.current); } catch { /* noop */ }
        schoolDotsLayerRef.current = null;
      }
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

      // ─── 通用块:所有 level 都画学校 dot ───
      // country: 全部 2226 所学校(类 heatmap 显示分布密度,dot 6px)
      // province/city/district: 当前 scope 内的学校,dot 随 level 渐大
      //
      // 用 LabelsLayer 装 dot:LabelsLayer 是 canvas 渲染,承载万级 marker 不卡。
      // collision: false + allowCollision: true → 所有 dot 永远全显示,不参与避让。
      const shownUnis: MapUniversity[] = current.level === 'country'
        ? universities
        : pickUnisInScope(universities, currentPath);
      const dotSize = DOT_SIZE_BY_LEVEL[current.level];
      const dotsLayer = new AMap.LabelsLayer({
        zooms: [3, 20],
        zIndex: 900,
        collision: false,
        allowCollision: true,
      });
      shownUnis.forEach((u) => {
        const style = getMarkerStyle(u);
        const dot = new AMap.LabelMarker({
          position: [u.lng, u.lat],
          icon: {
            type: 'image',
            image: dotIconUrl(style, dotSize),
            size: [dotSize, dotSize],
            anchor: 'center',
          },
        });
        dot.on('click', (e: any) => {
          if (!e?.originEvent) return;
          if (!infoWindowRef.current) return;
          infoWindowRef.current.setContent(buildInfoHtml(u));
          infoWindowRef.current.open(map, [u.lng, u.lat]);
        });
        dotsLayer.add(dot);
      });
      map.add(dotsLayer);
      schoolDotsLayerRef.current = dotsLayer;
      console.log(`[map] ${current.level} view: ${shownUnis.length} dots (${dotSize}px)`);

      // markers 模式只在叶子(district)触发;subs 为空也兜底显示 markers
      const showMarkers = current.level === 'district' || subs.length === 0;

      if (showMarkers) {
        // district view 时把当前 district 的 polygon 边界也画出来——用户提到的
        // "点击区/县后也要显示边界"。做法:重新 renderSubFeatures 父级(市)的
        // 所有 districts,但只把当前 district 高亮,其他淡化。
        // 同步从 explorer 拿父级 areaNode(city view 时已 loadAreaNode 缓存过)。
        if (current.level === 'district' && currentPath.length >= 2) {
          const parentNode = currentPath[currentPath.length - 2];
          // AMapUI DistrictExplorer 实际 API 叫 getLocalAreaNode(同步,从内部
          // _areaNodeCache 取),不是 getAreaNodeByAdcode(那个不存在)。
          // 进 district view 时父级 city 已经在前一个 effect 跑过 loadAreaNode,
          // 所以这里 sync 取一定命中。
          const parentArea = explorer.getLocalAreaNode?.(parentNode.adcode);
          if (parentArea) {
            explorer.renderSubFeatures(parentArea, (feature: any) => {
              const isCurrent = feature.properties.adcode === current.adcode;
              if (isCurrent) {
                // 当前 district 蓝色高亮(不走 pastel 调色,跟"已选"语义区分)
                return {
                  cursor: 'default', bubble: true,
                  strokeColor: '#2563eb', strokeWeight: 2,
                  strokeOpacity: 0.95,
                  fillColor: '#dbeafe', fillOpacity: 0.35,
                };
              }
              // 邻区按 adcode 上 pastel 色但更淡(district view 主角是当前 district,
              // 邻区 0.15 不抢戏)
              return {
                cursor: 'default', bubble: true,
                strokeColor: '#94a3b8', strokeWeight: 1,
                strokeOpacity: 0.4,
                fillColor: getRegionFill(feature.properties.adcode),
                fillOpacity: 0.15,
              };
            });
          }
        }

        // district 专属:校名 label 用普通 AMap.Marker + content。
        // 之前用 LabelsLayer + LabelMarker(text-only)实测渲染不稳定 — 5 个校名
        // 全部不显示(同 country countLayer 的 text-only LabelMarker bug)。
        // 普通 Marker DOM 永远全显示,几所到几十所的数量级不卡。
        // (校名 label 位置在 dot 右侧 12px 处,用 offset 实现)
        const scopeUnisForLabels = pickUnisInScope(universities, currentPath);
        console.log(`[map] district view ${current.name}: ${scopeUnisForLabels.length} school name markers`);
        const nameMarkers: any[] = [];
        scopeUnisForLabels.forEach((u) => {
          const nameDiv = document.createElement('div');
          nameDiv.style.cssText = [
            'transform: translate(0, -50%)', // 左对齐,垂直居中
            'padding: 2px 6px',
            'background: rgba(255,255,255,0.95)',
            'border: 1px solid #cbd5e1',
            'border-radius: 3px',
            'color: #0f172a',
            'font-size: 11px',
            'font-family: inherit',
            'white-space: nowrap',
            'cursor: pointer',
            'user-select: none',
            'pointer-events: auto',
            'box-shadow: 0 1px 2px rgba(0,0,0,0.05)',
          ].join(';');
          nameDiv.textContent = u.name;
          nameDiv.addEventListener('click', (ev) => {
            ev.stopPropagation();
            if (!infoWindowRef.current) return;
            infoWindowRef.current.setContent(buildInfoHtml(u));
            infoWindowRef.current.open(map, [u.lng, u.lat]);
          });
          const nameMarker = new AMap.Marker({
            position: [u.lng, u.lat],
            content: nameDiv,
            // 锚定 dot 右侧 12px(dot 半径 9 + 3 留白),垂直居中(用 transform 调)
            offset: new AMap.Pixel(12, 0),
            zIndex: 120,
            bubble: false,
          });
          map.add(nameMarker);
          nameMarkers.push(nameMarker);
        });
        schoolNameMarkersRef.current = nameMarkers;
        // 用 areaNode 的 center + 固定 zoom。immediate=true 跳过 AMap 动画——
        // 浏览器实测 animate 版本会被中途覆盖(setZoom 缓动从 4→7 期间会被
        // 后续某个 effect 重置回 4 附近)。瞬间 jump 反而稳定。
        try {
          const props = areaNode.getProps?.();
          const center = props?.center ?? props?.centroid;
          if (center) {
            programmaticZoomUntilRef.current = Date.now() + 200;
            map.setZoomAndCenter(TARGET_ZOOM[current.level], center, true);
          }
        } catch (e) {
          console.warn('setZoomAndCenter failed (markers)', current, e);
        }
        return;
      }

      // 非 markers 模式:子级 polygon + 数字标签(全国 view / 非直辖省 view)
      // 先 aggregate counts,polygon + label 都按 count 区分:
      //   count > 0 → 正常显示,clickable
      //   count = 0 → polygon 大幅淡化 + 完全不画 label(用户不感兴趣这些 0 数据的区)
      const counts = aggregateForSubLevel(universities, current, subLevel ?? 'province');

      explorer.renderSubFeatures(areaNode, (feature: any) => {
        const fLevel: PathNode['level'] = feature.properties.level;
        const shortName = normalizeAreaName(feature.properties.name, fLevel);
        const count = counts.get(shortName) ?? 0;
        if (count === 0) {
          // 0 数据区:几乎透明,鼠标不变手指(让用户视觉聚焦在有数据的区)
          return {
            cursor: 'default',
            bubble: true,
            strokeColor: '#e2e8f0',
            strokeWeight: 0.5,
            strokeOpacity: 0.35,
            fillColor: '#f1f5f9',
            fillOpacity: 0.08,
          };
        }
        // 有数据区:按 adcode 哈希一个 pastel 色,淡淡铺底让相邻区域可辨。
        // fillOpacity 0.25 不会盖住 dot / 文字(实测白色 dot stroke + 黑字
        // label 在 pastel 背景上仍清晰)
        return {
          cursor: 'pointer',
          bubble: true,
          strokeColor: '#94a3b8',
          strokeWeight: 1.2,
          strokeOpacity: 0.6,
          fillColor: getRegionFill(feature.properties.adcode),
          fillOpacity: 0.25,
        };
      });

      if (subs.length === 0) return;

      // 数字标签改用普通 AMap.Marker + content HTML:
      // LabelsLayer + LabelMarker(即使 collision: false)实测会被 AMap
      // 视觉 hide 一部分(text-only marker 渲染不稳定);Marker + content
      // 是简单 absolute 定位的 DOM,永远全显示,不参与任何避让。
      // 数量级 32/21/20 个,普通 Marker 不卡。
      const countMarkers: any[] = [];
      subs.forEach((feature: any) => {
        const fLevel: PathNode['level'] = feature.properties.level;
        const shortName = normalizeAreaName(feature.properties.name, fLevel);
        const count = counts.get(shortName) ?? 0;
        if (count === 0) return; // 0 数据区:不画 label
        const center = feature.properties.center || feature.properties.centroid;
        if (!center) return;
        const fAdcode: number = feature.properties.adcode;

        const labelDiv = document.createElement('div');
        labelDiv.style.cssText = [
          'transform: translate(-50%, -50%)',
          'padding: 4px 10px',
          'background: rgba(15,23,42,0.88)',
          'border: 1px solid rgba(255,255,255,0.12)',
          'border-radius: 4px',
          'color: #ffffff',
          'font-size: 12px',
          'font-family: inherit',
          'white-space: nowrap',
          'cursor: pointer',
          'user-select: none',
          'pointer-events: auto',
        ].join(';');
        labelDiv.textContent = `${shortName} ${count}`;
        labelDiv.addEventListener('click', (ev) => {
          ev.stopPropagation();
          setCurrentPath(buildDrillUpdater(fAdcode, shortName, fLevel));
        });

        const marker = new AMap.Marker({
          position: center,
          content: labelDiv,
          anchor: 'center',
          zIndex: 110,
          bubble: false,
        });
        map.add(marker);
        countMarkers.push(marker);
      });
      countMarkersRef.current = countMarkers;

      // 视野控制:用 setZoomAndCenter(..., immediately=true) 跳过 AMap 动画。
      // 浏览器实测 animate 版本中途会被覆盖(可能 explorer.renderSubFeatures
      // 内部干扰)。瞬间 jump 反而稳定可靠。
      if (current.level === 'country') {
        // setBounds 实测在 country view 不生效(silent fail,zoom 跟 setBounds
        // 前完全相同)。改用 setZoomAndCenter(5, [104, 36]) 紧贴中国:
        //   zoom 4 时 lng range ~70°,东到日本 145、西到中亚,东南亚都露;
        //   zoom 5 紧一倍,lng range ~35°,view 主要是中国领土。
        // 配合 height 720 的容器,aspect 1500/720 ≈ 2.08 也更接近中国 bbox。
        programmaticZoomUntilRef.current = Date.now() + 500;
        map.setZoomAndCenter(ROOT_ZOOM, ROOT_CENTER, true);
      } else {
        try {
          const props = areaNode.getProps?.();
          const center = props?.center ?? props?.centroid;
          if (center) {
            programmaticZoomUntilRef.current = Date.now() + 200;
            map.setZoomAndCenter(TARGET_ZOOM[current.level], center, true);
          }
        } catch (e) {
          console.warn('setZoomAndCenter failed (polygon)', current, e);
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
      {/* 共享 filter store 跟「全部院校」tab 同步:这里改 filter,list tab 重新分页;
          list 改 filter,这里 map 重 fetch */}
      <MapFilterBar />
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
        <div className="flex items-center gap-4">
          {/* 色点 legend(只在叶子 = district view 显院校 markers 时才有意义)
              主色 = 档次,边框 = 公办/民办(粗深红 = 民办 vs 细白边 = 公办) */}
          {currentPath[currentPath.length - 1].level === 'district' && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-text-muted">
              <LegendDot fill="#d4af37" label="985" />
              <LegendDot fill="#9333ea" label="211" />
              <LegendDot fill="#0ea5e9" label="双一流" />
              <LegendDot fill="#16a34a" label="本科" />
              <LegendDot fill="#f97316" label="专科" />
              <span className="text-text-faint">|</span>
              <LegendDot fill="#94a3b8" stroke="#ffffff" strokeWidth={1.5} label="公办" />
              <LegendDot fill="#94a3b8" stroke="#b91c1c" strokeWidth={2} label="民办" />
            </div>
          )}
          <span className="text-text-muted">
            {dataLoading
              ? '加载院校位置中...'
              : dataError
              ? '数据加载失败'
              : `共 ${universities?.length ?? 0} 所院校（含坐标）`}
          </span>
        </div>
      </div>
      <div
        className="relative overflow-hidden rounded-xl bg-surface shadow-card"
        style={{ height: 760 }}
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
