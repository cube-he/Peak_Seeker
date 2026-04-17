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
| P0 Bootstrap | ✅ 完成 | 2026-04-17 | 2026-04-17 | 目录+3 lib+contract+smoke (16/16 tests) |
| P1 基线与自洽 | ✅ 完成 | 2026-04-17 | 2026-04-17 | 29/29 tests pass；03 已干净(ISSUE-010)；待用户验收 |
| P2 03×01 交叉校验 | ✅ 完成（2025 slice） | 2026-04-17 | 2026-04-17 | 95/95 tests; P2_report.md + coverage_uplift.md 已出；历史年份转 Task 7b |
| P3 13 征集治理 | ✅ 完成 | 2026-04-17 | 2026-04-17 | 38/38 tests; 23,009 clean rows; hit 52.4%; P3_report.md |
| P4 三源合一 | ✅ 完成 | 2026-04-17 | 2026-04-17 | 15/15 tests; 主表 55,493 行; smoke 100/100; P4_report.md |

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
- Task 5 lineage 实现（haiku mechanical）：spec ✅ + quality ✅ 双通过，commit 28dc0ab，5/5 test pass
- Task 6 subagent contract 写入（commit 84ba955）
- Task 7 P0 smoke：lib imports OK + 16/16 tests pass + `data/_pipeline/` 确认 gitignore 生效
- **P0 Bootstrap 阶段关闭**，进入 P1 基线与 03 自洽
- Task 8 p1_baseline 实现：commit 0b4217d 初版 → review 发现 xlsx/csv 语义不一致（header 是否计入）→ commit d24a0dd 修复 + 补 2 个 test（7/7 pass）
  - 真实基线生成：03(9 files/56789 records) / 01(36/660128) / 13(2346/29104)
  - 实际 delta 等于 xlsx 工作表数，修复验证闭环
- Task 9 p1_patch_03 实现：commit adf7a19，6/6 test pass（spec ✅ + quality ✅）
  - fixture 验证三类修复逻辑（去重/分数异常/专业代码缺失）全工作
  - 真实 03 dry-run：48131 rows, 0 dup, 0 score anomaly, 2 missing major code
  - **重大发现**（登记为 ISSUE-010）：03 主表已是清洗后产物，审计报告 34/232 基于早期版本。防御性代码保留，P2 scope 将收紧
  - 附带：.gitignore 加 `!scripts/data_integration/tests/fixtures/*.xlsx` 负规则以允许 fixture 进仓
- Task 10 p1_report 实现：commit 892dc73，P1_report.md 生成（含 2 条 missing_major_code 样本）
- Task 11 P1 收尾：全量测试 29/29 pass（batch_dict 4 + code_mapper 7 + lineage 5 + p1_baseline 7 + p1_patch_03 6）
- **P1 阶段关闭**，等待用户验收 P1_report.md

## P0+P1 交付清单

- **代码**：`scripts/data_integration/` 下 3 个 lib + 3 个 P1 脚本 + 对应 tests（29 tests 全绿）
- **数据产物**（gitignored，本地生成）：
  - `data/_pipeline/P1/03_patched.xlsx`（48131 行）
  - `data/_pipeline/P1/patch_log.csv`（2 条：均为 missing_major_code）
  - `data/_pipeline/P1/unresolvable.csv`（2 条：专业代码缺失）
- **基线快照**：`docs/.../baselines/2026-04-17-baseline.json`（~957KB，03/01/13 三源文件全盘 SHA256）
- **验收报告**：`docs/.../P1_report.md`
- **方法论文档**：RUNBOOK.md（进度+日志）、DECISIONS.md（6 ADR）、ISSUES.md（10 issues）、contracts/subagent_output.md
- **关键发现**（需用户关注）：
  - 03 主表已是清洗产物，ADR-001 SSoT 假设成立（见 ISSUE-010）
  - 代码 fixture 验证三类修复逻辑均工作；防御性代码保留，P2 scope 可收紧
  - 登记 ISSUE-007/008/009/010 为 P2 开工前须复核事项

---

### 2026-04-17（P2 进行中）

**P2.0 Pre-flight（3 个 ISSUE 回补）**
- Task 1 修复 ISSUE-007：`BatchDictMissingError` 区分"字典未注册"vs"名称未知"（commit 805f22b，6/6 tests）
- Task 2 修复 ISSUE-008：`normalize_batch_name(strict=True)` + `_AMBIGUOUS_ALIASES` 集合拒绝"本科批"等模糊默认（commit f718cc7，8/8 tests）
- Task 3 修复 ISSUE-009：`CodeMapper.conflicts` 列表 + `add_patch(overwrite=False)` 严格默认（commit 86de50b，9/9 tests）

