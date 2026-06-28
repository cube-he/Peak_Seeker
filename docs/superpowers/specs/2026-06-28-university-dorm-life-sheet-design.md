# 院校宿舍生活情况 — 合并入库 + 方案页打印下载

> 设计文档 · 2026-06-28
> 状态：待用户确认

## 1. 背景与目标

数据团队产出了 `全国重点高校宿舍与设施情况汇总.xlsx`（35 列 × ~3056 所院校），覆盖宿舍条件、作息管理、校园网、周边生活等"学生最关心但官方资料里查不到"的软信息。

两个目标：

- **A. 入库**：把其中 28 个宿舍/生活字段并入院校库（`universities` 表），并同步到生产。
- **B. 打印下载**：在方案详情页（如 `/teacher/plans/78`）新增一个"院校生活情况"打印下载，把该方案里**各院校**的宿舍生活情况汇成**一份合订打印页**（A4，Ctrl+P 存一个 PDF），帮学生了解学校本身。

## 2. 范围

**做：**
- `universities` 表新增 28 列（宿舍生活字段，全 `String? @db.Text`）
- 导入脚本 `import-university-dormitory.ts`（复刻现有 import 模式，按名匹配，NULL-safe 增量）
- 新后端端点 `GET /plans/:planId/dorm-sheet`
- 新打印页 `(print)/plan-dorm/[id]`，一所院校一节
- 方案详情页"打印/导出 PDF"卡片新增第三个按钮

**不做（明确排除）：**
- 不在打印页混入院校库已有的其它信息（满意度/就业/排名/标签）——**只放 file1 的宿舍生活设施**（用户已定）
- 不改家长版 A3（`plan-sheet`）、填报预案表、`exportFullExcel` 三个既有导出
- 不做按校单独下载、不做勾选子集（用户已定：一份合订）
- 不做生活字段的筛选/检索 UI（本期纯展示；列已是独立列，以后要做筛选再说）
- file2（`院校全量数据_多Sheet.xlsx`）本期不动，它是院校库既有来源，无需重导

## 3. Part A：数据入库

### 3.1 新增 28 列（`model University`）

全部 `String? @db.Text`：值是自由文本（多校区会写成 `八里台校区分时段; 津南校区全天`），且 `universities` 表已 80+ 列，用 `TEXT`（行外存储）规避 MariaDB 65535 字节行宽上限。纯展示用，无需索引。

放在 schema 一个独立注释块：`// === 宿舍生活情况 (来源: 全国重点高校宿舍与设施情况汇总.xlsx) ===`

| Prisma 字段 | @map 列名 | 中文 | file1 源列 |
|---|---|---|---|
| `multiCampus` | `multi_campus` | 存在多校区 | ⭐存在多校区 |
| `loftBed` | `loft_bed` | 上床下桌 | 上床下桌 |
| `roomCapacity` | `room_capacity` | 几人间 | 几人间 |
| `dormAirConditioner` | `dorm_air_conditioner` | 宿舍空调 | 宿舍空调 |
| `privateBathroom` | `private_bathroom` | 独立卫浴 | 独立卫浴 |
| `hotWaterSchedule` | `hot_water_schedule` | 洗澡热水时段 | 洗澡热水时段 |
| `washingMachine` | `washing_machine` | 洗衣机 | 洗衣机 |
| `dormPowerLimit` | `dorm_power_limit` | 宿舍限电瓦数 | 宿舍限电瓦数 |
| `classroomAirConditioner` | `classroom_air_conditioner` | 教室空调 | 教室空调 |
| `allNightStudyRoom` | `all_night_study_room` | 通宵自习室 | 通宵自习室 |
| `nightPowerCut` | `night_power_cut` | 夜间断电 | 夜间断电 |
| `nightNetworkCut` | `night_network_cut` | 夜间断网 | 夜间断网 |
| `dormInspection` | `dorm_inspection` | 查寝情况 | 查寝情况 |
| `curfewTime` | `curfew_time` | 晚归门禁时间 | 晚归门禁时间 |
| `morningEveningStudy` | `morning_evening_study` | 早晚自习 | 早晚自习 |
| `morningRun` | `morning_run` | 晨跑要求 | 晨跑要求 |
| `runningCheckIn` | `running_check_in` | 跑步打卡要求 | 跑步打卡要求 |
| `campusNetworkSpeed` | `campus_network_speed` | 校园网速度 | 校园网速度 |
| `campusNetworkPrice` | `campus_network_price` | 校园网价格 | 校园网价格 |
| `freshmanComputer` | `freshman_computer` | 大一带电脑 | 大一带电脑 |
| `hasSubway` | `has_subway` | 地铁 | 地铁 |
| `distanceToCity` | `distance_to_city` | 市区距离 | ⭐市区距离 |
| `transportConvenience` | `transport_convenience` | 学校交通便利 | 学校交通便利 |
| `foodDelivery` | `food_delivery` | 点外卖 | 点外卖 |
| `canteenPrice` | `canteen_price` | 食堂价格感受 | 食堂价格感受 |
| `supermarketPrice` | `supermarket_price` | 超市价格感受 | 超市价格感受 |
| `expressDelivery` | `express_delivery` | 收发快递 | 收发快递 |
| `sharedBikes` | `shared_bikes` | 共享单车 | 共享单车 |

