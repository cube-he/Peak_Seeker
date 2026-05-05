# 院校地图功能 · 设计文档

> 创建日期：2026-05-05
> 状态：草案 · 等待用户 review
> 范围：一期（地图核心 + 数据自愈闭环 CLI 版本）；二期不在本 spec（Admin 面板 + D「按地图选校」）

---

## 1. 目标

详情页 `/universities/[id]` 新增 **「校区位置」Tab**，地图标出该院校全部校区（含主校区与多校区），每个校区可看周边地铁、商圈、机场等环境信息。

地图组件本身同时是 **数据治理探针**：能渲染 = 该院校地理数据已通过校验；渲染不出来 = 自动隐藏 Tab + 后台进入数据自愈闭环（自动重整 → 仍失败留 issue 队列等二期人工）。

### 1.1 核心设计原则

1. **`geoStatus` 单一真相** —— 前端只看这一个字段决定渲不渲染，不感知背后多少层重试
2. **失败静默** —— 数据有问题的院校 Tab 整体不渲染（不留 Tab、不显「数据完善中」占位）
3. **多校区独立 verified** —— 主校区 verified 但分校区 invalid 时，地图只标主校区，其余忽略
4. **POI 预存** —— 不实时调用，写入数据库；因为：① 个人版周边搜索配额受限 ② D 二期「按地图选校」需要预先算好「距市中心」「最近地铁」等衍生数字才能筛选 ③ 实时方案与「数据自愈」理念脱节
5. **数据治理可观测** —— 一期没有 Admin 面板，但所有异常都有结构化记录（`UniversityGeoIssue` 表 + 每次脚本输出 JSON 报告到 `logs/geo-*.json`），二期面板直接消费这些数据

### 1.2 不在一期范围

- Admin 数据健康面板（二期，消费已有 `UniversityGeoIssue` 表）
- 列表页「按地图选校」模式（二期 D 方案，依赖一期已存好的 `distanceToCityCenter` 等衍生字段）
- 章程 PDF 抽取的 LLM Pipeline（如一期 backfill 内嵌的简化版本不够用，二期再独立做异步任务系统）

---

## 2. 系统架构

```
┌─── apps/web (Next.js) ────────────────────────────────┐
│  /universities/[id] 详情页                              │
│    └─ Tab「校区位置」(条件渲染: campuses.length > 0)   │
│        ├─ <CampusMap/>     左 2/3 (480px)             │
│        │   └─ AMap JS API 2.0 + 多 marker             │
│        └─ <CampusPanel/>   右 1/3 (P2 布局)           │
│            ├─ 校区列表 (竖排卡片, 含城市)               │
│            └─ POI 一屏汇总 (地铁/商圈/机场各最近 1-2)   │
└─────────────────────────────────────────────────────────┘
                    │ GET /universities/:id (含 verified campuses[])
                    │ GET /campuses/:id/pois?category=subway|mall|airport
                    ▼
┌─── apps/server (NestJS) ──────────────────────────────┐
│  Prisma                                                │
│    University   (+ lat/lng/address/geoStatus)         │
│    UniversityCampus (新)                               │
│    UniversityCampusPoi (新)                            │
│    UniversityGeoIssue (新)                             │
│                                                        │
│  src/modules/geo/                                      │
│    ├─ amap.client.ts          底层 HTTP (限速+重试+sig)│
│    ├─ geocoder.service.ts     地址 ↔ 坐标               │
│    ├─ campus-extractor.service.ts  多校区发现           │
│    ├─ validator.service.ts    7 条校验规则              │
│    └─ retry-chain.service.ts  按 issueType 路由的重整   │
│                                                        │
│  scripts/                                              │
│    geo-backfill.ts   一次性全量补全(坐标+POI)           │
│    geo-validate.ts   不动坐标,只重跑校验                │
│    geo-refresh-poi.ts 周期刷新 POI (30 天)             │
│    geo-audit.ts      数据质量审计 + 抽样比对            │
└────────────────────────────────────────────────────────┘
```

### 2.1 数据流

