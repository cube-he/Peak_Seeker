# 家长版志愿方案数据表（A3 横版）导出 — 设计文档

日期：2026-06-26
状态：待用户评审

## 1. 背景与目标

老师做完志愿方案后，需要一张**信息密度高、给家长解释方案**的数据表。现有产物都不满足：

- `PlanPreparationTable`（A4 竖版"志愿填报预案一览表"）是**照着填的填空表**，只有院校代码/院校名/专业组/6 个专业/服从调剂，没有任何决策数据。
- `exportFullExcel`（A3 横版 24 列）**只读方案快照 `plan.planItems`**，缺城市、院校排名、组招生人数、多年计划+征集、学制、专业备注等关键列。

目标：产出一张 **A3 横版、数据丰富、给家长看的方案解释表**，每个专业组展开成它的**全部候选专业**，带多年最低分/计划/征集、学费学制、专业备注等。

## 2. 范围与分期

| 期 | 内容 | 本文档实现目标 |
|---|---|---|
| **共享核心** | 后端富化端点：方案条目 → 富化行 JSON | ✅ 一并实现 |
| **第一期** | A3 HTML 打印页，消费富化 JSON，老师 Ctrl+P 打印 / 另存 PDF | ✅ 本期实现 |
| **第二期** | 扩展 `exportFullExcel` 消费同一份 JSON + 新列，下载 xlsx | 设计覆盖，留待二期 |

writing-plans 先排第一期（含共享核心）。

## 3. 已确认决策

1. **富化来源 = 复用候选服务**（方案 A）。最高价值是"表上数字 = 老师在生成页看到的数字"，复用经过验证的多年/征集/组招生数聚合逻辑，加快照兜底。
2. **专业范围 = 列出组内全部候选专业**（候选服务返回的 `majors[]`，即该组对该生的候选池）。
3. **加"顺位 + 梯度（冲/稳/保）"列**。
4. **23/24 计划人数大面积为空时整列保留，无数据填"—"**，保持年份列对齐。
5. **导出形式 = 打印页 + Excel 都要**（一期打印页，二期 Excel）。

## 4. 架构

```
新增后端端点  GET /plans/:planId/export-rows   (挂 plan-candidate 控制器，与 candidate-groups 同控制器)
   └─ 调 getCandidateGroups(planId, {excludeAdded:false, includeSoftFails/HardFails/RegionMismatch:true,
        pageSize:500, groupBy:'GROUP'})  → 富化好的 groups[]（含各组 majors[]）
   └─ 按方案 planItems 的 (universityId|groupCode) 匹配富化组，按 sequence/梯度排序
   └─ 缺失组用 planItems 快照兜底
   └─ 返回「按专业组分组的富化行」JSON

第一期前端：新增打印路由  src/app/(print)/plan-sheet/[id]/page.tsx （极简布局，无侧栏）
   └─ 客户端拉 export-rows → 渲染 A3 横版表 → @page A3 landscape + 打印按钮(Ctrl+P)
   └─ 方案详情页加按钮「家长版数据表」→ 新标签打开该路由

第二期：export-formatter 增 'excel_parent' 格式，消费 export-rows 同款数据模型 + 新列
```

### 4.1 富化集成（方案 A 细节）

候选服务 `getCandidateGroups(planId, q, userId)` 已从 planId 派生学生/批次/省份/选科，并返回各组富化 `majors[]`。

**调用参数**（确保方案的组与全部候选专业都被取回，不被默认行为藏掉）：
- `excludeAdded: false` —— 默认会**排除已加入方案的组**，必须关掉
- `includeSoftFails: true` / `includeHardFails: true` / `includeRegionMismatch: true` —— 不隐藏任何组/专业
- `page: 1, pageSize: 500` —— 取数无位次限制（位次窗口只是 UI 滑条），大 pageSize 避免分页丢组
- `groupBy: 'GROUP'`

**匹配**：用 `universityId|groupCode` 给返回组建索引；遍历方案 `planItems`（按 sequence 升序，分冲/稳/保段），取出对应富化组。

**兜底**：方案某组在富化结果里找不到（数据变动/极端筛选）时，退回用该 `planItem` 快照渲染该组（院校名/代码/性质/标签/组代码/学费/部分最低分有；城市/排名/多年/征集/学制/备注则为空填"—"），并在该行打一个不显眼的"数据回退"标记供老师识别。

### 4.2 富化数据模型（端点返回）

