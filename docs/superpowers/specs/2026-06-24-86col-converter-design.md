# 86 列主表 converter — 设计文档（子项目 B）

- 日期：2026-06-24
- 子项目：B（2026 数据上线 5 子项目之一；A 已完成）
- 目标：让 2026 专家版 86 列主表能正确入库（产出 import_to_db.ts 消费的 JSON），并修补 schema↔migration 漂移、弃用旧入库路径。
- 状态：设计待项目负责人最终审核

## 背景

真正入库链 = Python converter → JSON → `scripts/data-processing/import_to_db.ts`(8 字段全键, replace 模式) → MySQL。但**没有任何脚本读新的 86 列主表**「四川-2026-专家版数据_批次标准化.xlsx」(51878 行)。现有 `xlsx_to_json.py` 读的是 4 月的 71 列旧表「专业招生主表.xlsx」、按硬编码列号切、且 enrollment_plans 只产 2025/2024/2023（**无 2026**）。直接拿它喂新表会**静默错位**。详见记忆 [[golive_2026_pipeline_gap]]。

## 目标 / 非目标

**目标**
1. 新写「按列名读」的主表 converter，缺关键列即 fail-fast，产出 import_to_db.ts 所需 JSON：`enrollment_plans_enriched.json`（含 **year=2026** + 历史 2025/2024/2023）、`admission_records_filled.json`（2025/2024/2023）、`majors_enriched.json`。
2. 补一条对齐 migration，把生产已存在但 migration 缺失的 8 字段唯一键 + recruit_type/major_code/major_name/group_code 列固化进迁移历史（否则干净库重建即崩）。
3. 弃用旧入库路径 `scripts/import-data/index.ts`（从 package.json 摘 `import:data`、加 DEPRECATED 标记）。

**非目标**
- 院校 enriched：仍走 `院校信息表.xlsx → universities_enriched.json`（富集字段全：满意度/章程/logo/QS 等，新主表没有），**不动**。
- score_segments / batch_lines / supplementary / health_restrictions：各自独立来源，不在 B。
- sourceYear 解耦（A 已完成）、征集 importer 修字段（C）、收尾编排（D）、UI 标注（E）。
- 院校代码：实测主表 100% 为 4 位文本码（带前置 0，北大=`0001`）；import_to_db.ts 已 `padStart(4,'0')` 补零匹配。B 仅"匹配不上就报告未命中清单"，不重构编码体系（国标码缺失属 P2 欠债）。

## 关键设计决定

1. **按列名读**：启动时建 `header → index` 映射，所有取值用列名常量；缺必需列（科类/批次/招生类型/院校代码/专业组代码/专业代码/专业名称/计划人数 等）即 `sys.exit(1)` 并打印缺哪列。杜绝旧脚本的静默列号错位。
2. **新 converter 与旧并存**：新写 `xlsx_to_json_2026.py`（不覆盖 xlsx_to_json.py，避免误跑旧逻辑动到旧表）；主入口产 majors/plans/records 三个 JSON；universities 仍由 xlsx_to_json.py 的 `convert_universities` 提供（B 可直接复用其 universities 部分或保留两步跑）。
3. **1/2/3 后缀 = 2025/2024/2023**（A-agent 数值锚定 92-94% 命中确证）。
4. **enrollment_plans 产 4 个年份**：2026（计划人数 col + 专业组计划人数）+ 2025/2024/2023（计划人数结果1/2/3，填充 70/59/55%；缺即跳过该年）。历史年同样写 per-major planCount，根治旧库 2024/2023 组级粒度缺陷。
5. **admission_records 产 3 个年份**：2025/2024/2023（内联 录取人数/最低分/位次/平均/最高 + 专业组级 1 + 投档线 1）。新表无 2022（旧表有，已砍）。
6. **planNotes = 专业备注**（中外合作标记在此，1070 行；喂 backfill-sino-foreign.sql）。
7. **level = 本科/专科 列**，`职业本科 → 本科`（与下游本/专二分一致；Major.level 与 plan.level 同源）。
8. **不可得字段置空**：isNationalFeature / majorRanking / majorHonor（新表无 国家特色专业/专业排名/专业荣誉 列）→ False/None。
9. **专业组身份 = 院校代码(4位补零) + 组代码(3位)**，进 8 字段唯一键，组身份完整、无需 prose 名（四川院校专业组模型；实测主表组代码 100% 为 3 位码、无组名列；生产 group_name 2023/24 全空、2025 也 96.1% 空，佐证）。**groupName 仅对定向/专项组填充**：从 专业备注 best-effort 抽取定向县/专项标识（如"(凉山州)(区域教育均衡发展专项计划)"），让生成页"搜定向县"对 2026 仍有效；其余留空（= 生产现状）。**不**把"组内专业"长描述（带分数）塞进 groupName。groupMajors 留空。抽取格式上线前对比生产 group_name 样式校准。
10. **省份硬编码 '四川'**（与旧一致）。