**主线 A · 一次性补全（项目启动跑一次，后续按需续跑）**

```
2700 院校 (geoStatus=pending)
  → CampusExtractor.extract()         发现校区 [本部, 威海, 深圳]
  → Geocoder.geocode()                每校区拿坐标
  → DB write (transaction)            写 University + UniversityCampus
  → fetchPoi (3 类周边搜索)            拿 POI 列表
  → DB write                          写 UniversityCampusPoi + 衍生数字
  → Validator.validate()              7 条规则
  → 异常 → UniversityGeoIssue
  → RetryChain.retry()                自动重整 ≤ 3 次
  → 仍失败 → status=manual_required
```

**主线 B · 用户访问详情页**

```
GET /universities/:id
  → 后端关联查询,只返回 geoStatus='verified' 的 campuses
  → 前端 campuses.length > 0 → 渲染 Tab「校区位置」
                          = 0 → Tab 不渲染 (失败静默)
  → 用户切到 Tab → AMap 懒加载 → 渲染所有 marker
  → 切换校区 → 调 GET /campuses/:id/pois?category=subway|mall|airport
            → 后端从 UniversityCampusPoi 表查
```

---

## 3. 数据模型

### 3.1 University 表 — 新增字段

```prisma
model University {
  // ...现有字段保持不变...

  // === 新增: 主校区/注册地兜底坐标 ===
  address      String?   @db.VarChar(500)
  latitude     Decimal?  @db.Decimal(9, 6)        // GCJ-02 (高德坐标系)
  longitude    Decimal?  @db.Decimal(9, 6)
  geoStatus    String    @default("pending") @map("geo_status") @db.VarChar(20)
  geoSource    String?   @map("geo_source") @db.VarChar(50)
  geoUpdatedAt DateTime? @map("geo_updated_at")

  campuses     UniversityCampus[]
  geoIssues    UniversityGeoIssue[]
}
```

**字段语义**：

| 字段 | 取值 | 说明 |
|---|---|---|
| `geoStatus` | `pending` / `verified` / `invalid` / `missing` | 前端唯一判断依据 |
| `geoSource` | `amap_geocode` / `amap_poi` / `charter_llm` / `manual` | 用于排查"这条坐标是哪条 pipeline 给的" |

### 3.2 UniversityCampus（新表）

```prisma
model UniversityCampus {
  id             Int      @id @default(autoincrement())
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @updatedAt @map("updated_at")
  universityId   Int      @map("university_id")

  // 校区基本
  name           String   @db.VarChar(100)         // "本部"/"威海校区"/"沙河校区"
  isMain         Boolean  @default(false) @map("is_main")
  province       String?  @db.VarChar(50)
  city           String?  @db.VarChar(100)
  district       String?  @db.VarChar(100)         // 区县,反查时填

  // 地理
  address        String?  @db.VarChar(500)
  latitude       Decimal? @db.Decimal(9, 6)
  longitude      Decimal? @db.Decimal(9, 6)
  geoStatus      String   @default("pending") @map("geo_status") @db.VarChar(20)
  geoSource      String?  @map("geo_source") @db.VarChar(50)
  geoUpdatedAt   DateTime? @map("geo_updated_at")

  // POI 衍生数字 (D 二期筛选条件用)
  distanceToCityCenter Int?     @map("distance_to_city_center")    // 米
  nearestSubwayMeters  Int?     @map("nearest_subway_meters")
  nearestAirportKm     Decimal? @map("nearest_airport_km") @db.Decimal(6, 2)

  // 溯源
  discoveredFrom String?  @map("discovered_from") @db.VarChar(50)
                          // enrollment_plan_tag | charter_extract | amap_search | manual

  university     University @relation(fields: [universityId], references: [id], onDelete: Cascade)
  pois           UniversityCampusPoi[]

  @@unique([universityId, name])                   // 同校下校区名不重复
  @@index([universityId, geoStatus])               // 详情页高频查询
  @@map("university_campuses")
}
```

### 3.3 UniversityCampusPoi（新表）

