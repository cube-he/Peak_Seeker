# universities 院校库页面 · 功能改造设计

- 日期：2026-05-21
- 页面：`/universities`（`apps/web/src/app/(main)/universities/`）
- 范围：功能性修改。纯视觉样式由 claude-design 后续处理；SSR 改造排到 claude-design 之后，本次不含。

## 一、背景

对页面做了专业 review，得出 17 条问题，覆盖功能 bug、志愿填报领域专业性、技术质量。按性质分为「功能」与「样式」两类，本次只做功能部分，划成 4 个改动单元。

## 二、本次范围

做：

- 单元 1 列表页杂项修复
- 单元 2 筛选器接入 `/filters` 接口
- 单元 3 后端 `findAll` 科类化 + 位次冗余字段
- 单元 4 列表页科类切换 + 位次联动

各单元改到的文件，顺带补齐其中的 `any` 类型（如 `UniversityCard` 的 `uni`、`HotUniversitiesSidebar` 的 list、`university.ts` service 层）。

不做（移交）：

- 纯样式：容器配色、卡片位次/分数视觉主次、热门院校侧栏位置、星标→对比图标、排序结果的分组展示 —— 移交 claude-design
- SSR/SSG 改造 —— claude-design 定型样式与结构后单独进行
- 院校对比功能 —— 本次仅移除现有死按钮；完整对比以后单独立项

## 三、单元设计

### 单元 1 · 列表页杂项修复

文件：`UniversityListTab.tsx`

1. 硬编码标题/数量
   - `2,237 所院校` → 改用 `data.pagination.total`
   - `覆盖 2022-2025 录取数据` → 移除写死年份
   - `FeatureFilters` 里 985/211/双一流的 `count: '39'/'116'/'147'` → 删除（全国数字，与库内「在川招生」口径不符，误导用户）
2. 搜索防抖：`Input onChange` 当前直接 `setFilters` 触发请求 → 对 `keyword` 加 300ms debounce，其余筛选保持立即生效
3. 翻页回顶：`Pagination onChange` 内加 `window.scrollTo({ top: 0 })`
4. pageSize 一致性：初始 `pageSize: 12` 不在 `Pagination` 默认尺寸选项内 → 给 `Pagination` 配 `pageSizeOptions={['12','24','48']}`
5. 移除对比功能：删除 `selectedIds` state、`toggleSelect`，`UniversityCard` 的星标按钮与 `selected`/`onToggleSelect` props，页头「对比已选 (n/3)」按钮

### 单元 2 · 筛选器接入 /filters 接口

后端 `university.service.ts getFilters()`：

- `cities` 的 `groupBy(['city'])` → `groupBy(['province','city'])`，使城市带省份归属，支持「选省后联动城市」

前端 `UniversityListTab.tsx`：

- 删除硬编码常量 `PROVINCES` / `TYPES` 与 `.slice()` 截断（当前 bug：省份只露出前 12 个，四川等不可选）
- `FilterPanel` 改用 `useQuery` 调 `universityService.getFilters()`，渲染全部省份/类型，带真实 count
- 新增「城市」`FilterGroup`：按已选 `province` 过滤 `cities` 列表；未选省份时城市组隐藏

### 单元 3 · 后端 findAll 科类化 + 位次冗余字段

采用方案 A（数据库冗余字段），由用户选定。

**3.1 schema 冗余字段** —— `University` model 新增 4 个：

- `minRankPhysics  Int? @map("min_rank_physics")` —— 物理类「院校最低录取位次」
- `minRankHistory  Int? @map("min_rank_history")` —— 历史类同上
- `predRankPhysics Int? @map("pred_rank_physics")` —— 物理类「院校预测位次」
- `predRankHistory Int? @map("pred_rank_history")` —— 历史类同上
- 4 个字段各加 `@@index`（排序用）

口径定义：

- 「院校最低录取位次」= 该校该科类、库内最新年份、分数最低的专业记录对应的位次（沿用现有 `aggregateLatestAdmission` 口径：`majorMinScore ?? groupMinScore` 取最小值，对应 `majorMinRank ?? groupMinRank`）
- 「院校预测位次」= 该校该科类、`RankPrediction` 中 `recruitType ∈ {普通类本科, 普通类高职(专科)}` 的 `pointRank` 最小值（沿用 `findById` 的 `bestPrediction` 口径：以最难专业组作 benchmark）

**3.2 回填脚本** —— 新增，独立于 import：

- 发现：`scripts/import-data/index.ts` 与当前 schema 已不同步（upsert 用了 schema 中不存在的复合键、不写入 `subjects` 等字段），属旧版本，本次不修改它
- 新增独立脚本 `scripts/import-data/backfill-university-ranks.ts`：遍历 `University`，按 3.1 口径聚合 `AdmissionRecord` 与 `RankPrediction`，`UPDATE` 4 个冗余字段
- 运行时机：在 `AdmissionRecord` 导入、`RankPrediction` 生成之后执行一次

