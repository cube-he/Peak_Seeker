# 数据整合主设计 Spec

- **Spec ID**: 2026-04-17-data-integration-master
- **起草**: 2026-04-17
- **状态**: Draft（待用户 review）
- **负责**: 主 agent 统筹，子 agent 并行执行
- **范围**: 将现有三大数据源（03 专家版主表、01 核心录取数据、13 征集志愿）整合为单一事实数据集，保证数据准确、可审计、可回滚

---

## 1. 背景与问题

### 1.1 数据现状

| 数据源 | 路径 | 体量 | 性质 |
|---|---|---|---|
| **03 专家版主表** | `data/03_专家版主表/output/` | 48,131 行 × 71 字段 | 已清洗整合成果，2025 核心字段质量高；历史字段 10-95% 缺失 |
| **01 核心录取数据** | `data/01_核心录取数据/` | ~625 MB，2017-2025 | 四川省教育考试院官方 JSON/XLSX，批次线/招生计划/院校分数/专业分数/一分一段 |
| **13 征集志愿** | `data/13_征集志愿/普通高考/` | 99 xlsx，~28,900 行 | LLM 对官方公告图片 OCR 结果；存在识别错误、命名混乱、多版本未协调 |

### 1.2 已知问题

**03 内部已知缺陷**（来自审计报告）
- 34 条重复记录（8 组）
- 2024 年"平均分 > 最高分"异常 161 条
- 2023 年"最低分 > 最高分"异常 71 条
- 2 条专业代码缺失（0.004%）
- 硕博点数量多源不一致约 20%

**03 ↔ 01 已知差异**（来自 L1 管道设计）
- 2025 代码匹配率 99.98%，2024 名称匹配率 78.6%
- 2025 分数字段翻转：`uMinScore` 全零，有效值在 `minScore`
- 01 缺部分提前批记录

**13 已知缺陷**（来自子 agent 探查）
- 78 个文件夹命名错误（叠名/口径错）
- `页码全为 1` 红旗：疑似页码未正确提取
- OCR 典型错误：数字混淆（0/O, 1/l, 5/S）、括号嵌套识别串行、简繁混用、备注截断、字母数字混淆（E/L）
- 2025 年多版本（mimo/claude/多引擎）未协调

### 1.3 历史尝试与可复用资产

**设计文档**（可复用知识）
- `2026-04-14-data-processing-pipeline-design.md`：9 步处理流程
- `2026-04-15-enriched-data-integration-design.md`：丰富数据集成
- `2026-04-16-data-merge-design.md` + `plan.md`：基础库合并设计

**字典/真值表**（可直接用）
- `2026-04-17-batch-dict-2024-science.md` / `-2025-physics.md`：权威批次枚举
- `2026-04-17-groundtruth-2025.md`：2025 年 18 条高置信真值
- `2026-04-17-groundtruth-2023-2024.md`：2023/2024 扫描成果
- `2026-04-17-naming-dict-unified.md`：统一命名模板
- `2026-04-17-rename-plan.md` / `.csv`：78 文件夹 + 88 xlsx 重命名映射（dry-run 完成未执行）

**校验规则**
- `2026-04-17-validation-rules.md`：8 条 Rule（Rule 1 括号归属、Rule 2 forward-fill、Rule 4 图片优先最关键）
- `2026-04-17-validation-pilot-4413.md`：pilot 范例

**已证实不可行的路线**（避免重复）
- ❌ 以 01 为主源 → 01 缺提前批、2025 字段翻转，匹配度仅 87.4%
- ❌ 自动化编码映射 → 0.63% 不可匹配须手工
- ❌ majors_enriched 全量覆盖 → 覆盖率仅 50%
- ❌ 一次性 26+ 字段 schema 迁移 → 回滚风险大

---

## 2. 目标与非目标

### 2.1 目标

产出一份**干净、准确、可供推荐引擎消费**的整合数据集，并配套完整的血缘、质量、决策记录。

具体产出：
- `admission_master.parquet`（或 xlsx）：单一事实主表
- 每个字段标注血缘（来自 03 / 01 / 13 / 人工）
- 数据字典（字段说明、来源、更新频率）
- 质量仪表板（缺失率、冲突率、覆盖率）
- 全过程 RUNBOOK 与 DECISIONS（可审计）

### 2.2 非目标（本轮不做）