```prisma
model UniversityCampusPoi {
  id         Int      @id @default(autoincrement())
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")
  campusId   Int      @map("campus_id")

  amapId     String   @map("amap_id") @db.VarChar(50)   // 高德 POI ID, 跨次去重
  name       String   @db.VarChar(200)
  category   String   @db.VarChar(50)                   // subway | mall | airport
  typecode   String?  @db.VarChar(20)                   // 高德原始 typecode

  latitude   Decimal  @db.Decimal(9, 6)
  longitude  Decimal  @db.Decimal(9, 6)
  address    String?  @db.VarChar(500)
  distance   Int                                         // 米,距校区中心 (后端预算好)
  metadata   Json?                                       // 地铁线路名 / 机场代码等

  source     String   @default("amap_around") @db.VarChar(50)
  fetchedAt  DateTime @map("fetched_at")
  obsolete   Boolean  @default(false)                   // 30 天刷新时若该 POI 消失则标记

  campus     UniversityCampus @relation(fields: [campusId], references: [id], onDelete: Cascade)

  @@unique([campusId, amapId])
  @@index([campusId, category, distance])              // 按类别排距离
  @@map("university_campus_pois")
}
```

### 3.4 UniversityGeoIssue（新表）

```prisma
model UniversityGeoIssue {
  id            Int       @id @default(autoincrement())
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")
  universityId  Int       @map("university_id")
  campusId      Int?      @map("campus_id")             // 校区级 issue 才填

  issueType     String    @map("issue_type") @db.VarChar(50)
  detail        Json?

  status        String    @default("pending") @db.VarChar(20)
                          // pending | retrying | resolved | manual_required
  retryCount    Int       @default(0) @map("retry_count")
  lastRetryAt   DateTime? @map("last_retry_at")
  resolvedAt    DateTime? @map("resolved_at")
  resolvedBy    String?   @map("resolved_by") @db.VarChar(50)
                          // auto | manual:userId | manual:cli

  university    University @relation(fields: [universityId], references: [id], onDelete: Cascade)

  @@index([universityId])
  @@index([status])
  @@index([issueType])
  @@map("university_geo_issues")
}
```

### 3.5 issueType 枚举（一期 9 类）

| issueType | 含义 | retry 策略 |
|---|---|---|
| `missing` | 无地址 | 爬章程 → 反搜阳光高考 |
| `geocode_no_result` | 高德返回 0 命中 | 去括号 / 加省市 / 改 PlaceSearch |
| `out_of_china` | 经纬度落境外 | 加 city 限定重 geocode |
| `province_mismatch` | 反查行政区 ≠ University.province | 加省市限定重 geocode |
| `duplicate_coord` | 与其他院校坐标重合（< 50m） | 直接进 manual_required |
| `campus_distance_anomaly` | 同 city 但相距 > 800km | 重 geocode 分校区 |
| `address_ambiguous` | 高德返回多结果 | 取分数最高 + type=高等院校 限定 |
| `poi_zero_subway` | 半径 2km 找不到地铁站 | 标记观察（可能是真没有） |
| `poi_fetch_failed` | around 调用失败 | 等下次刷新 |

### 3.6 Migration 计划

1. `pnpm prisma migrate dev --name add_university_geo_fields_and_tables`
2. 生成 SQL：所有新字段 nullable + 三张新表
3. 不需要手动数据回填 —— 所有院校 `geoStatus='pending'`，等 backfill 脚本逐条更新
4. 零停机（向后兼容；旧代码不读这些字段不会爆）

### 3.7 索引策略

| 索引 | 用途 |
|---|---|
| `UniversityCampus(universityId, geoStatus)` | 详情页查"该校所有 verified 校区" |
| `UniversityCampusPoi(campusId, category, distance)` | 按类别取最近 N 个 |
| `UniversityGeoIssue(status)` | 二期 admin 列表按状态筛选 |
| ❌ 暂不加 `(latitude, longitude)` 空间索引 | 一期不需要半径搜索；D 二期再加 |

---

## 4. 后端服务模块

