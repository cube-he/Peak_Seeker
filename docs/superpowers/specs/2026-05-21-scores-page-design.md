# /scores 按分数查页面 — 设计文档

日期：2026-05-21
状态：待评审

## 1. 背景与目标

`/scores` 页面已有完整脚手架（查询表单、筛选器、结果列表、分页、统计卡），但「按分数查」存在一个根本缺口：录取的「冲/稳/保」判断本质按**位次**计算（`AdmissionRow` 的档位依赖用户位次），而页面让用户输入**分数**却不做分数→位次换算。结果：用户只输分数 → 无位次 → 所有结果落入「未知」档，页面核心价值失效。

项目其实已具备一分一段表能力（`score-segment` 模块：分数↔位次互查、跨年等位换算，四川 2022-2025 数据），scores 页面只是没接入。

**目标**：学生输入「分数 + 选科 + 省份」→ 页面用一分一段表换算出位次 → 按冲/稳/保三档展示可报考的院校专业组 → 并提供等位分跨年表。本次只做「按分数查」。

## 2. 范围

**本次包含：**
- 移除「按位次查」模式与「选择查询方式」ModeCard 区
- 查询表单：新增「选科」，移除「浮动范围」输入
- 分数→位次换算（接入 `score-segment/lookup`）
- 「你的定位」卡片（替换原“实时查询预览”侧栏）
- 冲/稳/保三档 Tab 结果区
- 等位分跨年表区块（接入 `score-segment/equivalent`，替换占位 TODO）
- 后端 `/admissions/aggregated` 调整 + 新增结果详情接口
- 移除 4 张省级统计卡

**本次不包含：**
- `score-segment` 接口本身（已完整，直接复用）
- `predictedMinRank` 预测模型（spec-0 已有，直接复用）
- `classifyRank` 冲稳保算法（`utils/classify-rank.ts`，已有且完善，直接复用）
- `AdmissionRow` / `ExpandedAdmissionRow` 组件重写（复用，必要处微调 props）
- 其他页面

## 3. 查询与换算流程

```
用户输入：分数 + 选科(物理/历史) + 省份(固定四川)
        │
        ▼ ① POST /score-segment/lookup {year:2025, examType:选科, score}
换算结果：位次 R + 百分位 P
        │
        ▼ ② GET /admissions/aggregated {rank:R, subjects:选科, province:四川, range:窗口}
院校专业组列表（轻量项 + predictedMinRank）
        │
        ▼ ③ 前端对每条 classifyRank → 冲/稳/保 分桶
冲 Tab / 稳 Tab / 保 Tab
        
另：用 R 调 POST /score-segment/equivalent → 等位分跨年表
```

- **省份**：`score-segment` 与录取数据均为四川口径，页面固定四川（不再让用户选省）。
- **一分一段表年份**：用最新可用年（2025）换算。位次逐年近似稳定，作为预测基准的近似可接受；页面显式标注「基于 2025 一分一段表换算」。
- **选科**：四川新高考首选科目，物理 / 历史二选一；默认取 `examInfo.subjects`。换算与录取查询都按它过滤。

## 4. 页面结构

自上而下：

### 4.1 查询表单
- 字段：选科（物理/历史）、总分（保留大字输入）。省份固定四川（隐藏或只读展示）。
- 移除「选择查询方式」两张 ModeCard、「浮动范围」输入。
- 提交 → 走 §3 流程。

### 4.2「你的定位」卡片（替换原 Step 02 侧栏）
- 展示：换算位次（大字）、省排名百分位（前 X%）、冲/稳/保各档命中的结果数。
- 标注换算依据（2025 一分一段表）。

### 4.3 冲/稳/保结果区
- 三个 Tab：冲 / 稳 / 保，默认停在「稳」。
- 每档内：`AdmissionRow` 列表，可展开 → `ExpandedAdmissionRow`（历年录取趋势 + 当年招生计划 + 征集志愿）。
- 保留批次 / 招生类型 / 院校层次（985/211/双一流）筛选器；移除「科目」筛选（已由选科输入替代）。
- 增量展示（「加载更多」），数据已在前端，无需翻页请求。

### 4.4 等位分跨年表
- 替换底部占位 TODO 区块。
- 用 `score-segment/equivalent`（baseYear 2025、examType 选科、rank R）。
- 表格每年一行（2022-2025）：你的位次在该年 ≈ 多少分 / 位次 / 百分位。

移除原 4 张省级统计卡（数据总量/最高分/平均分/最低分，对单个考生价值低）。

## 5. 冲/稳/保 分档逻辑

复用 `classifyRank(userRank, predictedRank, tier, historical)`：
- `userRank` = 换算位次 R
- `predictedRank` = 该结果 `predictedMinRank.point`
- `tier` = `getTier({is985, is211, batch})`
- `historical` = `isHistorical(subjects)`