## 86 列 → JSON 字段映射（按列名）

**majors_enriched**（按 专业名称+level 去重）
| JSON | 列名 |
|---|---|
| name | 专业名称 |
| code | 专业代码 |
| category | 门类 |
| level | 本科/专科（职业本科→本科） |
| discipline | 专业类 |
| notes | 专业备注 |
| majorLevel | 专业水平 |
| softRating | 软科评级 |

**enrollment_plans_enriched** — shared（每年共用）
| JSON | 列名 |
|---|---|
| universityEnrollCode | 院校代码 |
| majorName | 专业名称 |
| majorCode | 专业代码 |
| groupCode | 专业组代码 |
| subjects | 科类（物理/历史） |
| batch | 批次 |
| recruitType | 招生类型 |
| province | '四川' |
| level | 本科/专科（职业本科→本科） |
| subjectRequirements | 选科要求 |
| isNew | 是否新增（'是'→true） |
| oldBatch | 老批次1 |
| disciplineEval | 学科评估 |
| isNationalFeature | （无列）→ false |
| majorRanking / majorHonor | （无列）→ null |
| localMasterPoint | 本专业硕士点 |
| localDoctoralPoint | 本专业博士点 |
| softRating | 软科评级 |
| planNotes | 专业备注 |
| groupName | 定向/专项组：从 专业备注 抽定向县/专项标识；否则 null（决定 9） |
| groupMajors | null |

enrollment_plans — 按年追加：
- **2026**：year=2026, planCount=计划人数, groupPlanCount=专业组计划人数, tuition=学费, duration=学制
- **2025**：year=2025, planCount=计划人数结果1, groupPlanCount=null, tuition/duration=null（仅当 计划人数结果1 非空）
- **2024**：year=2024, planCount=计划人数结果2（仅当非空）
- **2023**：year=2023, planCount=计划人数结果3（仅当非空）

**admission_records_filled** — shared：universityEnrollCode/majorName/majorCode/groupCode/subjects(科类)/batch/recruitType/province='四川'/level。按年（全空则跳过该年）：
| 年 | 字段 ← 列 |
|---|---|
| 2025 | groupAdmissionCount←专业组录取人数1, groupMinScore←专业组最低分1, groupMinRank←专业组最低位次1, majorAdmissionCount←录取人数1, majorMinScore←最低分1, majorMinRank←最低位次1, majorAvgScore←平均分1, majorAvgRank←平均位次1, majorMaxScore←最高分1, majorMaxRank←最高位次1 |
| 2024 | majorAdmissionCount←录取人数2, majorMinScore←最低分2, majorMinRank←最低位次2, majorAvgScore←平均分2, majorAvgRank←平均位次2（最高分/位次2 无列→null） |
| 2023 | majorAdmissionCount←录取人数3, majorMinScore←最低分3, majorMinRank←最低位次3, majorAvgScore←平均分3, majorAvgRank←平均位次3, majorMaxScore←最高分3, majorMaxRank←最高位次3 |