放在 `apps/server/src/modules/geo/`，5 个 NestJS Provider，互相依赖注入解耦。

### 4.1 `amap.client.ts` — 高德底层 HTTP

包装高德 Web 服务的 5 个接口为 Promise 方法：`geo` / `regeo` / `place/text` / `place/around` / `district`。

**功能要求**：
- **限速**：QPS 10（用 `bottleneck` 或自写 token bucket，预留余量；个人版理论 50/s）
- **重试**：网络错误 / 429 / 5xx 自动 retry 3 次（指数退避 1s/2s/4s）
- **缓存**：同一参数 24h 复用结果（Redis 优先，开发期降级为内存 LRU）
- **签名**：`sig` 字段按高德规则计算（key 已开启 sig 时启用，否则跳过）
- **降级**：高德整体不可用时抛 `AmapUnavailableError`，上层进 issue 队列

**接口形状**：
```ts
interface AmapClient {
  geocode(address: string, opts?: { city?: string }): Promise<GeoResult | null>;
  regeocode(lng: number, lat: number): Promise<RegeoResult>;
  searchPlaceText(keywords: string, opts?: { city?: string; types?: string }): Promise<Poi[]>;
  searchPlaceAround(lng: number, lat: number, opts: { types: string; radius: number }): Promise<Poi[]>;
  district(keywords: string): Promise<District | null>;
}
```

### 4.2 `geocoder.service.ts`

业务封装。输入院校名/地址/校区候选 → 调 amap.client → 返回标准化 `GeoResult { address, lat, lng, district, source }`。

### 4.3 `campus-extractor.service.ts` — 多校区发现

**三源融合**，按可信度排序：

| # | 来源 | 实现 | 覆盖率估计 |
|---|---|---|---|
| 1 | 招生计划备注 | 扫 `EnrollmentPlan.majorName / remarks` 的 `[威海]` `（深圳）` `沙河校区·` 模式（正则） | ~40% |
| 2 | 招生章程全文 | 正则 + 简化 LLM 抽取「我校现有 X 个校区,分别位于…」 | ~70% |
| 3 | 高德 POI 兜底 | `searchPlaceText("哈工大威海")` 看 POI 是否独立命中 | 验证用 |

**输出**：
```ts
type CampusCandidate = {
  name: string;
  source: 'enrollment_plan_tag' | 'charter_extract' | 'amap_search';
  hint?: { city?: string; province?: string };
};
extract(universityId: number): Promise<CampusCandidate[]>
```

> ⚠️ 章程解析独立成异步任务（不阻塞 backfill 主流程）。backfill 遇到章程未解析的院校先用源 1+3，章程任务跑完后增量补漏。

### 4.4 `validator.service.ts` — 7 条校验

```ts
class GeoValidator {
  async validate(target: UniversityWithCampuses): Promise<ValidationReport>;
  // 内部 7 个 private check 方法,逐一对应 § 3.5 的 issueType
}
```

**关键阈值（写在 config，不硬编码）**：
- `out_of_china`: lng ∉ [73, 136], lat ∉ [3, 54]
- `duplicate_coord`: 距离 < 50m 视为重合（避免浮点精度误报）
- `campus_distance_anomaly`: **距离 > 800km AND 主分校 city 相同**才报（跨省距离远是正常的）

### 4.5 `retry-chain.service.ts` — 按 issueType 路由

```ts
const STRATEGIES: Record<IssueType, RetryStrategy[]> = {
  missing: [FetchFromCharterStrategy, FetchFromSunlightStrategy],
  geocode_no_result: [GeocodeWithoutBracketStrategy, GeocodeWithProvinceCityStrategy, GeocodeAsPoiStrategy],
  out_of_china: [GeocodeWithProvinceCityStrategy],
  province_mismatch: [GeocodeWithProvinceCityStrategy],
  duplicate_coord: [],                           // 直接 manual_required
  campus_distance_anomaly: [ReGeocodeCampusStrategy],
  address_ambiguous: [PickHighestScoreStrategy],
  poi_zero_subway: [],
  poi_fetch_failed: [],                          // 等下次刷新
};

class RetryChain {
  async retry(issue): Promise<RetryResult> {
    if (issue.retryCount >= 3) return { success: false, reason: 'max_retries' };
    for (const strategy of STRATEGIES[issue.issueType]) {
      const result = await strategy.execute(issue);
      if (result.success && await this.revalidate(result.fix)) {
        return { success: true, fix: result.fix, by: strategy.name };
      }
    }
    return { success: false, reason: 'all_strategies_failed' };
  }
}
```

