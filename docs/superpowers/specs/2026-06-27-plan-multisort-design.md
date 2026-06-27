# 方案详情页志愿表多级排序

## 概述

教师方案详情页（`/teacher/plans/:id`）的志愿表目前只能逐行手动拖拽排序。本功能新增**多级（Excel 式）自动排序**：教师堆叠若干排序键（如"梯度 → 办学性质(公办优先) → 专业组分数线(高→低)"），表格按规则重排预览，确认后一键写回志愿顺位（`sequence`）。

排序顺位即平行志愿投档顺序，是这张表的核心产出，因此采用 **"预览 + 一键应用"** 模型：排序先作为可逆的视图变更，教师确认满意再落库。

## 排序模型

排序规则是一个**有序栈**（前端状态）：

```ts
type SortKey =
  | 'GRADIENT'          // 梯度 冲/稳/保
  | 'SCHOOL_NATURE'     // 办学性质 公办/民办/中外合作
  | 'PROVINCE_INOUT'    // 川内 / 川外
  | 'GROUP_MIN_SCORE'   // 专业组最低分
  | 'GROUP_MIN_RANK'    // 专业组最低位次
  | 'PLAN_COUNT'        // 招生计划数
  | 'UNIVERSITY_RANK'   // 院校排名(软科)
  | 'TUITION'           // 学费
  | 'TAGS'              // 985/211/双一流
  | 'RANK_DIFF';        // 相对学生位次差(风险)

interface SortRule { key: SortKey; dir: 'asc' | 'desc'; }
```

排序分两层：

- **分组层 = 梯度（固定第 1 级）**：志愿表始终按 冲/稳/保 分段渲染，这是页面骨架。梯度作为排序键固定在最高层，控制"段序"，不可删除、其余键不能上移到它之上。
- **段内栈 = 其余键的有序列表**：在每一段内部逐级比较。第 1 级相等才看第 2 级，以此类推；必须是**稳定排序**，全部键相等的两行保持原相对顺序。

默认状态 = 当前行为：段内栈为空，段内保持服务端原顺序。

## 排序键清单

| 键 | 方向语义 | 取值来源 |
|---|---|---|
| **梯度** | 冲→稳→保（asc，默认）/ 翻转（desc，仅预览） | `item.gradient`（CHONG/WEN/BAO） |
| **办学性质** | 公办→民办→中外合作（asc）/ 翻转 | `University.runningNature` |
| **川内川外** | 川内优先（asc）/ 川外优先 | `University.province === '四川'` |
| **专业组分数线** | 高→低（desc，默认）/ 低→高 | `score25Group`（分）/ `rank25Group`（位次） |
| **招生计划数** | 多→少 / 少→多 | `item.planCount` |
| **院校排名** | 高→低（排名数字小=高） | `University.softRanking` |
| **学费** | 低→高 / 高→低 | `item.tuition` |
| **985/211/双一流** | 有标签优先 | `University.is985 / is211 / isDoubleFirstClass` |
| **相对位次差** | 稳→冲 / 冲→稳 | `histRank − studentRank` |

**非数值键的内部优先序**（写死常量，方向键反转）：
- 办学性质：`公办(0) < 民办(1) < 中外合作(2)`
- 川内川外：`川内(0) < 川外(1)`
- 标签：有任一标签(0) < 无标签(1)

**空值规则**：任何键取值为 `null/undefined` 的行，在该级比较中**一律沉底**（无论 asc/desc），不参与该键的大小比较；避免富化 miss 的院校（排名 500 名后字段稀疏）打乱排序。

## 梯度的特殊处理

梯度是排序的**分组层**，固定第 1 级，其余键在每段内部生效（冲段内部排好、稳段内部排好、保段内部排好）。志愿表始终按梯度分段渲染，**不支持跨段穿插**——既违投档铁律（保底不能投在冲刺前），又与三段式渲染冲突。

UI 上梯度表现为**固定的第一条排序规则**（带方向切换），用户能感知"它也是排序字段"，但不能删除、其余键不能拖到它之上。

**段序方向**：
- 默认 `asc` = 冲→稳→保。
- 翻转 `desc` = 保→稳→冲，**仅预览看**时反转分段渲染顺序。
- **投档铁律**：点"应用为志愿顺序"写回 `sequence` 时，段序**强制 冲→稳→保**，忽略翻转。写回结果始终是合法的"冲块→稳块→保块、块内按段内栈排"的连续 1..N。

这样保证：段内排序自由、应用永远产出一张合法志愿表。

## 交互流程

### 工具栏入口
志愿表上方 `pl-tbl-toolhint` 区新增 **「排序」** 按钮，点击弹出排序面板（Popover / 抽屉）。

