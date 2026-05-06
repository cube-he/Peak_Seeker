# Campus Cafeteria Scraping Design (MVP)

**日期**：2026-05-06
**作者**：Claude (with @user)
**状态**：approved, pending implementation

## 背景

研究高考考生/家长择校时关心的地理类信息后，**食堂数量与位置**进入第一梯队（"看吃的是头等大事"），且 AMap 实测覆盖度好（清华校内 10+ 个食堂全部命中，含万人食堂、观畴园、荷园等准确条目）。当前数据库只有"周边设施"（地铁/商场/机场）的 POI 数据，没有"校内设施"。

本 spec 是"校内设施采集"系列的 MVP（首期），只做食堂。后续可扩展图书馆/体育馆/校医院等。

## 目标

为全部 2237 所院校的每个校区采集 AMap 上的食堂 POI（含名称、坐标、距校区距离、可信度），存入新表 `UniversityCampusFacility`，供后续 University 详情页展示。

**成功标准**（可验证）：

- 跑完后 `UniversityCampusFacility` 表有 ≥ 5000 条 cafeteria 记录（保守估计平均每校 2-3 个）
- 抽样 5 个 985 + 5 个二本：985 的 confidence 主要 HIGH/MEDIUM，二本以 MEDIUM/LOW 为主，假阳性率 < 10%
- 全程 AMap 调用 ≤ 2300 次（控制成本 ≤ ¥7）
- 0 个 uni 的处理因 transient 错误而失败（geocoder 已有的重试 + fallback 兜底）

## 非目标

- **不做** 图书馆/体育馆/校医院/校门/宿舍（同套架构，下一个 spec）
- **不做** 前端 UI 展示（数据层 MVP）
- **不做** "假阳性人工 review"流程（先看跑完数据质量再决定）
- **不修改** 现有 `UniversityCampusPoi` 表（周边设施和校内设施职责分开）
- **不做** 实时 refresh / 定时刷新（一次性 backfill；后续可加 cron）

## 设计

### 1) 数据 schema

新增 Prisma model：

```prisma
model UniversityCampusFacility {
  id             Int      @id @default(autoincrement())
  campusId       Int
  campus         UniversityCampus @relation(fields: [campusId], references: [id], onDelete: Cascade)

  category       String   // MVP: 'cafeteria'。后续: 'library'|'gym'|'hospital'|'gate'|'dorm'
  name           String
  latitude       Decimal  @db.Decimal(10, 6)
  longitude      Decimal  @db.Decimal(10, 6)
  address        String?

  amapId         String   // AMap POI ID, 用于幂等 upsert
  typecode       String   // 高德分类码
  distanceMeters Int      // 距 campus 主坐标距离（米）

  confidence     String   // 'high' | 'medium' | 'low'
  matchMethod    String   // 'name_prefix' | 'name_contains' | 'typecode_radius'
  source         String   @default("amap_text")

  fetchedAt      DateTime @default(now())
  obsolete       Boolean  @default(false)

  @@unique([campusId, amapId])
  @@index([campusId, category])
  @@index([category, confidence])
}
```

并在 `UniversityCampus` 加反向关系：

```prisma
model UniversityCampus {
  // ...existing fields...
  facilities UniversityCampusFacility[]
}
```

字段语义：

- **`amapId`**：AMap POI 唯一 ID（如 `B001C80PSJ`），与 `campusId` 复合唯一保证幂等 upsert
- **`distanceMeters`**：从 POI 坐标到「该校区主坐标」的 Haversine 距离（整数米）
- **`confidence`**：判定该 POI 是不是真校内食堂的可信度
- **`matchMethod`**：怎么判定的，用于将来调试和置信度迭代
- **`obsolete`**：留给将来 refresh 时标记"以前有现在 AMap 没了"的条目（不立即删，便于审计）

### 2) 采集逻辑

per university 一次 `/place/text` 调用：

```
GET /v3/place/text?
  keywords=<uniName>食堂
  &city=<uniCity>
  &output=JSON
  &offset=25
  &page=1
```

对返回的每条 POI 执行 5 步过滤+打分：

```
1. 取 uni 的所有 campuses（一对多），含坐标
2. 对每条 POI:
   a. 找最近 campus → distance (Haversine)
   b. distance ≥ 800m → REJECT (校外，不写表)
   c. 否则打分:
       - POI.name 以 uniName 开头                       → HIGH,  matchMethod='name_prefix'
       - POI.name 包含 uniName                          → MEDIUM, matchMethod='name_contains'
       - POI.name 含 "食堂"|"餐厅"|"园"|"苑" 任一
         AND typecode 以 "050" 开头
         AND distance ≤ 500m                           → LOW,    matchMethod='typecode_radius'
       - 否则 → REJECT
3. 通过的 POI upsert (campusId, amapId)
```

打分阈值理由：
- 800m：典型大学占地 0.5–1 km²，800m 半径基本覆盖整个校园而不会漏掉边远食堂
- 500m for typecode_radius 收紧距离：因为这条规则不依赖 name 包含校名，距离严苛些避免商业餐厅混入

### 3) 模块/文件结构