返回 rush / stable / safe / elite / unknown，映射：

| classifyRank | Tab |
|---|---|
| rush | 冲 |
| stable | 稳 |
| safe | 保 |
| elite（垫底，过于保险） | 不展示 |
| unknown（预测数据不足） | 不展示；「你的定位」卡片附注「另有 N 所数据不足」 |

阈值取自 `admission-thresholds.ts`（`TIER_THRESHOLDS`，按 985/211/普通本科/专科 分级；历史科 ×1.5）。本次不调阈值。

## 6. 后端改动（admission 模块）

`/admissions/aggregated` 经 grep 确认仅 scores 页面使用，可直接改。

### 6.1 结果列表 `GET /admissions/aggregated`
- 入参：`rank`、`province`、`subjects`（选科，必传）、`range`（位次窗口）。
- 改为返回**轻量**列表项：院校摘要、专业摘要、majorCode/groupCode/batch/recruitType/subjects、`predictedMinRank`。不再在列表里塞 yearlyData / currentPlan / supplementary。
- **分组键加入 `subjects`**：现键 `(universityId, majorCode, groupCode, batch, recruitType)` 不含 subjects，会把物理/历史记录并组（疑似重复行的根因）。加入 subjects 修复。
- 取消 offset 分页：前端按冲/稳/保分桶并增量展示，列表按位次窗口整段返回（`take` 上限作兜底）。
- 窗口 `range`：默认 ±30000（普通本科 `safe` 档量级，足以覆盖 985/211/普通本科 的冲~保；专科结果落此窗口内必为垫底，前端 `classifyRank` 会过滤掉）。专科考生场景见 §11。

### 6.2 结果详情 `GET /admissions/aggregated/detail`（新增）
- 入参：`universityId, majorCode, groupCode, batch, recruitType, province, subjects`。
- 出参：该组合的**全部年份** `yearlyData` + `currentPlan` + `supplementary`。
- 结果行展开时调用。因是单组合独立全量查询，天然不存在旧实现「yearlyData 只含命中年份」的残缺问题。

### 6.3 受影响测试
`admission.e2e-spec.ts` 同步更新。

## 7. 数据流

见 §3 流程图。补充：冲/稳/保分桶、增量展示均为纯前端；结果行展开才请求 `aggregated/detail`。

## 8. 错误与边界处理

- 分数超出一分一段表范围 / 该年该科类无数据 → `score-segment` 抛 400 → 页面提示「换算失败」。
- `predictedMinRank` 为 null → `classifyRank` 返回 unknown → 不进 Tab，计入「数据不足」附注。
- 某档 0 结果 → Tab 内空态。
- 等位分某年缺数据 → 该行跳过（`equivalent` 已处理）。
- `score-segment` / `aggregated` 请求失败 → 错误态（参考现有 `Alert` / `Spin`）。
- 用户改了选科/分数但未重新提交 → 结果不刷新，需重新点查询（与现状一致）。

## 9. 测试

**后端：**
- `aggregated` 列表：`subjects` 入分组键、按位次窗口筛选、轻量字段、prediction 关联正确。
- `aggregated/detail`：全年份 `yearlyData`、`currentPlan`、`supplementary` 正确。
- `admission.e2e-spec.ts` 更新。

**前端：**
- 分数→位次换算流程（mock `score-segment`）。
- `classifyRank` 分桶映射（rush→冲 等）；elite / unknown 不进 Tab。
- 「你的定位」卡片渲染。
- 等位分表渲染。
- 结果行展开触发 `detail` 请求。

走 TDD（RED-GREEN-REFACTOR）。

## 10. 验收标准

- `/scores` 只有「按分数查」；输入选科 + 分数即可查询。
- 查询后展示换算位次 + 省排名百分位。
- 结果分冲/稳/保三档，分档与 `classifyRank` 一致；垫底 / 数据不足不混入三档。
- 结果行可展开看完整历年录取趋势。
- 底部等位分跨年表展示 2022-2025 等位分。
- 旧的按位次查、浮动范围输入、省级统计卡、占位 TODO 区块均已移除。

## 11. 待实现阶段确认的细节

- 位次窗口 `range`：默认 ±30000 对专科考生（位次基数大、`safe` 档达 60000）可能偏窄，是否按 `examType` / 分数段动态调整，或做成配置项。
- 一分一段表换算年份（2025）与 `predictedMinRank` 模型 `targetYear` 的基准年差异，是否需要在 UI 上加一句说明。
- `examInfo.subjects` 的实际存储格式与「物理 / 历史」的精确字符串映射。
- 「数据不足（unknown）」结果是否给一个可展开的查看入口，还是仅在卡片附注计数。
- `ExpandedAdmissionRow` 当前位于 scores 目录但未被引用，确认直接复用还是需微调 props。
