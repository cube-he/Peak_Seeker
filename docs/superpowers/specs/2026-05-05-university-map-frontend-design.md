# 院校地图前端 (Plan B) · 设计文档

> 创建日期：2026-05-05
> 状态：草案
> 范围：Plan B —— Plan A 后端模块的 API 暴露 + 前端「校区位置」Tab + AMap SDK 集成
> 不在范围：Plan C（数据全量补完 + audit + 上线 checklist）

---

## 1. 目标

详情页 `/universities/[id]` 新增 **「校区位置」Tab**，展示院校全部 verified 校区在地图上的位置 + 周边 POI。Plan A 已经把数据 backfill 入库，Plan B 把这些数据暴露给用户。

### 1.1 Stage 划分

**Stage 1（最小可见，~3 天）**
- 后端 API 完整：详情接口加 `campuses[]` + 新端点 `/campuses/:id/pois`
- 前端桌面布局：左 2/3 地图 + 右 1/3 面板
- 全校区 marker 渲染（`fitBounds` 包含全部）
- 主校区固定显示 + 仅"最近地铁"POI 列
- AMap SDK 懒加载（用户切到 Tab 才下载 SDK）

> Stage 1 完成 = 用户打开任意 verified 院校详情页能看到 Tab + 地图 + POI 列表。验证视觉方向。

**Stage 2（完整版，~3-4 天）**
- 校区切换器（P2 布局，竖排校区卡）
- POI 三类完整（地铁 / 商圈 / 机场）
- 移动端响应式（< 768 / 768-1024 / >= 1024）
- 错误处理 (SDK 加载失败 / POI 失败 / Tab 不渲染)
- 前端单元 + 集成测试
- AMap 域名白名单配置（上线前必做 checklist）

### 1.2 设计原则继承自 Plan A

1. **`geoStatus` 单一真相** —— 后端只返回 `geoStatus='verified'` 的校区
2. **失败静默** —— `campuses=[]` 时 Tab 整个不渲染（不留 Tab、不显占位）
3. **POI 走自己后端** —— 不调高德 PlaceSearch（数据已预存，避免额外消耗 JS Key 配额）

---

## 2. 后端改动

### 2.1 详情接口扩展

`GET /universities/:id`（现有路由）的响应体增加 `campuses` 字段：

```ts
{
  ...所有现有字段不变...,
  campuses: Array<{
    id: number;
    name: string;
    isMain: boolean;
    province: string | null;
    city: string | null;
    district: string | null;
    address: string | null;
    latitude: number;        // Decimal -> Number 转换
    longitude: number;
    distanceToCityCenter: number | null;
    nearestSubwayMeters: number | null;
    nearestAirportKm: number | null;
  }>;
}
```

**实现要点**：
- `apps/server/src/modules/university/university.service.ts` `getById()` 加 `include: { campuses: { where: { geoStatus: 'verified' } } }`
- 复用现有把 Decimal 转 number 的 helper（项目里已有，类似 `latestAdmission` 的处理）
- 后端**已过滤** `verified`，前端不需要二次过滤
- 没数据的院校返回 `campuses: []`，**不是** `undefined` / `null`

### 2.2 新增 POI 端点

`GET /api/universities/:uniId/campuses/:campusId/pois`

```
Query params:
  category: 'subway' | 'mall' | 'airport'   (必填)
  limit:    number                          (默认 5, 最大 20)

Response:
  Array<{
    id: number;
    amapId: string;
    name: string;
    category: 'subway' | 'mall' | 'airport';
    distance: number;            // 米
    metadata: object | null;     // 例如 { businessArea: '五道口' }
  }>
```

**实现要点**：
- 路由加在现有 `university.controller.ts`
- Service 方法 `getCampusPois(uniId, campusId, query)`，简单 Prisma 查询
- WHERE: `campusId` + `category` + `obsolete: false`
- ORDER BY `distance ASC` LIMIT `limit`
- **只暴露用户需要字段**（不返回 lat/lng/typecode 等内部字段）
- **公开端点**（不加 JWT）—— POI 是公共地图信息，与详情接口策略一致

### 2.3 数据一致性