- ❌ 数据库 schema 迁移、入库
- ❌ 推荐引擎、前端、API 改造
- ❌ 纳入 02/04/05 等其他数据源
- ❌ 重建 L2 丰富数据集成（26+ 字段）
- ❌ 修复 `scripts/import-data/import-enriched.ts` 的已知 BUG（独立任务）

---

## 3. 核心原则

| # | 原则 | 理由 |
|---|---|---|
| 1 | **03 = 唯一事实主源（SSoT）** | 03 已是多源人工整合成果，质量最高；任何整合不得覆盖 03 既有非空值 |
| 2 | **01 = 补缺 + 交叉校验** | 01 来自官方考试院，权威；独有字段（位次、征集标志、压力线）作新增列；与 03 冲突时出差异报告，不静默覆盖 |
| 3 | **13 = 独立治理后再 merge** | OCR 错误率未量化前不得污染主表 |
| 4 | **每阶段产出中间产物 + 校验报告** | 可审计、可回滚、可并行验收 |
| 5 | **不直接入库** | 先出文件让用户肉眼验收，验收通过再入库（入库为独立任务） |
| 6 | **图片 > xlsx > 文件夹名**（13 治理） | 复用历史教训：Rule 4 图片优先 |
| 7 | **所有决策记入 DECISIONS.md（ADR）** | 避免"为什么这样做"的丢失 |

---

## 4. 四阶段路线

### 4.1 阶段总览

```
P0: Bootstrap（工程准备，无数据改动）
    ├─ P0.1 创建目录骨架（scripts/data-integration/、data/_pipeline/）
    ├─ P0.2 .gitignore 配置（data/_pipeline/ 不入 git）
    ├─ P0.3 lib 基础模块：batch_dict / code_mapper / lineage
    └─ P0.4 子任务输出 contract（统一 JSON schema）
    产出: 目录骨架 + lib 可导入 + contract 文档
    验收点: 运行 dry-run 能打通链路
    ↓
P1: 基线与 03 自洽
    ├─ P1.1 数据基线冻结（所有源文件哈希+行数快照）
    ├─ P1.2 03 重复记录去除（34 条）
    ├─ P1.3 03 分数逻辑异常修复（161+71 条）
    └─ P1.4 03 专业代码补齐（2 条）
    产出: 03_patched.xlsx + patch_log.csv + P1_report.md
    验收点: 用户抽查 20 条修正记录
    ↓
P2: 03 × 01 交叉校验与补缺
    ├─ P2.1 建立院校代码映射（复用 08 映射表 + 增量维护）
    ├─ P2.2 按 (年份, 院校代码, 专业代码, 批次, 科类) outer join
    ├─ P2.3 重叠字段差异报告（冲突记录表）
    ├─ P2.4 01 独有字段引入（作新增列，不覆盖 03）
    └─ P2.5 提前批/历史年份补缺
    产出: 03_enriched.xlsx + cross_diff_report.xlsx + coverage_uplift.md
    验收点: 用户审差异报告，确认取舍规则合理
    ↓
P3: 13 征集志愿治理
    ├─ P3.1 执行 rename plan（dry-run → 实际执行）
    ├─ P3.2 完成 2023/2024 剩余 pilot
    ├─ P3.3 OCR 错误率量化（抽样 200 条 vs 原图）
    ├─ P3.4 批量修复脚本（按错误类型分类）
    ├─ P3.5 与 03_enriched 对齐（院校/专业须在主表能查到）
    └─ P3.6 人工复核不可自动修复条目
    产出: 13_clean.xlsx + ocr_error_catalog.md + unresolvable_images.csv
    验收点: 用户抽查 30 条修正记录 + 错误分类报告
    ↓
P4: 三源合一
    ├─ P4.1 最终主表拼装（03_enriched + 13_clean）
    ├─ P4.2 血缘标记（每个值来源于哪个源）
    ├─ P4.3 数据字典生成
    ├─ P4.4 质量仪表板生成
    └─ P4.5 端到端 smoke test（抽样 100 条全链路核对）
    产出: admission_master.parquet + data_dictionary.md + data_quality_dashboard.md
    验收点: 整体 sign-off
```

### 4.2 阶段详细设计

#### P0：Bootstrap

**前置**：spec 通过