每个 Strategy 是独立类（单测好写）；失败 3 次 → `status='manual_required'`。

### 4.6 backfill 脚本

`apps/server/scripts/geo-backfill.ts`：

```
命令行参数:
  --resume         续跑(只处理 geoStatus=pending)        (默认)
  --force          全量重跑(忽略已 verified)
  --dry-run        只打印不写库
  --filter 985,211 只跑特定标签
  --concurrency 5  并发度 (受 QPS 限制)
  --skip-poi       只跑坐标,不拉 POI

输出:
  - 进度条 (cli-progress)
  - 实时统计: verified / invalid / missing
  - logs/geo-backfill-YYYYMMDD-HHmm.json
      { total, verified, invalid, issues_by_type, duration }
```

### 4.7 其他脚本

- `geo-validate.ts` — 不调高德，只重跑 validator（校验规则升级后用）
- `geo-refresh-poi.ts` — 30 天周期刷 POI（标记消失的为 obsolete=true，不删）
- `geo-audit.ts` — 抽样 100 个院校与高德官网搜索结果对比，差异 > 10km 标记可疑

---

## 5. API 端点

### 5.1 详情接口扩展

`GET /universities/:id`（现有）返回结构增补：

```ts
{
  ...existing fields,
  campuses: Array<{        // 仅返回 geoStatus='verified' 的
    id: number;
    name: string;
    isMain: boolean;
    province: string;
    city: string;
    district: string | null;
    address: string;
    latitude: number;
    longitude: number;
    distanceToCityCenter: number | null;
    nearestSubwayMeters: number | null;
    nearestAirportKm: number | null;
  }>;
}
```

### 5.2 校区 POI 端点（新）

```
GET /api/universities/:uniId/campuses/:campusId/pois
  ?category=subway|mall|airport
  ?limit=10

→ Array<{
    id, amapId, name, category, latitude, longitude,
    address, distance, metadata
  }>
```

按 `distance` 升序，仅返回 `obsolete=false`。

### 5.3 高德服务端代理（前端用）

`apps/web/src/app/api/amap-proxy/[...path]/route.ts`：
- 接收 `/api/amap-proxy/v3/...` 请求
- 加 sig 签名 → 转发到 `https://restapi.amap.com/v3/...`
- 原样回传响应

意义：jscode 永远在服务端，前端 bundle 看不到。

---

## 6. 前端组件

### 6.1 组件结构

```
apps/web/src/components/university/campus-location/
  ├─ CampusLocationTab.tsx      容器: 拿数据 + 装配 Map 与 Panel
  ├─ CampusMap.tsx              AMap 渲染 + marker 管理 (左 2/3)
  ├─ CampusPanel.tsx            右侧/下侧面板容器 (P2 布局)
  │   ├─ CampusCard.tsx           [子组件] 单个校区卡片 (含城市/区县)
  │   └─ PoiSummary.tsx           [子组件] POI 一屏汇总 (3 类各最近 1-2)
  ├─ usePoi.ts                  hook: 调后端 POI 端点 + React Query 缓存
  └─ amap-loader.ts             AMap SDK 单例加载器
```

挂载点：`apps/web/src/app/(main)/universities/[id]/page.tsx` 的 `tabItems` 数组中**条件插入**：

```ts
...(university.campuses?.length > 0
  ? [{
      key: 'campus',
      label: <span><EnvironmentOutlined className="mr-1" />校区位置 ({university.campuses.length})</span>,
      children: <CampusLocationTab campuses={university.campuses} />,
    }]
  : []),
```