注：2025 才有专业组级(专业组最低分1/位次1/录取人数1)与可单列的投档线；2024/2023 内联只到专业级（与生产实测 group_min_rank 2024 才开始填充一致）。25 老组投档线/位次(col81/82) 属跨年组映射辅助，不直接入 admission_records。

## schema ↔ migration 对齐

生产 `enrollment_plans`/`admission_records` 的 8 字段唯一键与 recruit_type/major_code/major_name/group_code 列**只存在于生产库**（手工/db push），migration 历史里是 4 字段旧键、无这些列。
- 步骤：先 `SHOW CREATE TABLE enrollment_plans / admission_records`（生产，只读）核实真实结构 → 写一条幂等 migration（`ADD COLUMN IF NOT EXISTS` + `CREATE UNIQUE INDEX`，与 schema.prisma 现状对齐）→ 本地 `prisma migrate` 验证干净库重建后结构正确。
- 价值：任何干净环境重建不再崩；CI/新机可复现。

## 弃用旧路径

- 从根 `package.json` 移除/注释 `import:data`（指向 `scripts/import-data/index.ts`，用 4 字段旧键 + 不写 group_plan_count + 与现 schema 不符会报错）。
- `scripts/import-data/` 放 `DEPRECATED.md` 指明 source-of-truth 是 `import_to_db.ts`。

## 测试（TDD，pytest，复用 test_xlsx_to_json.py 范式）

1. `build_header_index`：给 86 列表头返回 name→index；缺必需列时 `raise`（fail-fast）。
2. `convert_majors_from_master`：合成 2 行（同名不同 level）→ 去重正确、字段映射正确。
3. `convert_enrollment_plans_from_row`：一行齐全 → 产 4 条（2026/2025/2024/2023）；计划人数结果2/3 为空 → 只产 2026/2025；2026 行带 groupPlanCount。
4. `convert_admission_records_from_row`：一行 → 2025 含 group 级 + major 级；2024/2023 仅 major 级；某年全空 → 跳过。
5. `subjects` 取自 科类（物理/历史），`level` 职业本科→本科，`planNotes` 取 专业备注。
6. fail-fast：删掉"院校代码"列的表头 → 转换抛错、非静默。

## 端到端验证（产出后，未入库前）

- 产出 JSON 后断言计数：enrollment_plans 的 year=2026 行数 ≈ 51878（每主表行 1 条 2026 plan）；2025/2024/2023 行数 ≈ 36772/30746/28823（= 计划人数结果1/2/3 填充数）；admission 2025 ≈ 录取人数1 填充数。
- 院校代码覆盖：master 中 distinct 院校代码（4 位补零）全部能在 universities_enriched 命中；打印未命中清单。
- 入库后（生产/测试库）：`SELECT year,COUNT(*),SUM(group_plan_count IS NULL) FROM enrollment_plans GROUP BY year` 确认 2026 行存在、group_plan_count 非空；`admission_records` 按年计数；再跑 backfill-sino-foreign.sql 后 `SUM(is_sino_foreign)` ≈ 1070 组对应行数。

## 关键引用

- `scripts/data-processing/import_to_db.ts:228-419`（消费 enrollment_plans_enriched/admission_records_filled 的字段契约 + 8 字段唯一键 upsert）
- `scripts/data-processing/xlsx_to_json.py`（旧 converter；universities 部分复用、main-table 部分被 B 取代）
- `apps/server/prisma/schema.prisma:586-713`（EnrollmentPlan/AdmissionRecord 字段 + 8 字段 @@unique）
- 记忆 [[golive_2026_pipeline_gap]] [[sourceyear_coupling_blocker]] [[enrollment_plan_count_grain]] [[sino_foreign_data_gap]]