**3.3 findAll 改造** —— `QueryUniversityDto` + `university.service.ts`：

- DTO 新增 `examType?: '物理' | '历史'`（缺省视为物理）；`sortBy` 支持 `minRank`、`tier`（冲稳保）
- 排序映射：`examType` 决定用 `*Physics` 还是 `*History` 字段；`sortBy=minRank` → orderBy 对应 minRank 冗余字段；`sortBy=tier` → orderBy 对应 predRank 冗余字段（predRank 升序 = 难→易 = 冲→保）
- 响应为每个院校注入 `predictedMinRank`（取对应科类 predRank 冗余字段值），供前端算冲稳保
- `latestAdmission` 仍按当前页 12 条实时聚合（DB 已分页），其 `admissionRecords` 查询 where 增加 `subjects` 过滤

**3.4 冲稳保筛选（内存路径）**：

- 「只看冲/稳/保」无法纯 DB 完成（冲稳保档位依赖每校不同的 tier 阈值 + 请求传入的 userRank）
- 该筛选启用时，`findAll` 走内存路径：按 where 取出全部匹配院校（仅查 `University` 单表，含冗余字段，约 2237 行，轻量），JS 用 `classifyRank` 算档位并筛选，再排序分页
- 其余情况走 DB 路径（orderBy 冗余字段 + skip/take）

### 单元 4 · 列表页科类切换 + 位次联动

前端 `UniversityListTab.tsx` + `UniversityCard`：

- Tab 顶部新增物理/历史切换，绑定 `studentRankStore.examType`（与排行榜 Tab 一致，localStorage 持久化）；`examType` 进入 `filters` 传给后端
- `UniversityCard`：读 `studentRankStore.rank`，用 `classifyRank(userRank, uni.predictedMinRank, getTier(...), examType==='历史')` 得档位，渲染现成的 `RankTierBadge` + `RankDistance`。`getTier` 需 `batch` 参数判断专科——院校维度用 `university.level` 适配（值为「专科」时命中专科档）
- 排序条：保留现有排序项，将名不副实的「综合排序」（实为按校名 `name`）正名为「默认排序」；`分数排序待接入`（disabled）启用为「位次排序」；新增「冲稳保排序」
- 筛选：`FilterPanel` 新增「录取概率」组（只看 冲/稳/保）
- 复用：`classify-rank.ts`、`admission-thresholds.ts`、`RankTierBadge`、`RankDistance` 全部直接复用，不新写分类逻辑

## 四、数据流

1. 考生在 scores 页录入分数 → `studentRankStore` 持久化 `score / examType / rank`
2. universities 列表页：`examType`（store）+ 筛选/排序 → `GET /universities?examType=&sortBy=&tier=&province=...`
3. 后端：按冗余字段排序/筛选/分页 + 注入 `predictedMinRank` + 对当前页实时聚合 `latestAdmission`
4. 前端 `UniversityCard`：`classifyRank(store.rank, predictedMinRank, tier, historical)` → `RankTierBadge` / `RankDistance`

## 五、错误处理与降级

- 未录入位次（`studentRankStore.rank == null`）：不显示冲稳保标签；冲稳保排序/筛选项置灰，提示「先在成绩页录入位次」
- 某院校该科类无录取数据：`latestAdmission` 为 null，分数/位次显示「—」
- 某院校无预测位次：`predictedMinRank` 为 null，`classifyRank` 返回 `unknown`，`RankTierBadge` 显示「暂无预测」
- `/filters`、`/universities` 接口失败：沿用现有 `isError` 分支

## 六、测试策略

遵循 TDD（RED-GREEN-REFACTOR）。

- 后端 `university.service.spec.ts`（已存在，扩充）：examType 聚合科类正确、冗余字段排序、`predictedMinRank` 注入、冲稳保内存筛选路径
- 回填脚本：给定 `AdmissionRecord` / `RankPrediction` 夹具，断言 4 个冗余字段算值正确
- 前端：筛选器接 `/filters` 渲染、`classifyRank` 在卡片上的接线、无位次降级；沿用现有 `__tests__` 模式

## 七、部署注意

1. `prisma migrate`：新增 4 字段 + index
2. 跑回填脚本 `backfill-university-ranks.ts` 一次
3. 清 Redis 缓存：`cache:university:*`、`university-filters`（`getFilters` 改了 cities 结构；`findById` 有缓存）
4. 按既有部署流程（`deploy_auto.py`）部署

## 八、实施顺序建议

单元 3（后端 + schema + 回填）是单元 4 的前置依赖。建议顺序：单元 1 → 单元 2 → 单元 3 → 单元 4。单元 1、2 可独立先行交付。