```
apps/server/src/modules/geo/facilities/   (新目录)
├── facility-scorer.service.ts            纯函数：POI[] + campuses[] → ScoredFacility[]
├── facility-scorer.service.spec.ts       (TDD)
├── cafeteria-scraper.service.ts          per-uni: 调 AMap + 调 scorer + upsert DB
└── cafeteria-scraper.service.spec.ts     (TDD with nock-mocked AMap)

apps/server/src/modules/geo/geo.module.ts (改)  注册新 services

apps/server/scripts/
├── geo-cafeteria-backfill.ts             (新) CLI 脚本，参考 geo-refresh-poi.ts
└── geo-cli.module.ts                     (无需改，GeoModule 已 export)

apps/server/prisma/schema.prisma          (改)  加新 model
+ migration 文件                           自动生成
```

职责分离：

- `FacilityScorer`：纯计算，无 IO，无 AMap，无 DB。输入 (pois, campuses, uniName)，输出 [{poi, campus, distance, confidence, matchMethod, accept}]。可独立单测。
- `CafeteriaScraper`：负责一所大学的端到端流程（调 AMap → 调 scorer → 写 DB）
- `geo-cafeteria-backfill.ts`：CLI 入口，遍历所有 uni 调 scraper，进度条 + JSON 报告

### 4) 测试策略

**FacilityScorer 单测**：
- 名称以 uni 开头 + 距离 100m → HIGH
- 名称含 uni + 距离 600m → MEDIUM
- 名称只含"食堂"+typecode 050100 + 距离 400m → LOW
- 距离 850m → REJECT
- 距离 799m + 名以 uni 开头 → HIGH（恰好通过 800m 阈值）
- typecode 不是 050 系列 + 名称不含 uni → REJECT
- 多校区：3 个 campus 同 uni，POI 距离不同，各自 assign 到最近的
- 边界：distance == 800m → REJECT（≥）；distance == 500m for typecode_radius → LOW（取 ≤）

**CafeteriaScraper 集成测**（mocked AMap with `nock`，参考 geo 5-校 integration 测）：
- 清华场景：返回 10 真 POI → 写入 7-10 条，HIGH 占主
- 二本场景：返回 3 真 + 5 假 → 写入 3 条 HIGH/MEDIUM，5 条 REJECT
- AMap 返回 0 → 无写入，无异常
- AMap 抛 AmapApiError (status=0 非 transient) → 传播（CLI 层会 catch + 计 err）
- 重复运行 → upsert 幂等，记录数不增
- POI 标记为非 cafeteria 的（typecode 不是 050 系列）→ 全 REJECT

**生产验证**：
- 抽 10 校肉眼对照（5 个 985 + 5 个二本/职校），用 AMap 网页搜索 "<uniName>食堂" 比对结果
- 统计 confidence 分布：985 应 HIGH 占 60%+，二本 LOW/MEDIUM 为主
- 统计 cafeteria 总数 ≥ 5000

### 5) CLI 脚本

```
pnpm ts-node scripts/geo-cafeteria-backfill.ts [--resume] [--filter 985|211] [--limit N]
```

参考 `geo-refresh-poi.ts` 的样式：进度条、JSON 报告、resume 模式（跳过已采集 uni）。

resume 实现：检查 University.id IN (SELECT DISTINCT campus.universityId FROM facility WHERE category='cafeteria')，跳过已有记录的 uni。

## 失败模式与回滚

### 失败模式 1：误把校外商业餐厅当食堂

最小化策略：800m 距离阈值 + 必须含 uni 名 OR (含食堂关键词 + 050 typecode + 500m)。
若发生：confidence 会标 LOW；前端可只展示 HIGH/MEDIUM。

### 失败模式 2：漏召率（食堂没冠校名又远）

接受。MVP 不追求 100% 召回。后续可加 `/place/around` 双路融合提升召回。

### 失败模式 3：AMap 配额耗尽

不会发生（2237 调用 vs 2 万次池子）。

### 回滚

- DB：`DROP TABLE UniversityCampusFacility` 或 Prisma migration revert（数据是新增，不影响其他表）
- 代码：`git revert <commit-range>`

## 调用预算

- 2237 校 × 1 search × ¥0.003/次 = **¥7**
- QPS=2 → 串行约 90 秒；现有认证升级后可 50 QPS → ~50 秒

## 实施顺序（粗）

1. Prisma migration（新表 + 关系）
2. FacilityScorer + 单测（TDD）
3. CafeteriaScraper + 集成测（TDD with nock）
4. CLI 脚本 `geo-cafeteria-backfill.ts`
5. 部署到生产，跑 backfill
6. 抽样验证质量

详细 task 拆分由 writing-plans skill 产出。

## 风险评估

| 风险 | 概率 | 影响 | 应对 |
|---|---|---|---|
| 二本/职校 AMap 数据稀薄 | 中 | 这部分 uni 食堂数据少 | 接受；前端可标 "数据有限" |
| 误判（商业餐厅当食堂） | 低-中 | 局部数据偏差 | confidence 字段过滤；抽样人工 review |
| 漏判（真食堂被 REJECT） | 中 | 部分食堂没采到 | 后续加 /place/around 双路融合 |
| Prisma migration 出错 | 低 | 部署失败 | 本地先跑 migration dev 验证 |
| 多校区分配错误 | 低 | 食堂被算到错的 campus | 用最近 campus 算法；抽样验证 |