合计 28 列。file1 前 7 列（省份/城市/城市类/层次/性质/院校名称/院校地址）院校库已有，**不重复导入**（`address` 是 geo 兜底来源，不碰）。

### 3.2 Migration

手写 `apps/server/prisma/migrations/20260628xxxxxx_university_dorm_life/migration.sql`，28 条 `ALTER TABLE universities ADD COLUMN ... TEXT NULL`。生产经 `prisma migrate deploy` 自动应用（纯加列，安全；不触碰既有列/索引，避开生产 divergence 雷区）。

### 3.3 导入脚本 `import-university-dormitory.ts`

完全复刻 `import-university-basic.ts` 结构：
- 用 `parseArgs`、`UniversityMatcher.fromDb`、`toText`/`nullIfEmpty` 同款 util
- 读 file1 的 `Sheet1`，列头按中文名取（`colIndexes`）
- 按 `院校名称` 调 `matcher.matchByName`（file1 无 code）；命中多个 id（同名）就全部 patch（校级数据，可接受）
- **NULL-safe**：默认只在库字段为空时填；`--overwrite` 强制覆盖；`--dry-run` 只报告
- 输出匹配统计 + `sampleUnmatched`（预计有几十所名称对不上，列出来人工过目，不阻塞）
- 注册 `package.json` 脚本：`"import:university-dormitory": "ts-node -r dotenv/config scripts/import-university-dormitory.ts"`

用法：`pnpm import:university-dormitory --file=../../data/03_专家版主表/output/全国重点高校宿舍与设施情况汇总.xlsx --dry-run`

### 3.4 同步线上

1. 本地 `prisma generate` + `pnpm --filter server build`
2. `python deploy_auto.py --skip-build --skip-tests`（增量；`migrate deploy` 自动加 28 列）
3. 生产 `cd apps/server && pnpm import:university-dormitory --file=...`（先 `--dry-run` 核匹配率，再正式跑）
4. 无需清 Redis（dorm 字段不进 university 缓存响应路径；如发现 picker/卡片读到旧值再补清 `cache:university:*`）

## 4. Part B：方案页"院校生活情况"打印下载

### 4.1 后端端点 `GET /plans/:planId/dorm-sheet`

挂在 `PlanCandidateController`（已 `@UseGuards(JwtAuthGuard)`，同 `/plans` 前缀）。**不复用** `getExportRows` 的候选富化——dorm 数据是院校级静态字段，直接取即可，逻辑独立更清晰。

Service 方法 `getDormSheet(planId, userId)`：
1. `volunteerPlan.findUnique({ planItems: { orderBy: { sequence: 'asc' } }, student: { user } })`
2. 归属校验（复刻 `getExportRows`：`createdById !== userId && student.userId !== userId` → `ForbiddenException`）
3. 按 `planItems` 顺序去重 `universityId`（保序，跟方案梯度顺序完全一致）
4. `university.findMany({ where: { id: { in } }, select: { 28 字段 + name/province/city/runningLevel/runningNature } })`
5. 按去重后的顺序重排，组装返回

