# 院校地域排行板块 — 设计文档

日期：2026-05-20
状态：待评审

## 1. 背景与目标

`/universities` 页面当前是 2237 所在川招生院校的扁平筛选列表（侧边筛选 + 卡片 + 分页）。这套交互面向「已经知道自己要找什么」的用户——需要自己设置筛选条件。

四川考生的真实择校路径是地域性的：**留在川内 / 出省去周边 / 冲发达大城市 / 冲全国名校**。本功能新增一个按地域划分板块的排行视图，给考生一个符合其思考方式的结构化入口。

价值定位：**既是院校地图（浏览发现），又是填报参考**——每个榜单同时给出软科排名（实力信号）和四川录取位次（够不够得着的信号）。

## 2. 范围

**本次包含：**
- `/universities` 页面引入 Tab：「排行导览」（新）/「全部院校」（现有列表）
- 4 个板块组、共 7 个榜单
- 后端新增排行榜数据接口

**本次不包含：**
- 修复现有院校卡片的录取位次显示 bug（见 §8）
- 「全部院校」Tab 内部逻辑改动（仅整体迁移）
- 地图视图、分数排序等其他既有待办
- 后续可能扩展的更多板块（用户明确「先这样，后续再加」）

## 3. 板块结构

「排行导览」Tab 内含 4 个板块组、7 个榜单：

| 板块组 | 榜单 | 层次 |
|---|---|---|
| 川内 | 川内本科榜 / 川内专科榜 | 本科、专科 |
| 四川周边 | 周边本科榜 / 周边专科榜 | 本科、专科 |
| 发达城市 | 发达城市本科榜 / 发达城市专科榜 | 本科、专科 |
| 全国名校榜 | 全国名校榜 | 仅本科 |

**板块边界定义：**

| 板块 | 筛选条件 |
|---|---|
| 川内 | `province = '四川'` |
| 四川周边 | `province ∈ {重庆, 陕西, 云南, 贵州, 甘肃}` |
| 发达城市 | `city ∈ {北京, 上海, 广州, 深圳, 杭州, 南京, 苏州, 天津}` |
| 全国名校榜 | `(is985 OR is211 OR isDoubleFirstClass) AND 本科层次` |

**为什么本/专科必须分榜：** 软科的本科榜与高职（专科）榜是两套相互独立的榜单，排名值不能跨层次比较。因此任何「按排名排序」的榜单必须是单一层次。

**排序规则：** 每个榜按 `softRanking` 升序（1 = 最好）。`softRanking` 为 `0` 或 `null` 一律视为「无排名」，不进入榜单。

榜内重复是正常的：四川大学会同时出现在「川内本科榜」和「全国名校榜」，属不同视角，非 bug。

## 4. 数据

**无需新导入数据。** 所需字段已在数据库 `University` 模型中：
- 排名：`softRanking Int?`（软科排名，唯一覆盖率够用的排名字段，约 66%）
- 标记：`is985` / `is211` / `isDoubleFirstClass`
- 地域：`province` / `city`（100% 覆盖，已建索引）

**录取位次来源：** `AdmissionRecord` 模型。取该院校在四川、最近年份、对应科类与层次的院校整体最低位次：
- `province = '四川'`
- `year` = 全局固定取最近一个有四川录取数据的年份（当前为 2025），不按院校逐个回退到更早年份
- `subjects` 对应当前科类（2025 为四川新高考首年，科类即物理/历史，与 `examType` 直接对应；无需处理旧高考文理映射）
- `recruitType`：本科榜用 `'普通类本科'`，专科榜用 `'普通类高职(专科)'`
- 取 `universityMinRank`（位次）与 `universityMinScore`（分数）

**科类来源：** 全站已有 `studentRankStore.examType`（`'物理'` / `'历史'`，持久化于 localStorage）。排行视图直接复用，Tab 内的科类切换即读写该全局值。

## 5. 架构与组件

### 5.1 后端（NestJS · university 模块）

新增排行榜接口（建议 `GET /universities/ranking-board`）：

- **入参：** `examType`（科类，默认 `'物理'`）
- **出参：** 7 个榜单。每个榜 = `{ boardKey, title, level, items: RankedUniversity[] }`
- **`RankedUniversity`：** `{ rank, id, name, logoUrl, province, city, type, runningNature, is985, is211, isDoubleFirstClass, softRanking, admissionMinRank, admissionMinScore }`
  - `rank` = 榜内名次（1,2,3…）；`softRanking` = 软科全国排名（卡片上作次要信息展示）