**P0.1 目录骨架**
- `scripts/data-integration/`、`scripts/data-integration/lib/`
- `data/_pipeline/P1/`、`P2/`、`P3/`、`P4/`

**P0.2 gitignore**
- `data/_pipeline/` 整体加入 `.gitignore`（中间产物不入 git）
- `scripts/data-integration/` 入 git

**P0.3 lib 基础模块**
- `lib/batch_dict.py`：加载 2024 理科 / 2025 物理批次字典，统一命名映射
- `lib/code_mapper.py`：院校代码（四川招生代码 ↔ 国标代码）双向映射，含增量维护接口
- `lib/lineage.py`：血缘标记 helper，写入 `_source` 元数据

**P0.4 子任务输出 contract**
- 定义子 agent 返回给主 agent 的统一 JSON schema：
  ```json
  {
    "task_id": "P1.2",
    "status": "success|partial|failed",
    "counts": {"input": 48131, "changed": 34, "flagged": 0},
    "artifacts": ["data/_pipeline/P1/patch_log.csv"],
    "issues": [{"severity": "warn", "message": "..."}],
    "decisions_needed": []
  }
  ```
- 该 schema 写入 `contracts/subagent_output.md`

**产出**：
- 目录骨架 + `lib/` 可 import + `.gitignore` 更新 + `contracts/subagent_output.md`

**验收标准**：
- [ ] 运行 `python -c "from scripts.data_integration.lib import batch_dict, code_mapper, lineage"` 成功
- [ ] `data/_pipeline/` 在 git status 中不显示

---

#### P1：基线与 03 自洽

**前置**：P0 完成

**P1.1 数据基线冻结**
- 扫描 03/01/13 所有源文件，产生 `data_manifest.json`（文件相对路径、大小、SHA256、行数/对象数、最后修改时间）
- 保存到 `docs/superpowers/specs/2026-04-17-data-integration-master/baselines/2026-04-17-baseline.json`
- 所有后续阶段都以此基线为起点

**P1.2 重复记录去除**
- 按主键 `(数据年份, 院校代码, 专业组代码, 专业代码, 批次, 科目)` 识别重复
- 重复组内保留"最完整"记录（非空字段最多的一条）
- 记录到 `patch_log.csv`（原记录 + 保留哪条 + 删除哪些）

**P1.3 分数逻辑修复**
- 校验规则：
  - `最低分 ≤ 平均分 ≤ 最高分`
  - `最低位次 ≥ 平均位次 ≥ 最高位次`（位次数越小排名越高）
  - 分数范围：150 ≤ score ≤ 750
- 对违反记录：
  - 优先用 01 对应记录修复
  - 01 无对应则标记为"待人工核对"，保留原值但加 `_quality_flag` 列
- 所有修改记入 `patch_log.csv`

**P1.4 专业代码补齐**
- 2 条缺失（通过 院校+专业名+批次 反查 01 或同校其他记录补齐）
- 无法补齐则记入 `unresolvable.csv`

**产出**：
- `data/_pipeline/P1/03_patched.xlsx`
- `data/_pipeline/P1/patch_log.csv`
- `docs/superpowers/specs/2026-04-17-data-integration-master/P1_report.md`

**验收标准**：
- [ ] 所有 34 条重复、161+71 条分数异常、2 条代码缺失都有明确处置
- [ ] 用户抽查 20 条修正记录判断合理

---

#### P2：03 × 01 交叉校验与补缺

**前置**：P1 完成

**P2.1 院校代码映射**
- 读取 `data/08_数据治理记录/编码映射表_招生代码_国标代码.csv`
- 对 0.63% 不可匹配院校：子 agent 根据院校名称手工补全映射
- 输出：`code_mapping_patched.csv`

**P2.2 Outer Join**
- 规范化 01 的年份/批次/科类命名到 03 口径（复用批次字典）
- 按 `(年份, 院校代码, 专业代码, 批次, 科类)` 做 outer join
- 2025 特殊处理：字段翻转（从 `minScore` 取有效分数）

**P2.3 差异报告**
- 对重叠字段（如 `最低分`、`录取人数`）：
  - 完全一致 → 无差异
  - 不一致 → 记入 `cross_diff_report.xlsx`，标注差值、年份、字段
  - 空对非空 → 记为"补缺候选"