**P2.1 loader + probe**
- Task 4-5 `lib/source_01.py`：01 专业分数线 json → 03 口径 DataFrame；2025 字段翻转处理（drop uMinScore, use minScore）；fixtures 2024/2025（commit b15a896，5/5 tests）
- 真实数据 smoke：2022-2025 每年 44K+ 行 load 正常；2025 有 26569 条 minScore=0 空记录（登记 ISSUE-011）
- source_01 修正：`str.zfill(6)` 破坏了 5 位国标（如清华 10003），改为 `str.strip()` + 补回归测试（commit de26190，6/6 tests）
- Task 6 `p2_code_mapping.py` probe：扫 2299 unique 国标 × 治理表 2215 条 → **覆盖率 94.56%，125 条缺失**（远低于 spec 假设 99.37%）
- 缺失分布：2022/118 > 2023/82 > 2024/58 > 2025/22（省属/艺术/职业院校为主）
- 登记 ISSUE-012：**P2.1 scope 调整** — 125 条不再手工补全，让 outer join 走 `right_only` 路径，P2.4 作补缺候选处理

**P2.2 Outer join（2025 slice）**
- Task 7 `lib/source_03.py` + `p2_join.py`：03 宽表 → 2025 长表切片 → 与 01 2025 outer join；CodeMapper 桥接 + batch/course 归一化（commits 6210d36, 8f4fad9）
- Task 7.5 batch_dict 扩充：补 (2025,历史) 条目 + '专科'→'专科批次' 别名（commit 2c55985，2 新测试）
- schema + ISSUE-011 修复：修正 `_FIELD_MAP` 用真实 schema（uEnterNum/enterNum/planNum），补 `drop_empty=True` 参数（commit 7545f2e，3 新测试）
- 2025 join 分布：**both=11133 / left_only=2028 / right_only=7362**（修前 right_only=33745，-78%）

**P2.3 Diff report**
- Task 8 `lib/diff_rules.py`：按字段分类阈值（score/rank/count/text）+ null 跳过（commit 5f1bd86，8 tests）
- Task 9 `p2_diff_report.py`：both 行 × 10 字段 → 差异表 + anomaly 表（commit da1fdd5，6 tests）
- 真实 dry-run：30267 差异行，17328 anomaly（57.3%）→ 登记 ISSUE-014（位次字段口径差异嫌疑，分数/人数 anomaly 543/228 才是真实审核信号）
- 产物：`data/_pipeline/P2/cross_diff_report_2025.xlsx` + `anomaly_diff_2025.xlsx`

**P2.4 Enrich + backfill**
- Task 10 `p2_enrich.py`：加 `_backfill_notes` 列 + Group C 列加 `_01` 后缀，不改 03 值（commit 984fa76，7 tests）
- Task 11 `p2_backfill.py`：三桶切分 (new_rows / field_fill / no_action) + lineage 列（commit 4f2dad5，8 tests）
- 2025 分布：new_rows=7362 / field_fill=4167 / no_action=8994
- 产物：`data/_pipeline/P2/backfill_new_rows_2025.xlsx` + `backfill_field_fill_2025.xlsx`

**P2.5 报告**
- Task 12 `P2_report.md` + `coverage_uplift.md`：含输入 SHA / 分布 / anomaly 字段拆解 / 20 条抽样 / 4 条待审决策
- Task 13 收尾：RUNBOOK + ISSUES 更新，95/95 tests pass

**P2.6 ISSUE-014 根因修复（P2 close 前）**
- 核验 rank anomaly：97.2%（16,851/17,328）的 01 值 = 0（而非口径差异猜测）
- 修复：`source_01` 加载时分数/位次 0 值归 NaN（commit a6df7e3，1 新测试）
- 效果：anomaly 17,328→492 (-97%)、field_fill 4,167→291 (-93%)、diff 30,267→19,495
- 决策：录取人数/计划人数 的 0 保留（真实"计划未录取"语义，构成有效 anomaly 信号）

**P2 阶段关闭（2025 slice）** — 96/96 tests，D1-D4 技术决策已落地，待用户验收 P2_report.md

## P2 交付清单（2025 slice）

- **代码**：`source_01/03 loader` + `diff_rules` + 4 个 P2 脚本（`p2_join, p2_code_mapping, p2_diff_report, p2_enrich, p2_backfill`）+ 对应 tests（95 tests 全绿）
- **数据产物**（gitignored）：
  - `data/_pipeline/P2/cross_diff_report_2025.xlsx`（30,267 行）
  - `data/_pipeline/P2/anomaly_diff_2025.xlsx`（17,328 行，按 |差值| 降序）
  - `data/_pipeline/P2/backfill_new_rows_2025.xlsx`（7,362 行）
  - `data/_pipeline/P2/backfill_field_fill_2025.xlsx`（4,167 行）
  - `data/_pipeline/P2/missing_college_codes.csv`（22 + 125 条缺桥接国标追踪）
- **验收报告**：`P2_report.md`（主报告） + `coverage_uplift.md`（覆盖率变化）
- **关键发现**：
  - ISSUE-011 + 字段映射 bug 修复后 right_only 从 33745 → 7362（-78%）
  - 新增 ISSUE-014：位次字段 anomaly 率 97%（16,785/17,328），疑口径差异需核验
  - 分数/人数 anomaly 仅 543 条，属真实审核信号
- **延展（已登记）**：
  - Task 7b: 2022-2024 历史年份 join（需批次反向字典 + 科目转换）
  - 提前批 pipeline: 独立工单
  - ISSUE-012 125 条缺桥接: 需要时手工 web search 补
