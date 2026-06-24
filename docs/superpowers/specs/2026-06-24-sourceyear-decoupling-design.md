# sourceYear 解耦 — 设计文档

- 日期：2026-06-24
- 子项目：A（2026 数据上线 5 子项目之一：A 解耦 / B converter+migration / C 征集 importer / D 收尾编排 / E UI 标注）
- 状态：设计已与项目负责人确认，待转 writing-plans
- 范围：仅方案生成引擎的「取数年份解耦」，纯后端取数逻辑。不含 converter / importer / migration / 前端渲染。

## 背景与动机

方案生成页（`plan-candidate.service.ts` 的主路径 `getCandidateGroups`）当前用**一个** `sourceYear` 同时驱动所有与年份相关的取数：

| 用途 | 调用点 | 现用年份 |
|---|---|---|
| 招生计划取数 | `filters/hard-filter.ts:17`、`buildHardFilterWhere` `year: source.sourceYear` | sourceYear |
| 当年录取线 | `pickGroupScore` 严格 `record.year === sourceYear`，无回退（:1221-1253） | sourceYear |
| 冲稳保梯度基线 | gradient `baseMinRank`（historyMin :1898 / groupHistoryMin :2009） | sourceYear |
| 近 3 年趋势 | `pickGroupHistory` offset 2/1/0 → sourceYear-2/-1/0（:1188-1219） | sourceYear |
| 学生分↔位次换算 | `resolveStudentRank`、`resolveRankWindow`、`computePredictedScoreRange` | sourceYear |

`sourceYear = max(enrollment_plans.year ≤ planYear)`（`resolveEnrollmentPlanSource` :978-1002）。

**问题**：2026 真实招生计划一旦入库，`sourceYear` 跳到 2026；但 2026 录取线/一分一段要到 7 月录取后才有。于是：

- `pickGroupScore` 严格取 `year===2026` → 当年线为空 → `groupMinRank=null`
- `calcDynamicGradient` 在 `baseMinRank` 为空时兜底 `BAO/null`（`gradient-calculator.ts:114-135`）
- `gradientBandOf` 见 `baseMinRank==null` 返回 `NO_LINE`（:120-128）
- 结果：**全组判"无史线"、冲/稳/保梯度塌成 0、当年录取列显"—"**
- `scoreToRank(2026)` 因 `score_segments` 无 2026 行抛 `BadRequestException`（`score-segment.service.ts:40-41`），被各调用方 try/catch 吞掉 → 分数滑块/位次换算静默失效

**已核实的精确边界**（避免按夸大描述误修）：
- 近 3 年趋势表 `history3y` 走 `sourceYear-2/-1/0`，2024/2025 record 仍取得到 → **断的是"当年线+梯度+换算"，不是整段历史**。
- `scoreToRank` 抛错被全部调用方 try/catch 吞 → **页面不崩，是功能降级**。
- 触发前提：必须有人让入库管线真的产出 `year=2026` 的 `enrollment_plans` 行。现状生产库无 2026 计划，故未触发。**因此"先部署解耦、再导 2026 计划"是硬顺序约束。**

**产品视角**：志愿填报发生在录取之前，2026 真实录取线在填报时点本就不存在。冲稳保**必须**用历史线预测 2026 —— 这是产品根需求，不是降级补丁。解耦后"计划用 2026、线/换算用 2025"正是应有行为。鉴于 2026 一分一段与报名/实考人数尚未发布，"就近回退到 2025"在本次上线是**必须项**而非可选项。

## 目标 / 非目标

**目标**
1. 把单一 `sourceYear` 拆成三个独立解析的年份，各司其职。
2. 取线与换算在目标年无数据时，回退到"≤目标年的最近有数据年"，而非塌成 NO_LINE / 抛错。
3. 在 API 响应暴露所用的基线年与回退标志，供子项目 E（前端标注"基于 N 年历史线预测"）消费。

**非目标（属其他子项目）**
- 86 列 converter、enrollment_plans 的 2026 行产出（子项目 B）
- schema↔migration 对齐、弃用 index.ts（子项目 B）
- 征集 importer 补字段（子项目 C）
- 收尾脚本编排 / runbook（子项目 D）
- 前端"历史线预测"标注的渲染（子项目 E，仅消费 A 暴露的字段）

## 设计

### 三个年份

```
planYear              = max(enrollment_plans.year ≤ 请求年)     → 招生计划池 + 在售专业（保持现 sourceYear 解析逻辑）
admissionBaselineYear = max(admission_records.year  ≤ planYear) → 当年线 / 冲稳保梯度基线 / 3年趋势锚点 / currentRecord 查找
scoreSegmentYear      = max(score_segments.year     ≤ planYear) → 分↔位次换算 / 分数滑块定义域
```

2026 场景自动解析为 `planYear=2026, admissionBaselineYear=2025, scoreSegmentYear=2025`。

