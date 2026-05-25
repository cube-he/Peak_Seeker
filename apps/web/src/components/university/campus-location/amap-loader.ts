// Ambient global declared by the AMap SDK at runtime.
declare const AMap: any;

// Module-level singleton so multiple components / re-renders do not
// reload the SDK. The promise is cached on first call.
//
// IMPORTANT: we use dynamic import() inside loadAMap() instead of a
// top-level `import AMapLoader from '@amap/amap-jsapi-loader'` because
// the AMap loader package touches `window` at module evaluation time.
// A top-level import is evaluated during Next.js SSR, crashing the page.
let loadPromise: Promise<typeof AMap> | null = null;

/**
 * Lazy-load the AMap JS SDK. Safe to call multiple times — returns the
 * same promise. Configures the security code from env so the SDK can
 * authenticate against AMap's server-side validation.
 *
 * Stage 1: keys come from NEXT_PUBLIC_* env (visible in browser bundle).
 * Stage 2: bind production domain whitelist in AMap console so the keys
 * cannot be reused from other origins. See spec § 5.
 */
export function loadAMap(): Promise<typeof AMap> {
  if (loadPromise) return loadPromise;

  if (typeof window === 'undefined') {
    // SSR guard: refuse to start the loader during server render.
    return Promise.reject(new Error('AMap loader called during SSR'));
  }

  const key = process.env.NEXT_PUBLIC_AMAP_JS_KEY;
  const securityCode = process.env.NEXT_PUBLIC_AMAP_JS_SECURITY;

  if (!key || !securityCode) {
    return Promise.reject(
      new Error(
        'AMap keys are not configured. Set NEXT_PUBLIC_AMAP_JS_KEY and NEXT_PUBLIC_AMAP_JS_SECURITY in apps/web/.env.local',
      ),
    );
  }

  // AMap reads the security code from this global before SDK init.
  (window as unknown as { _AMapSecurityConfig: { securityJsCode: string } })._AMapSecurityConfig = {
    securityJsCode: securityCode,
  };

  // Dynamic import keeps `@amap/amap-jsapi-loader` out of the SSR bundle.
  // plugins 在 SDK 初始化时一次性声明,后续运行时 AMap.plugin('X', cb) 在 v2.0
  // 可靠性差(回调不一定触发)。把项目用到的插件全部预声明,空闲就闲着,需要就直接 new。
  // 当前消费者:
  //   - CampusMap: 只用核心 Map + Marker
  //   - MapTab: 用 MarkerCluster(阶段 B)、HeatMap(阶段 D)
  loadPromise = import('@amap/amap-jsapi-loader').then((mod) =>
    mod.default.load({
      key,
      version: '2.0',
      plugins: ['AMap.MarkerCluster', 'AMap.HeatMap'],
    }),
  );
  return loadPromise;
}

// AMapUI (独立 UI 组件库,DistrictExplorer 等行政区下钻组件)。主 SDK 不内置,
// 走 CDN script tag 注入。AMapUI.loadUI 走回调,包 Promise 方便 await。
let amapUILoadPromise: Promise<any> | null = null;

declare const AMapUI: any;

/**
 * Lazy-load AMapUI(行政区下钻、infoWindow 等 UI 组件)。依赖主 SDK 已加载。
 * 同一进程多次调用共享同一 promise。
 */
export function loadAMapUI(): Promise<any> {
  if (amapUILoadPromise) return amapUILoadPromise;
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('AMapUI loader called during SSR'));
  }
  amapUILoadPromise = loadAMap().then(
    () =>
      new Promise((resolve, reject) => {
        // 已经注入过(其他组件先调用):直接返回
        if ((window as any).AMapUI) {
          resolve((window as any).AMapUI);
          return;
        }
        const script = document.createElement('script');
        script.src = 'https://webapi.amap.com/ui/1.1/main.js';
        script.async = true;
        script.onload = () => {
          if ((window as any).AMapUI) resolve((window as any).AMapUI);
          else reject(new Error('AMapUI script loaded but window.AMapUI is undefined'));
        };
        script.onerror = () => reject(new Error('Failed to load AMapUI script'));
        document.head.appendChild(script);
      }),
  );
  return amapUILoadPromise;
}

/**
 * Lazy-load DistrictExplorer(三级行政区下钻组件)。依赖 AMapUI。
 * 返回构造函数,调用方:`new DistrictExplorer({ map, eventSupport: true })`。
 */
let districtExplorerPromise: Promise<any> | null = null;
export function loadDistrictExplorer(): Promise<any> {
  if (districtExplorerPromise) return districtExplorerPromise;
  districtExplorerPromise = loadAMapUI().then(
    (UI) =>
      new Promise((resolve, reject) => {
        UI.loadUI(['geo/DistrictExplorer'], (DistrictExplorer: any) => {
          if (DistrictExplorer) resolve(DistrictExplorer);
          else reject(new Error('DistrictExplorer load returned undefined'));
        });
      }),
  );
  return districtExplorerPromise;
}

/**
 * Test-only helper: clears the cached loader promise so unit tests can
 * exercise the "first load" path repeatedly.
 */
export function _resetLoaderForTests(): void {
  loadPromise = null;
  amapUILoadPromise = null;
  districtExplorerPromise = null;
}