返回结构：
```ts
interface DormSheet {
  plan: { id: number; batchName: string | null; year: number | null };
  student: { name: string | null };
  universities: Array<{
    id: number; name: string; province: string | null; city: string | null;
    runningLevel: string | null; runningNature: string | null;
    dorm: Record<string, string | null>; // 28 字段
    hasData: boolean; // 28 字段是否全空
  }>;
}
```

纯组装（去重+排序+整形）抽到 `plan-dorm-sheet.builder.ts`（无 Prisma，可单测）。

### 4.2 前端打印页 `(print)/plan-dorm/[id]/page.tsx`

复刻 `plan-sheet` 打印页骨架（`'use client'` + `useQuery` + 注入 `@page` `<style>` + `no-print` 操作条 + `document.title` 改文件名）。
- `@page { size: A4 portrait; margin: 12mm; }`
- 组件 `DormInfoSheet`：遍历 universities，**一所一节**
  - 节标题：`校名 · 省市 · 层次 · 性质`
  - 28 字段按 4 组（住宿 / 教学管理 / 网络 / 周边生活）渲染为定义列表或两列表格，空值填"—"
  - `hasData=false` 的院校：整节显示"暂无该校生活数据"，不阻塞
  - 校与校之间 `break-inside: avoid` / `page-break-before`，尽量一校一页或不跨页断裂
- 文件名 `export-filename.ts`：`buildDormTitle` → `学生_批次_院校生活情况_YYYYMMDD`

### 4.3 客户端 API + 入口

- `plan-api.ts` 加 `getDormSheet(planId) => api.get('/plans/${planId}/dorm-sheet')`
- `plans/[id]/page.tsx` 第 1243 行那张"打印/导出 PDF"卡片新增第三个按钮：
  `院校生活情况（A4）` → `window.open('/plan-dorm/${planId}', '_blank', 'noopener')`

## 5. 数据流

```
file1.xlsx ──import-university-dormitory.ts──▶ universities(28 新列)
                                                      │
方案页[打印按钮] ──window.open──▶ (print)/plan-dorm/[id]
                                      │ useQuery
                                      ▼
                       GET /plans/:id/dorm-sheet ──▶ getDormSheet()
                          planItems(按sequence) ─去重─▶ university.findMany(28列)
                                      │
                              DormInfoSheet 一校一节 ──Ctrl+P──▶ 一个 PDF
```

## 6. 测试（TDD 纯逻辑部分）

- `plan-dorm-sheet.builder.spec.ts`：去重保序、空数据 `hasData=false`、跟 sequence 顺序一致
- `export-filename` 的 `buildDormTitle` 单测（非法字符清洗 + 日期）
- service `getDormSheet` 归属校验：越权 `ForbiddenException`、不存在 `NotFoundException`
- 导入脚本沿用既有 import 无单测惯例；靠 `--dry-run` 在真实库验证匹配率
- 前端 `DormInfoSheet` 可加一个渲染快照测试（对齐 `ParentExplainTable.test.tsx` 惯例，按需）

## 7. 风险与决策记录

- **行宽上限**：28 列若用 VarChar 可能撞 MariaDB 65535 行宽 → 全用 `TEXT` 规避。migration 本地先验证应用成功再部署。
- **匹配率未知**：file1 3056 行 vs 库 3835 所，只能按名匹配；先 `--dry-run` 看 unmatched，名称差异（如带括号分校）由 `normalizeUniversityName` 吸收，剩余人工评估是否可接受。
- **存储选型**：用户选 28 独立列（非 JSON），代价是 schema 变宽，收益是以后可做筛选；本期不做筛选。
- **生产 divergence**：纯 `ADD COLUMN`，不依赖既有唯一键/索引，避开已知的 code↔生产 schema 漂移风险。
- **顺序**：跟方案 `planItems.sequence`（冲/稳/保），与家长版一致（用户已定）。