- **查询逻辑：** 每个榜一条 `where`（地域 + 层次 + `softRanking > 0`），`orderBy softRanking asc`，返回该榜完整有序列表（不在后端截断）。
- **录取位次：** 收集 7 个榜全部院校 id，一次性批量查询 `AdmissionRecord`（按 §4 条件），再映射回各 `RankedUniversity`。
- **缓存：** Redis，key 含 `examType`，TTL 1 小时（参考现有 `hot-universities`、`university-filters` 缓存模式）。
- **不复用 `findAll`：** 其 DTO `sortBy` 被 `@IsIn(['name','province','type'])` 限定，`province` 仅支持单选，不适配地域组 + 排名排序。

### 5.2 前端（Next.js · /universities）

`/universities` 页面外层引入 Tab（Ant Design `Tabs`）：

- **「全部院校」Tab：** 现有 `FilterPanel` + 卡片列表 + 分页 + 侧栏，整体迁入，逻辑不变。
- **「排行导览」Tab：** 新组件树。

**page.tsx 重构：** 当前 `page.tsx`（约 583 行）把筛选、列表、侧栏全塞在一个组件里。本次借引入 Tab，把现有列表视图抽成独立组件（如 `UniversityListTab`），`page.tsx` 收敛为 Tab 外壳。这是与本任务直接相关的合理改善，不做额外重构。

**新组件：**
- `RankingBoardTab` — 拉取 `ranking-board` 数据，渲染 4 个板块组；承载科类切换（读写 `studentRankStore.examType`）。
- `BoardSection` — 一个板块组：标题、本/专科 toggle（地域板块有，全国名校榜无）。
- `RankRow` — 单行院校：名次徽标、logo、院校名 + 标签（985/211/双一流）、省市与类型、软科全国排名、四川最低位次。
- 每个榜默认显示 Top 10，「查看完整榜单」原地展开剩余（数据已在前端，无需再请求）。

布局已通过可视化 mockup 与用户确认：纵向排行榜形态，板块组自上而下排列。

### 5.3 数据流

```
studentRankStore.examType
        │
        ▼
GET /universities/ranking-board?examType=物理
        │
        ▼
7 个榜单数据（含四川录取位次）
        │
        ▼
RankingBoardTab → 4×BoardSection → RankRow
        ▲
板块组 / 本·专科 toggle 仅切换前端展示，不重新请求
```

## 6. 错误与边界处理

- `softRanking` 为 `0` 或 `null` → 不进榜（这些院校仍可在「全部院校」Tab 筛到）。
- 某榜院校数 < 10 → 显示实际数量，不补位。
- 院校有 `softRanking` 但查不到对应科类/年份的录取记录 → 位次显示 `—`。
- 职业本科（`level = '职业本科'`，71 所）→ 默认不计入本科榜（软科本科榜为普通本科口径）。
- 接口请求失败 → 「排行导览」Tab 内显示错误态（参考现有页面 `Alert` 模式）。
- 加载中 → Tab 内显示 loading（参考现有 `Spin`）。

## 7. 测试

**后端：**
- `ranking-board` 接口：4 板块组 7 榜单的地域 / 层次筛选正确。
- `softRanking > 0` 过滤生效（`0` 与 `null` 都被排除）。
- 各榜按 `softRanking` 升序。
- 录取位次批量关联：科类、年份、`recruitType` 匹配正确；查不到时为 `null`。
- Redis 缓存命中与 `examType` 维度隔离。

**前端：**
- 4 个板块组、7 个榜单渲染。
- 地域板块的本/专科 toggle 切换。
- 科类切换联动（改 `examType` → 重新取数）。
- Top 10 默认展示与「查看完整榜单」展开。
- 「全部院校」Tab 迁移后功能不回归。

**手动验证：** 浏览器内走查 4 板块组、7 榜、科类切换、查看完整榜单、两个 Tab 切换。

## 8. 顺带发现（不在本次范围）

现有院校卡片的「最近一年最低分 / 位次」读取 `admission.minScore` / `admission.minRank`，但 `AdmissionRecord` 模型并无这两个字段（只有 `universityMinRank`、`majorMinRank` 等）——现有卡片该处大概率长期显示 `-`。本次排行榜的位次按 §4 正确接入，不依赖此 bug；现有卡片的修复另行处理。

## 9. 验收标准

- `/universities` 出现「排行导览」/「全部院校」两个 Tab，「全部院校」功能与现状一致。
- 「排行导览」展示 4 板块组、7 个榜单，每榜按软科排名有序。
- 每行院校显示：名次、院校名与标签、省市类型、软科全国排名、四川最低位次。
- 切换科类，录取位次随之变化。
- 地域板块可在本科榜 / 专科榜间切换。
- 「查看完整榜单」可展开榜单全部院校。

## 10. 待实现阶段确认的细节

- `AdmissionRecord.subjects` 字段的实际取值格式，与 `examType`（`'物理'`/`'历史'`）的精确字符串匹配。
- 直辖市（北京 / 上海 / 天津）院校的 `city` 字段取值需与发达城市列表一致，否则该板块漏数据。
- `ranking-board` 接口的具体路由命名与控制器归属。