> campuses 为空的院校 → Tab 整个不渲染（失败静默）。

### 6.2 P2 面板布局

```
右侧 (1/3) 面板:
  ┌──────────────────────┐
  │ 校区列表 (竖排卡片)    │
  │  ▌ 🟢 本部 · 主校区   │ ← 选中态: 蓝色边
  │     哈尔滨 · 南岗区    │
  │  ▌ 威海校区          │
  │     威海 · 环翠区     │
  │  ▌ 深圳校区          │
  │     深圳 · 南山区     │
  ├──────────────────────┤
  │ POI 一屏汇总          │
  │  🚇 最近地铁          │
  │     西大直街  380m    │
  │  🛍 周边商圈          │
  │     王府井  1.8km     │
  │  ✈️ 最近机场          │
  │     哈尔滨太平 38km   │
  └──────────────────────┘
```

### 6.3 AMap SDK 懒加载

只在用户切到 Tab "校区位置" 时下载 ~300KB SDK。开发期 `securityJsCode` 写 `.env.local`；生产期走服务端代理。

### 6.4 响应式断点

| 断点 | 布局 | 地图高度 |
|---|---|---|
| `< 768px` | 上下堆叠（地图先、面板后，POI 默认折叠） | 320 px |
| `768–1024` | 左 3/5 + 右 2/5 | 400 px |
| `≥ 1024px` | 左 2/3 + 右 1/3 | 480 px |

### 6.5 错误处理

| 情况 | UI |
|---|---|
| AMap SDK 加载失败 | 占位框 + "地图加载失败,请刷新重试" + 重试按钮 |
| SDK 加载超时 (10s) | 同上 |
| POI 列表请求失败 | 该类别显示"暂时无法加载",不影响其他类别 |
| 单个 campus.geoStatus 非 verified | 后端已过滤,前端不会拿到 |
| 整个 campuses 数组为空 | Tab 整体不渲染 |

---

## 7. 高德 Key 与配额

### 7.1 已申请

| Key 名 | 类型 | 用途 | 安全密钥 |
|---|---|---|---|
| `SL_JS` | Web 端 (JS API) | 前端地图 SDK + 渲染 | 已有 |
| `SL` | Web 服务 | 后端批量 geocoding + POI | **未启用 sig**（上线前必补） |

### 7.2 环境变量

```dotenv
# apps/web/.env.local                 (实际值由开发者从控制台填入,不进 git)
NEXT_PUBLIC_AMAP_JS_KEY=<SL_JS Key 值>
NEXT_PUBLIC_AMAP_JS_SECURITY=<SL_JS 安全密钥>     # 仅开发期使用,生产走服务端代理
AMAP_JS_SECURITY_SERVER=<SL_JS 安全密钥>           # 服务端代理用 (无 NEXT_PUBLIC_ 前缀)

# apps/server/.env                    (实际值由开发者从控制台填入,不进 git)
AMAP_SERVICE_KEY=<SL Web 服务 Key 值>
AMAP_SERVICE_SIG=<SL Web 服务 sig 数字签名>        # 上线前补
AMAP_RATE_LIMIT_QPS=10
AMAP_DAILY_QUOTA=5000
GEO_BACKFILL_BATCH_SIZE=50
```

> ⚠️ **凭证管理**：所有 Key/Secret 通过 `.env*` 注入,`.env*` 已在 `.gitignore` 范围。spec 文档**绝不**写真值。

### 7.3 首跑配额预算（个人版 G1）

| 项 | 调用数 |
|---|---|
| Geocoding（主校区+多校区） | ~13,500 |
| PlaceSearch around (POI 预存) | ~40,500 |
| **总计** | **~54,000** |
| 个人版日额（每接口） | 5,000 |
| **首跑预计天数** | **~11 天** |

> backfill 脚本支持 `--resume`，每天跑到配额上限自动停，第二天继续。

### 7.4 上线前必做（控制台）