| 场景 | 行为 |
|---|---|
| 院校 verified, campus verified, 有 POI | 正常显示 Tab + 地图 + POI |
| 院校 verified, campus verified, **无 POI**（backfill 时 POI 接口失败的 60 校区） | Tab 显示, 地图 marker 显示, POI 列表显示"暂无周边数据" |
| 院校 invalid（35 个） | 后端 `campuses=[]` —— Tab 不渲染 |
| 院校 pending（450 个未跑完） | 同上, Tab 不渲染 |

---

## 3. 前端组件结构

### 3.1 文件树

```
apps/web/src/components/university/campus-location/
  ├─ CampusLocationTab.tsx       容器: 装 Map + Panel
  ├─ CampusMap.tsx               AMap 渲染 + marker 管理 (左 2/3)
  ├─ CampusPanel.tsx             右侧面板容器
  │   ├─ CampusInfo.tsx            [子] 当前校区信息卡 (Stage 1 = 主校区固定)
  │   ├─ CampusSwitcher.tsx        [子, Stage 2] 竖排校区切换 (P2 布局)
  │   └─ PoiList.tsx               [子] POI 列表 (Stage 1 = 仅地铁)
  ├─ usePoi.ts                   React Query hook
  ├─ amap-loader.ts              AMap SDK 单例懒加载
  └─ types.ts                    Campus / Poi 前端类型定义
```

> 命名冲突注意：`apps/web/src/components/university/CampusCard.tsx` 已存在（讲述"校园面积/军训"），与本设计无关。新组件用 `CampusInfo` 不重名。

### 3.2 详情页挂载点

`apps/web/src/app/(main)/universities/[id]/page.tsx` 现有 `tabItems` 数组中**条件插入**一个 Tab：

```tsx
import { EnvironmentOutlined } from '@ant-design/icons';
import CampusLocationTab from '@/components/university/campus-location/CampusLocationTab';

// inside tabItems = [...]:
...(u.campuses && u.campuses.length > 0
  ? [{
      key: 'campus',
      label: <span><EnvironmentOutlined className="mr-1" />校区位置 ({u.campuses.length})</span>,
      children: <CampusLocationTab campuses={u.campuses} />,
    }]
  : []),
```

详情页**唯一**改动点。

### 3.3 Stage 1 数据流

```
1. 详情页 useQuery(['university', id]) 已存在
   -> 后端响应里现在多了 campuses[] (§ 2.1)
   -> 详情页传给 <CampusLocationTab campuses={u.campuses} universityId={u.id} />

2. 用户切到 "校区位置" Tab
   -> CampusLocationTab 默认选中 isMain=true 的校区 (没有就第一个)
   -> 调 amap-loader.loadAMap()  // 第一次切才下载 SDK ~300KB
   -> CampusMap 渲染所有 campuses 的 marker
   -> 主校区 marker 高亮蓝色, 其他灰色

3. CampusInfo 显示当前选中校区 (Stage 1 = 主校区)
   -> 名称 + 城市/区县 + 距市中心 (如有)

4. PoiList 只查地铁 (Stage 1)
   -> useQuery(['poi', uniId, campusId, 'subway'])
   -> queryFn: api.get(`/universities/${uniId}/campuses/${campusId}/pois?category=subway&limit=5`)
   -> staleTime: 30 分钟 (POI 基本不变, 减少重复请求)
   -> 显示 "🚇 <名称> · <距离>" 排序列表
```

### 3.4 AMap SDK 加载策略

`amap-loader.ts`：

```ts
import AMapLoader from '@amap/amap-jsapi-loader';

let loadPromise: Promise<typeof AMap> | null = null;

export function loadAMap(): Promise<typeof AMap> {
  if (loadPromise) return loadPromise;

  if (typeof window !== 'undefined') {
    (window as any)._AMapSecurityConfig = {
      securityJsCode: process.env.NEXT_PUBLIC_AMAP_JS_SECURITY!,
    };
  }

  loadPromise = AMapLoader.load({
    key: process.env.NEXT_PUBLIC_AMAP_JS_KEY!,
    version: '2.0',
    plugins: [],   // Stage 1 不用 PlaceSearch
  });
  return loadPromise;
}
```

**关键决策**：
- **不用 `AMap.PlaceSearch` 插件** — POI 走自己后端，避免消耗 JS Key 配额
- 只保留地图本身 + Marker + InfoWindow → SDK 体积优化
- SSR 安全：`typeof window !== 'undefined'` 守卫
- 单例：`loadPromise` 全局只下载一次

### 3.5 CampusMap 实现要点