- 差异字段的取舍规则（默认）：
  - 03 非空 → 保留 03（原则 1）
  - 03 空、01 非空 → 采纳 01，在值旁注明 `source=01`
  - 两者都空 → 保留空
- 异常差值阈值（按字段分类）：
  - 分数字段：绝对差 > 5 分 **或** 相对差 > 1% 标红
  - 位次字段：相对差 > 5% 标红（绝对差对高位次无意义）
  - 计划人数/录取人数：绝对差 > 2 或 相对差 > 10% 标红
  - 文本字段（专业名/备注）：不完全一致即标红（后续人工判定）
- 标红项集中产出 `anomaly_diff.xlsx`，按差值降序排列，方便人工裁定

**P2.4 独有字段引入**
- 01 独有字段清单（新增列）：
  - `最低位次_01`、`平均位次_01`、`最高位次_01`
  - `征集标志_01`（uZjText）
  - `压力线_01`（pressureScore，批次线级别）
  - `办学性质_01`、`院校分类_01`
- 列名加 `_01` 后缀明确来源

**P2.5 补缺**
- 提前批：01 提前批覆盖 2022-2025，03 提前批覆盖不足
- 历史年份：用 01 历史分数补 03 的 2022-2024 缺失
- 所有补缺记入 `coverage_uplift.md`

**产出**：
- `data/_pipeline/P2/03_enriched.xlsx`
- `data/_pipeline/P2/cross_diff_report.xlsx`
- `data/_pipeline/P2/code_mapping_patched.csv`
- `docs/superpowers/specs/2026-04-17-data-integration-master/P2_report.md`
- `docs/superpowers/specs/2026-04-17-data-integration-master/coverage_uplift.md`

**验收标准**：
- [ ] 差异报告按差值大小排序，用户可快速扫视
- [ ] 补缺前后覆盖率对比图表清晰
- [ ] 用户抽样 20 条差异记录认可取舍规则

---

#### P3：13 征集志愿治理

**前置**：P2 完成（需要 03_enriched 作为对齐参照）

**P3.1 执行 Rename Plan**
- 以 `2026-04-17-rename-plan.csv` 为输入
- 增加"本科批模糊 7 条"的人工复核结果
- 脚本化执行 `os.rename()`，并生成 `rename_execution_log.md`
- 失败项进入 `rename_failures.csv`

**P3.2 完成 pilot**
- 2023/2024 剩余未 pilot 条目（复用 `gt_scan_2023_2024.py`）
- 每个 pilot 产出校验记录

**P3.3 OCR 错误率量化**
- **分层抽样**：每个 xlsx 抽 2-3 条（共 ~250 条），覆盖 99 个文件；避免简单随机抽样集中在少数文件
- 优先抽"风险高"的记录：含多层括号、长备注、特殊代码、简繁混合段落
- 子 agent 对照原图人工比对（用 Read 读图 + 文字比对）
- 按错误类型分类统计：
  - 字符混淆（0/O、1/l、5/S、E/L 等）
  - 括号识别串行（中英/全半角/嵌套）
  - 备注截断
  - 简繁混用
  - 数字位数错误（院校代码）
  - Forward-fill 缺失（分类标题应 forward-fill 但没做）
  - 其他
- 产出 `ocr_error_catalog.md`：每类错误的出现频率（整体错误率 + 按类型占比）、样例（至少 3 条）、修复策略（自动/半自动/人工）

**P3.4 批量修复（严格按顺序执行）**

修复顺序很重要：前面错会污染后面，顺序如下：

1. **字符标准化**（幂等、无依赖）
   - 简繁转换（统一简体）
   - 括号类型统一（中文括号，全半角统一）
   - 空白字符归一（多空格→单空格，去首尾）
2. **代码层修复**（依赖上步结果）
   - 院校代码补位：纯数字补足 4 位
   - 专业代码字符集校验：仅数字+大写字母
   - 数字字符混淆回溯：根据上下文判断 O→0、l→1、S→5 等
3. **结构层修复**（依赖 1、2 的字段是正确的）
   - Forward-fill（Rule 2）：分类标题/批次/科类向下填充
   - 括号归属（Rule 1）：按印刷版式决定括号内容归属院校行还是专业行
4. **完整性校验**（最后一步）
   - 备注截断检测：末尾含未闭合括号/分号未结束→标记疑似截断
   - 每修复一步都在 `P3_fix_log.csv` 追加一行（记录 xlsx、行号、字段、旧值、新值、修复类型）