### 方案选择

- **方案①（采纳）**：一次性解析出 `YearContext { planYear, admissionBaselineYear, scoreSegmentYear, isPlanFallback }` 对象，向下透传，替换所有 `source.sourceYear` 为对应字段。单一真相源、改动集中在解析+传参、最易测。
- 方案②：保留 sourceYear，仅在取线/换算处单独再解析一个 baseline。→ 两套解析、内聚差。
- 方案③：每个调用点各自"就近找有数据年"。→ 逻辑打散、难推理。

采纳 ① 的理由：把"年份从哪来"收敛到一个解析函数，其余调用点只是消费 `YearContext` 的字段，可单独测且改动可追溯。

### 组件与数据流

1. `resolveEnrollmentPlanSource` → 演进为 `resolveYearContext(input)`：
   - 保留现有 `enrollment_plans` groupBy 解析得 `planYear`（即原 sourceYear 口径，含 fallback）。
   - 新增两次轻量 groupBy：`admission_records` / `score_segments`，各取 `max(year ≤ planYear)`，得 `admissionBaselineYear` / `scoreSegmentYear`。
   - 返回 `YearContext`，保留 `isFallbackYear`（计划年回退）并补 `admissionBaselineYear`/`scoreSegmentYear`。
2. 招生计划取数：仍用 `planYear`（`hard-filter.ts`、`buildHardFilterWhere`）。
3. 录取取数 `buildAdmissionRecordWhere`：3 年窗口锚点改为 `admissionBaselineYear`（`[baseline, baseline-1, baseline-2]`），不再用 planYear。
4. `pickGroupScore(records, admissionBaselineYear)`：**加就近年回退** —— 目标年某组无记录时，回退到该组 ≤baseline 的最近有线年份（沿用现有 GROUP→FILING→MAJOR 三级，只是允许跨到最近有数据的那一年）。
5. `pickGroupHistory`：锚点改为 `admissionBaselineYear`（offset 0/-1/-2 不变）。
6. `currentRecord` 查找（`recordKeyOf` 含 year）：用 `admissionBaselineYear`，否则 2026 必 miss 显"—"。
7. 换算三处（`resolveStudentRank` / `resolveRankWindow` / `computePredictedScoreRange`）：用 `scoreSegmentYear`。保留现有 try/catch 兜底。
8. API 响应：带上 `admissionBaselineYear` / `scoreSegmentYear` / `isPlanFallback`，供子项目 E 使用。
9. 次要路径 `getCandidates`（硬编码 2025/2024，非生产主路径）：顺手对齐到 `YearContext`，避免日后腐烂。

### 错误处理 / 边界

- 无 ≤planYear 的录取记录 → `admissionBaselineYear=null` → 该组合法走 NO_LINE（确实没有任何历史线）。
- 无 ≤planYear 的段表 → `scoreSegmentYear=null` → 换算返回 null（现 try/catch 行为保持）。
- `scoreToRank` 改吃 `scoreSegmentYear` 从根上避免 `scoreToRank(2026)` 抛错；不改 `SUPPORTED_YEARS`（那只是 `equivalent()` 用的表象）。

## 测试（TDD：先红后绿）

1. `resolveYearContext`：库为"计划到 2026 / 录取到 2025 / 段表到 2025"时，断言 `planYear=2026, admissionBaselineYear=2025, scoreSegmentYear=2025`。
2. **keystone 回归**（现有 spec 缺）：2026 计划已入库、线止于 2025 时，组**仍拿到 2025 的线与冲稳保梯度**，不是 NO_LINE。
3. `pickGroupScore` 就近年回退：组在 baseline 年无记录、上一年有 → 取到上一年。
4. `scoreToRank` 换算：`planYear=2026` 时用 2025 段表，不抛错、返回有效位次。
5. 既有绿测不回归（在纯 2025 数据下，三年份应仍等同原 sourceYear=2025，行为不变）。

## 验证点

- 单元测试全绿（含上述新增）。
- 在 2025 数据库上造一条假 `year=2026` enrollment_plan 行（仅测试夹具，不入生产）→ 验证生成页组仍读 2025 线、冲稳保正常、滑块可用。

## 关键引用

- `apps/server/src/modules/plan-candidate/plan-candidate.service.ts:978-1002`（resolveEnrollmentPlanSource）
- `:1188-1219`（pickGroupHistory）、`:1221-1253`（pickGroupScore）、`:1004-1018`（buildAdmissionRecordWhere）
- `apps/server/src/modules/plan-candidate/filters/hard-filter.ts:16-21`
- `apps/server/src/modules/plan-candidate/gradient-calculator.ts:114-135`
- `apps/server/src/modules/score-segment/score-segment.service.ts:31,36-60`
- `apps/server/src/modules/plan-candidate/plan-candidate.service.spec.ts:153-188`（现有 fallback 用例，仅覆盖安全反向场景）