```tsx
'use client';

const containerRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  let map: any = null;
  let cancelled = false;

  loadAMap().then((AMap) => {
    if (cancelled) return;
    const main = campuses.find((c) => c.isMain) ?? campuses[0];
    map = new AMap.Map(containerRef.current, {
      zoom: 14,
      center: [main.longitude, main.latitude],
    });

    const markers = campuses.map((c) => new AMap.Marker({
      position: [c.longitude, c.latitude],
      title: c.name,
      icon: c.isMain ? blueIconUrl : grayIconUrl,
      // 信息窗体 click 显示校区名 + 地址
    }));
    map.add(markers);

    if (campuses.length > 1) {
      map.setFitView(markers);   // 包含全部 marker, 自动 zoom
    }
  }).catch((err) => setError(err));

  return () => {
    cancelled = true;
    map?.destroy();
  };
}, [campuses]);
```

**要点**：
- `cancelled` 标志防 race（快速切 Tab 时不重复挂载）
- 卸载时 `map.destroy()` 清 DOM + listener
- 容器固定高度 480px（桌面）

### 3.6 Stage 1 桌面布局

```
┌────── 校区位置 Tab ─────────────────────────────────────────┐
│  ┌────────── 地图 (左 2/3) ──────────┐ ┌─ 面板 (右 1/3) ──┐
│  │                                   │ │                  │
│  │   蓝 主校区                       │ │  哈尔滨工业大学   │
│  │       灰 威海                     │ │  (本部)          │
│  │              灰 深圳              │ │  哈尔滨 · 南岗区  │
│  │                                   │ │                  │
│  │   高度 480px                       │ │  距市中心 5.2 km │
│  │   marker fitBounds 包含全部        │ │                  │
│  │                                   │ │  最近地铁         │
│  │                                   │ │  • 西大直街 380m  │
│  │                                   │ │  • 哈工大 520m    │
│  └───────────────────────────────────┘ └──────────────────┘
└─────────────────────────────────────────────────────────────┘
```

Stage 1 没有"切换校区"交互。CampusInfo 永远显示主校区。CampusSwitcher 组件 Stage 2 才加。

### 3.7 状态管理

- React Query（项目已用）
- 没有全局状态：选中校区、地图实例都是组件内 `useState` / `useRef`

---

## 4. 错误处理

| 场景 | 行为 |
|---|---|
| `campuses=[]` (院校 invalid / pending) | Tab 整个不渲染（条件 spread） |
| AMap SDK 加载失败（网络 / key 错） | 地图区域占位框 + "地图加载失败，请刷新重试" + 重试按钮 |
| AMap SDK 加载超时（10 秒） | 同 SDK 失败 |
| POI 端点请求失败 | PoiList 显示"暂时无法加载地铁信息"，地图不受影响 |
| POI 端点返回空数组（campus 没有 POI 数据） | PoiList 显示"暂无周边地铁信息" |
| 单 campus 缺 lat/lng（数据脏） | 后端已过滤 verified；前端理论拿不到，加 defensive `if (!c.latitude) return null` |

**错误边界**：用 React `ErrorBoundary` 包 `<CampusLocationTab>`，最外层兜底，崩溃也不影响其他 Tab。

---

## 5. 环境变量

`apps/web/.env.local`（不进 git，开发者从高德控制台填入）：

```dotenv
NEXT_PUBLIC_AMAP_JS_KEY=<SL_JS Key 值>
NEXT_PUBLIC_AMAP_JS_SECURITY=<SL_JS 安全密钥>
```

> ⚠️ Stage 1 直接 `NEXT_PUBLIC_*` 暴露在 bundle —— Stage 2 上线前必须在高德控制台**绑生产域名白名单**。即使 jscode 公开，盗用者跨域名拿不到额度（高德官方推荐姿势）。

---

## 6. 测试策略

### 6.1 后端单元测试

| 项 | 测试 |
|---|---|
| `UniversityService.getById()` | 返回 campuses 字段；无校区返回 `[]`；只返回 `verified` 校区 |
| `UniversityService.getCampusPois()` | 过滤 `obsolete=false`；按 distance 排序；limit 生效；category 过滤生效 |

### 6.2 后端 e2e

| 项 | 测试 |
|---|---|
| `GET /universities/:id` | 实际响应里有 campuses 数组（mock prisma） |
| `GET /universities/:uniId/campuses/:id/pois?category=subway` | 返回前 5 个最近 POI |