- `页码全为 1` 红旗：先在 P3.3 根因调查（查 `scripts/` 下 OCR 相关脚本代码/日志，定位归一化逻辑），结果写入 DECISIONS.md；决策是：(a) 重新 OCR、(b) 按图片序号回填、(c) 接受现状仅标注

**P3.5 与主表对齐校验**
- 目的：发现 13 中因 OCR 错误导致的院校/专业代码畸形，而非强制每条都能查到
- 做法：对 13 中的 (院校代码, 专业代码)，在 03_enriched 的同年份记录中做存在性校验
  - 主表能查到 → 正常
  - 主表查不到 → 分类处置：
    - 代码形态明显异常（如院校代码非 4 位数字、专业代码非"数字/大写字母"）→ 优先尝试修正（P3.4 的修复规则）
    - 代码形态合法但主表无此条 → 合理情形（征集是对未完成计划的追加/补充；也可能是专项目录中才出现的组合），记入 `not_in_master.csv` 仅作提示，不视为错误
    - 人工可判定的少量离群 → 进入 P3.6 人工复核

**P3.6 人工复核**
- 所有自动修复置信度不足的条目汇总到 `needs_human_review.csv`
- 子 agent 做一轮人工复核（读原图 + 判断）
- 无法判断的最终进入 `unresolvable_images.csv`

**产出**：
- `data/_pipeline/P3/13_clean.xlsx`
- `data/_pipeline/P3/rename_execution_log.md`
- `docs/superpowers/specs/2026-04-17-data-integration-master/ocr_error_catalog.md`
- `docs/superpowers/specs/2026-04-17-data-integration-master/unresolvable_images.csv`
- `docs/superpowers/specs/2026-04-17-data-integration-master/P3_report.md`

**验收标准**：
- [ ] rename 全量完成，无失败残留
- [ ] OCR 错误率量化给出数字，不是定性描述
- [ ] 用户抽查 30 条修正记录认可
- [ ] `页码全为 1` 问题有明确结论

---

#### P4：三源合一

**前置**：P1/P2/P3 全部完成

**P4.1 最终主表拼装**
- 基表：P2 产出的 `03_enriched.xlsx`
- 合入：P3 的 `13_clean.xlsx`（作为新增列 `征集志愿_轮次N_计划数` 等，或作为独立关联表）
- 决策点：征集志愿是作为主表列还是作为关联表？→ 见 DECISIONS.md

**P4.2 血缘标记**
- 每个字段增加 `_source` 元数据：
  - `03`：来自专家版主表
  - `01`：来自核心录取数据
  - `13`：来自征集志愿治理
  - `manual`：人工修复
  - `patched`：自动修复（P1 质量修复）
- 存储方式：独立 `lineage.json`，不污染主表行结构

**P4.3 数据字典**
- `data_dictionary.md`：每个字段的名称、类型、来源、含义、取值范围、缺失率、样例

**P4.4 质量仪表板**
- `data_quality_dashboard.md`：
  - 总行数、字段数
  - 每字段缺失率
  - 每年份/批次/科类的覆盖率
  - 血缘分布（多少字段来自 03 / 01 / 13 / manual）
  - 未解决问题清单

**P4.5 端到端 smoke test**
- **分层抽样** 100 条（覆盖各年份 × 批次 × 科类 × 数据来源）：
  - 每个 (年份, 批次) 组合至少 3 条
  - 必须包含纯 03 来源、03+01 融合、13 征集、质量 flag 标记等不同血缘类型
- 子 agent 对每条：
  - 在 03 原始文件（patched 前）查到对应行，确认 03 来源字段一致（如被 P1 修复，对照 `patch_log.csv`）
  - 在 01 对应 JSON 查到对应记录，确认补缺字段与 01 一致
  - 若该条有征集记录，在 13_clean 中确认一致
  - 检查血缘标签与实际数据源一致
- 失败项必须修复后重跑，达到 100 条 100% 通过方可 sign-off

**产出**：
- `data/_pipeline/P4/admission_master.parquet`（或 xlsx）
- `data/_pipeline/P4/lineage.json`
- `docs/superpowers/specs/2026-04-17-data-integration-master/data_dictionary.md`
- `docs/superpowers/specs/2026-04-17-data-integration-master/data_quality_dashboard.md`
- `docs/superpowers/specs/2026-04-17-data-integration-master/P4_report.md`

