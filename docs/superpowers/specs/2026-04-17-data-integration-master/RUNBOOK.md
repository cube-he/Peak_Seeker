# 数据整合 RUNBOOK（方法论与决策日志）

本文档持续更新，记录整个数据整合工作的思路、方法、遇到的问题与决策。

---

## 方法论

### 数据血缘规则（核心原则）

- **03 专家版主表** = 唯一事实主源（SSoT）
- **01 核心录取数据** = 补缺 + 交叉校验
- **13 征集志愿** = 独立治理后合入
- 任何整合**不得覆盖** 03 既有非空值
- 01 独有字段**作新增列**带入，列名加 `_01` 后缀
- 冲突时**出差异报告**，不静默覆盖

### 工作流原则

- 每阶段产出中间产物 + 校验报告
- 中间产物存 `data/_pipeline/Pn/`，不入库
- 每阶段用户 sign-off 后才启动下阶段
- 主 agent 只统筹，具体扫描/修复派子 agent
- 所有关键决策进 DECISIONS.md

### 质量红线

- 分数逻辑：`最低分 ≤ 平均分 ≤ 最高分`
- 位次逻辑：`最低位次 ≥ 平均位次 ≥ 最高位次`（数值越小排名越高）
- 分数范围：150 ≤ score ≤ 750
- 院校代码：4 位数字（四川招生代码）
- 主键：`(年份, 院校代码, 专业组代码, 专业代码, 批次, 科目)` 唯一

---

## 进度

| 阶段 | 状态 | 开始日期 | 完成日期 | 备注 |
|---|---|---|---|---|
| Spec 起草 | ✅ 完成 | 2026-04-17 | 2026-04-17 | 用户"自己审核"模式，自审通过推进 |
| P0 Bootstrap | ⏸ 未开始 | - | - | 工程准备（目录+lib+contract） |
| P1 基线与自洽 | ⏸ 未开始 | - | - | 依赖 P0 |
| P2 03×01 交叉校验 | ⏸ 未开始 | - | - | 依赖 P1 |
| P3 13 征集治理 | ⏸ 未开始 | - | - | 依赖 P2 |
| P4 三源合一 | ⏸ 未开始 | - | - | 依赖 P1/P2/P3 |

---

## 日志

### 2026-04-17

- 主 agent 派 4 个 Explore 子 agent 并行探查 03/01/13 + 历史尝试
- 发现可复用资产：批次字典、真值表、rename plan、8 条校验规则
- 识别历史失败根因：主源不固定、一次性大合并、OCR 未量化、dry-run 无闭环
- 起草 spec v1，用户指示"自己审核"不参与
- 自审第二轮发现 5 项问题（缺 P0 bootstrap、P2.3 阈值不严谨、P3.3/P4.5 抽样方法、P3.4 修复顺序未定），inline 修复
- 自审通过，spec 定稿为 v1.1，准备进入 writing-plans
- Task 1 目录骨架、Task 2 .gitignore 完成
- Task 3 batch_dict 实现：dispatch sonnet implementer → spec ✅ → code review approved with recommendations
  - 实现有 1 项偏离：`_CANONICAL_NAMES` 与 `load_batch_dict()` 解耦为两层（rationale 已进 module docstring）
  - code review 提的 Important #2/#3 登记为 ISSUE-007/008，P2 前回补
  - commit 619d387，4/4 test pass
- Task 4 code_mapper 实现：spec ✅ → code review approved
  - smoke test 真实治理表 2224 条，BOM 处理正确
  - code review Important 登记为 ISSUE-009，P2.1 前回补
  - commit f10a2a1，7/7 test pass