### 6.3 前端单元测试

| 项 | 测试 |
|---|---|
| `CampusLocationTab` | campuses=[] 时不渲染；多个 campuses 时渲染 |
| `usePoi` hook | category=subway 时调对的 URL；error 时返回 isError |
| `PoiList` | 数据 happy path；空数组渲染"暂无"；error 渲染兜底文案 |

### 6.4 前端集成测试（Stage 2）

用 React Testing Library + MSW mock 后端 API，验证整个 Tab 交互链路。Stage 1 不做。

### 6.5 不测的部分

- **不直接测 AMap SDK 调用**（mock 不产生信号；真实测试需要浏览器）
- **不做 e2e Playwright**（Stage 1 范围外）

---

## 7. 阶段划分（实施期）

### Stage 1（先看效果）
1. 后端 `UniversityService.getById()` 加 campuses include
2. 后端 `UniversityService.getCampusPois()` + controller 路由
3. 后端 e2e 测试
4. 前端 `pnpm add @amap/amap-jsapi-loader`
5. 前端 `amap-loader.ts` + `types.ts`
6. 前端 `CampusMap.tsx` + `CampusInfo.tsx` + `PoiList.tsx` + `CampusLocationTab.tsx`
7. 详情页插入 Tab
8. 配 `.env.local`
9. 用户验收：跑 `pnpm dev`，打开几个 verified 院校（清华/哈工大/电子科大）的详情页

### Stage 2（完整版）
10. `CampusSwitcher.tsx` 校区切换交互
11. POI 扩展到 mall + airport (`PoiList` 变 Tab 切换)
12. 移动端响应式（断点在 § 8）
13. 错误处理 + 错误边界
14. 前端集成测试（MSW）
15. AMap 控制台域名白名单配置

---

## 8. 响应式断点（Stage 2）

| 断点 | 布局 | 地图高度 |
|---|---|---|
| `< 768px` | 上下堆叠（地图先、面板后） | 320 px |
| `768–1024` | 左 3/5 + 右 2/5 | 400 px |
| `≥ 1024px` | 左 2/3 + 右 1/3 | 480 px |

移动端 panel 默认折叠到只显示「校区切换器」，点击展开 POI 列表。

---

## 9. 风险与未决

| 风险 | 缓解 |
|---|---|
| `NEXT_PUBLIC_*` 暴露 jscode | Stage 2 上线前控制台开域名白名单 |
| 60 个校区缺 POI（backfill 时配额耗尽） | 明天 0 点跑 `geo-refresh-poi.ts` 补；Stage 1 PoiList 显示"暂无"也无大碍 |
| 用户切 Tab 时 AMap SDK ~300KB 下载延迟 | SDK loader 显示骨架占位；首次切~1s 内完成（高德 CDN） |
| 站点 SSR + 高德 SDK 冲突 | `typeof window` 守卫 + `'use client'` 标注 |
| 详情页现有 `useQuery(['university', id])` 缓存命中后 campuses 没出现 | 升级 Plan A 后端版本时所有 cache 自然过期；本地 dev 用户首次切到详情页一定有新字段 |

---

## 10. 已确认决策

| # | 项 | 值 | 出处 |
|---|---|---|---|
| 1 | UI 布局 | E2 独立 Tab + P2 面板 | Plan A spec § 11 |
| 2 | POI 数据来源 | 自己后端（不调高德 PlaceSearch） | Plan A spec § 1.1 |
| 3 | Tab 失败静默 | `campuses=[]` 时不渲染 | Plan A spec § 1.4 |
| 4 | AMap key 注入 | NEXT_PUBLIC_* (Stage 1) + 域名白名单 (Stage 2 上线) | Plan B § 5 |
| 5 | Stage 1 多校区策略 | S1b: 全部 marker 渲染, 不做切换交互 | 本次决策 2026-05-05 |
| 6 | Stage 1 POI 类别 | 仅 subway | 本次决策 |
| 7 | Stage 1 移动端 | 不做（Stage 2 才支持） | 本次决策 |
| 8 | SDK 加载方式 | `@amap/amap-jsapi-loader` 官方包 | 本次决策 |
| 9 | SDK plugins | 不加载 PlaceSearch（POI 走自己） | 本次决策 |