**验收标准**：
- [ ] smoke test 100 条 100% 通过
- [ ] 数据字典完整无空缺
- [ ] 用户整体 sign-off

---

## 5. 工程基础设施

### 5.1 目录结构

```
data/_pipeline/          # 中间产物（.gitignore）
  ├── P1/
  ├── P2/
  ├── P3/
  └── P4/

docs/superpowers/specs/2026-04-17-data-integration-master/
  ├── design.md            # 本文档
  ├── RUNBOOK.md           # 方法论+决策日志，持续更新
  ├── DECISIONS.md         # ADR 决策记录
  ├── ISSUES.md            # 问题+解决方案清单
  ├── baselines/
  │   └── 2026-04-17-baseline.json
  ├── P1_report.md
  ├── P2_report.md
  ├── coverage_uplift.md
  ├── P3_report.md
  ├── ocr_error_catalog.md
  ├── unresolvable_images.csv
  ├── P4_report.md
  ├── data_dictionary.md
  └── data_quality_dashboard.md

scripts/data-integration/   # 本轮新脚本
  ├── p1_baseline.py
  ├── p1_patch_03.py
  ├── p2_cross_validate.py
  ├── p3_ocr_audit.py
  ├── p3_batch_fix.py
  ├── p4_assemble.py
  └── lib/
      ├── batch_dict.py   # 批次字典加载
      ├── code_mapper.py  # 院校代码映射
      └── lineage.py      # 血缘标记
```

### 5.2 技术栈

- **Python 3.11+**：数据处理主语言（pandas、openpyxl、pyarrow）
- **JSON/CSV/Parquet**：中间格式
- **现有脚本复用**：`gt_scan_2023_2024.py`、`gt_build_markdown.py`、`gen_rename_plan.py`

### 5.3 子 Agent 分工模式

- **主 agent**（我）：
  - 读各阶段报告、决策、协调、更新 RUNBOOK/DECISIONS/ISSUES
  - 对接用户验收
  - 下一阶段是否启动的判断
- **子 agent**（Explore / general-purpose）：
  - 具体数据扫描、对比、修复脚本编写
  - 抽样比对
  - 每个子任务必须返回结构化结果（不要大段自然语言总结）

---

## 6. 风险与对策

| 风险 | 概率 | 影响 | 对策 |
|---|---|---|---|
| 03 × 01 命名规范化失败 | 中 | 高 | 先 pilot（5 条典型批次），规则化后再全量 |
| 13 OCR 错误率过高 | 中 | 高 | P3.3 量化后如 > 30%，升级为"部分重 OCR"，不强求全自动 |
| `页码全为 1` 是系统 BUG | 中 | 中 | 根因调查后决定是否重 OCR，最坏情况接受现状并标记 |
| 子 agent 并行导致文件冲突 | 低 | 中 | 每阶段产物目录独立；同阶段内子任务对文件按前缀分区 |
| 用户验收发现大问题要回滚 | 中 | 中 | 每阶段产物独立，回滚只影响当阶段 |
| 超出 2 周预算 | 中 | 低 | 每周 checkpoint；阶段卡壳先退化到最低可行方案 |

---

## 7. 验收策略

**分阶段验收**：每阶段 sign-off 后才启动下一阶段。

**每阶段验收材料**：
1. `Pn_report.md`（简洁总结 + 关键指标）
2. 主产出文件（xlsx/parquet）
3. 修改日志或差异报告（csv）
4. 待处置事项（如有）

**用户只需做的事**：
- 读 `Pn_report.md` 头部摘要
- 抽查指定样本数量
- 说 OK 或指出具体问题

---

## 8. 开放问题

_由主 agent 识别、记入 ISSUES.md，在执行阶段逐步解决。当前已识别：_

1. **13 的多版本问题**（mimo/claude/多引擎）：3 个版本差异如何协调？→ P3.3 后决策
2. **征集志愿并入主表 vs 独立关联表**：P4.1 决策
3. **最终格式 parquet vs xlsx**：Parquet 性能好但 xlsx 人工可读；建议双产出
4. **`scripts/import-data/import-enriched.ts` 已知 BUG**：本轮不修，但需标注"不要用"