- [ ] SL Web 服务 Key 启用 sig 数字签名
- [ ] SL Web 服务 Key 绑定生产服务器公网 IP 白名单
- [ ] SL_JS Web 端 Key 绑定生产域名白名单
- [ ] 前端服务端代理路由（`/api/amap-proxy`）部署验证

---

## 8. 测试策略

| 类型 | 工具 | 覆盖 |
|---|---|---|
| 单元测试 | Jest | 每个 Strategy / Validator 规则 / Extractor 规则一组 fixture |
| amap.client mock | nock / msw | 模拟 success / no_result / 429 / 5xx |
| 集成测试 | testcontainers + MySQL | 跑 5 个真实院校（清华/哈工大/电子科大/西南交大/某民办）的完整 pipeline + 验证 transaction 回滚 |
| 数据质量审计 | `geo-audit.ts` | backfill 后抽 100 校与高德官网比对 |

**硬性指标**（写在 audit 脚本里 assert）：
- 985/211 院校 verified 率 = 100%
- 全量 verified 率 ≥ 90%
- 已知多校区院校（哈工大/电子科大/东南大学等 ~50 所）`campuses.length ≥ 2`
- 抽样 100 校与高德官网坐标差异 > 10km 比例 ≤ 5%

---

## 9. 风险与未决项

| 风险 | 缓解 |
|---|---|
| 高德 PlaceSearch 个人版实际配额可能 < 5000/天 | 等用户确认控制台显示数值；若严重不足则申请企业认证或砍掉 POI 预存范围（仅 985/211 + 双一流） |
| 章程 PDF 抽取复杂度未知 | 章程解析独立异步任务,不阻塞主 backfill |
| 多校区数据采集质量参差 | 985/211 优先验证 + audit 脚本硬性 assert |
| Web 服务 Key 未启用 sig 签名 | 上线前必做（已记入 § 7.4） |
| 前端 AMap SDK 加载失败影响 Tab | 优雅降级（错误占位 + 重试按钮） |

**未决项**（实施期需要决断）：
1. 章程文本抽取：用本地正则简化版 还是 调 LLM？(暂定一期用正则,二期升级)
2. POI 30 天刷新触发器：cron 还是手动？(暂定手动,二期 admin 触发)
3. UniversityCampusPoi 表的 obsolete 字段是否做 hard delete？(暂定保留作历史)

---

## 10. 阶段交付里程碑

**一期**（本 spec 范围）：

1. Schema migration（3 张新表 + 1 张表加字段）
2. geo 模块 5 个服务 + 单元测试
3. 4 个 CLI 脚本（backfill / validate / refresh-poi / audit）
4. 后端 API 扩展 + POI 端点
5. AMap 服务端代理 route
6. 前端 Tab "校区位置" 完整组件树
7. backfill 跑完（约 11 天，与开发并行）
8. 数据质量审计达标

**二期**（不在本 spec）：

1. Admin 数据健康面板（消费 UniversityGeoIssue 表 + 一键重跑 + 手动改坐标）
2. D 方案：列表页"按地图选校"模式
3. 章程 LLM 抽取 pipeline
4. POI 自动刷新调度系统

---

## 11. 已确认的关键决策

| # | 决策项 | 定值 | 理由 |
|---|---|---|---|
| 1 | 校区维度 | C1 完整版 | 多校区都标 |
| 2 | 数据自愈闭环 | 一期就做 (CLI+DB) | Admin 面板二期 |
| 3 | POI 数据策略 | 预存 | 配额 / 速度 / 数据治理一致性 / D 二期需要 |
| 4 | 地图服务商 | 高德 | 国内 GCJ-02 准 + 中文文档全 |
| 5 | UI 布局 | E2 独立 Tab | 空间充裕,多校区切换流畅 |
| 6 | 面板布局 | P2 竖排校区 + POI 一屏 | 信息密度高,无需切 Tab |
| 7 | 移动端 | 一期必做 | 70% 高考考生移动访问 |
| 8 | 配额方案 | G1 个人版 | 首跑 ~11 天可接受 |
| 9 | 失败显示策略 | 静默(Tab 不渲染) | 避免给学生不专业感 |