```ts
interface ExportSheet {
  student: { name; examTypeLabel; score; rank };   // 表头
  plan: { id; name; year; batchName; version };
  groups: ExportGroup[];                            // 按 sequence/梯度有序
}
interface ExportGroup {
  sequence; gradient; gradientLabel;                // 顺位 + 冲/稳/保
  universityName; universityCode; schoolNature; schoolTags; city; universityRank;
  groupCode; groupPlanCount;                        // 组招生人数
  majors: ExportMajor[];                            // 组内全部候选专业
  fallback?: boolean;                               // 走了快照兜底
}
interface ExportMajor {
  majorCode; majorName;
  planCount;                                        // 26 计划
  planByYear: { 2023; 2024; 2025 } | null;          // 多年计划(23/24 多缺→null)
  supplementaryByYear;                              // 各年征集(分轮)，跟在对应年份计划后
  minScoreByYear: { 2023; 2024; 2025 } | null;      // 多年最低分
  duration; tuition;                                // 学制 / 学费
  planNotes;                                        // 专业备注(长文本，前端自动换行)
  bookPageNumber?;                                  // 备用，A3 表暂不强制显示
}
```

> 多年计划/最低分/征集均来自候选服务的 `majorHistory4y` + `supplementaryByYear/RoundsByYear`，口径与生成页一致。

## 5. 列布局（A3 横版）

**院校·组级**（合并单元格，跨该组所有专业行）：
顺位 · 梯度(冲/稳/保) · 院校名称 · 院校代码 · 办学性质 · 学校标签 · 所在城市 · 院校排名 · 专业组代码（单元格内小字"组招 N 人"）

**专业级**（每个候选专业一行）：
专业代码 · 专业名称 · 26计划 · 23计划 · 24计划 · 25计划（征集分轮跟在对应年份后，如 `12 (征2轮)`）· 23最低分 · 24最低分 · 25最低分 · 学制 · 学费 · 专业备注（占剩余弹性宽度，`white-space: normal` 自动换行）

排版要点：
- `@page { size: A3 landscape }`，宽度约 420mm。
- 院校块合并节省横向空间；专业备注吃弹性宽度自动换行；正文 8–9pt。
- 表头 `display: table-header-group` 跨页重复；每个专业组 `break-inside: avoid` 尽量不被分页截断。
- 梯度用淡色底（冲=橙 / 稳=绿 / 保=蓝，复用 `GRADIENT_COLORS` 同色系），打印 `print-color-adjust: exact`。

## 6. 数据可用性与降级

| 列 | 来源 | 缺失时 |
|---|---|---|
| 所在城市 / 院校排名 | University.city / softRanking | "—" |
| 组招生人数 | 候选服务 groupPlanCount | "—" |
| 23/24/25 计划 | majorHistory4y.planCount | **23/24 多缺 → "—"**（整列保留，已确认） |
| 23/24/25 最低分 | majorHistory4y.minScore | "—" |
| 征集 | supplementaryByYear/RoundsByYear | 该年无征集则不显示尾注 |
| 学制 | EnrollmentPlan.duration / major.standardDuration | "—" |
| 专业备注 | EnrollmentPlan.planNotes | 空 |

院校排名口径 = 软科综合排名（数据库现有字段），数值越小越前；null 显示"—"。

## 7. 错误处理

- 方案不存在 / 无权 → 端点 404/403（沿用 getCandidateGroups 既有校验）。
- 方案无条目 → 打印页显示空态"该方案暂无志愿"。
- 富化调用失败 → 端点降级为全快照渲染（每组 fallback:true），不让打印页空白。

## 8. 测试策略

- **后端（单测）**：`export-rows` 组装函数 —— 给定 mock 的 candidateGroups + planItems，断言①匹配正确②兜底触发③多年/征集字段透传④排序按 sequence/梯度。复用 `plan-candidate.service.spec` 既有 mock 风格。
- **前端（组件测）**：A3 表组件 —— 给定 ExportSheet，断言①合并行数=各组候选专业数②征集尾注渲染③空值显示"—"④梯度底色 class。
- 打印 CSS（@page/@media print）不写自动化断言，手动验证（Chrome 打印预览 A3 横版）。

## 9. 非目标（YAGNI）

- 不做服务端 PDF 渲染（puppeteer 等）——打印页"另存为 PDF"已满足。
- 不改现有 `PlanPreparationTable`（填报对照表）与现有 `exportFullExcel`（保持兼容；二期新增 `excel_parent` 格式而非改旧格式）。
- 不修现有"导出 PDF"菜单项的错标问题（超出本任务，仅记录；新按钮独立命名"家长版数据表"以区分）。
- 不加列自定义/显隐配置——先固定本列集。
- 专业备注不做截断/摘要——按原文自动换行。

## 10. 分期验证点

第一期（含共享核心）：
1. 端点 `export-rows` 返回正确富化 JSON → 验证：对演示方案 curl，核对数字 vs 生成页。
2. 打印路由渲染 A3 表 → 验证：浏览器打开，专业组/候选专业/合并正确。
3. Ctrl+P 打印预览 A3 横版、备注自动换行、跨页表头重复 → 验证：Chrome 打印预览人工核对。
4. 方案详情页按钮跳转新标签 → 验证：点击打开。