### 排序面板
- **规则栈编辑器**：每行 = 键下拉 + 方向切换按钮 + 删除按钮；底部「+ 加一级」追加规则。
- **快捷预设** chip（一键填入常用栈）：`公办优先`、`川内优先`、`分数线高→低`。
- 切换某级的键时，方向重置为该键默认方向（复用生成页"切轴重置方向"约定）。

### 三个动作
| 动作 | 行为 | 可用条件 |
|---|---|---|
| **预览** | 前端就地按规则栈重排 `localItems`；表顶挂"排序预览中（未保存）"提示条 | 任意方案状态 |
| **应用为志愿顺序** | 计算"冲→稳→保 分块、块内按规则"的扁平 `itemId[]`，调用现有 `reorder` 接口写回 `sequence` | 仅 `DRAFT`；其它状态灰显，提示"仅草稿可写回顺序" |
| **恢复手动顺序** | 丢弃预览，重新拉取 / 还原服务端原顺序 | 处于预览态时 |

## 状态机边界

- **写回（应用）** 只在 `DRAFT`：复用 `plan-item.service.reorder` 的 `getEditablePlan` 守卫（仅 DRAFT 放行）；前端按 `plan.status` 控制"应用"按钮 disabled。
- **预览** 在任意状态可用（纯前端，不触发后端、不触发风险重算）。
- 与现有拖拽排序的限制一致，不放宽。

## 数据层改动（后端，轻量）

唯一后端改动：扩展 `plan.service.ts` 的 `toPlanItem`，补齐排序所需字段：

1. **拆开分数线**：现状 `historicalMinScore = score25Group ?? score25Major` 把组级线和专业级线压成一个值。新增透出原始 `score25Group / rank25Group / score25Major / rank25Major`（保留 `historicalMinScore/Rank` 兼容现有 UI）。
2. **补 University 字段（单独查 + merge，不是 include）**：`PlanItem` 模型**没有**到 `University` 的关系字段，只有 `universityId` 标量，因此**不能** `include: { university }`。做法：`findById` 加载完 `planItems` 后，收集 `universityId` 集合，`university.findMany({ where: { id: { in } }, select: { id, province, runningNature, softRanking, is985, is211, isDoubleFirstClass } })`，建 `Map<id, uni>`，在 `toPlanItem` 里按 `item.universityId` 取出 merge。透出 `province / runningNature / softRanking / is985 / is211 / isDoubleFirstClass`，并派生 `inSichuan = province === '四川'`。
   - 这是 University 表的一次批量查（每方案一次，~24 行），**不走**那条最重的候选富化管线（`getCandidateGroups`），也**不加 Prisma relation / 不改 schema / 零迁移**（规避生产迁移漂移风险）。
   - 办学性质优先用 `University.runningNature`，缺失回退 `item.schoolNature`（快照）；标签优先用 University 三个 Boolean，回退 `item.schoolTags`（快照字符串含 985/211 子串）。
3. 中外合作：首版用 `runningNature` 含"中外/合作"子串 或快照 `schoolNature` 判定，归入"办学性质=中外合作"档位；精确判定（关联 `EnrollmentPlan.isSinoForeign`）列为后续可选，不阻塞核心排序键。

`tuition` 已在 `PlanItem` 上，无需补。

## 前端实现要点

- 在 `plans/[id]/page.tsx` 增加排序状态：`sortRules`、`isSortPreview`（是否预览态）；预览态下 `localItems` 用排序后的副本渲染，但**不**自动触发 `reorderMutation`。
- 抽出纯函数 `sortPlanItems(items, rules): items`（可单测）：稳定排序 + null 沉底 + 分类键映射 + 梯度强制分块（应用路径）。
- "应用"复用现有 `reorderMutation`（喂扁平 `itemId[]`），**禁止**逐条 update——后端有 `@@unique([planId, sequence])`，必须走 reorder 的两阶段提交（先置负避让→再写目标值）。
- 排序面板控件借用生成页 `pgv3-toolbar / pgv3-sort / pgv3-sortdir` 的 CSS 与视觉语言（`willnest-teacher.css`），但规则栈是新建组件（项目无现成多级排序控件）。

## 测试要点

- `sortPlanItems` 单测：多级比较优先级、稳定性、null 沉底、分类键内部序、方向翻转、梯度强制分块（应用路径产出合法 1..N 且段内连续、段间冲→稳→保）。
- 预览不落库（不调 reorder）、应用调一次 reorder 且 itemId 顺序正确。
- 非 DRAFT 状态"应用"按钮 disabled。

## 不做（YAGNI）

- 不做"排序规则持久化到老师/方案"（每次进页面从默认栈开始；后续如需再加）。
- 不做服务端排序 / 不进任何缓存键（排序纯前端，数据已随方案详情返回）。
- 不做跨方案/批量排序。
- 中外合作精确判定的 `EnrollmentPlan` 关联列为可选增强，不阻塞首版。
