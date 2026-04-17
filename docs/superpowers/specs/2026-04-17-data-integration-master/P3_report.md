# P3 阶段验收报告 — 13 征集志愿治理

**生成时间**: 2026-04-17
**范围**: 四川普通高考 2023-2025 征集志愿 (含本科/专科 正式+预科+征集轮次)
**未覆盖**: 单招/对口 征集 (另属数据源)、补充数据 (不同表格式，独立工单)

---

## 1. 输入清单

| 项 | 数量 |
|---|---:|
| 征集志愿文件夹 (P3.1 rename 后标准命名) | 78 |
| xlsx 总数 (含所有引擎变体) | 175 |
| 原始 OCR 页图总数 | 约 1,800 |
| 引擎来源 | `mimo-v2-omni` (主) / `claude` / `多引擎` (PaddleOCR-VL-1.5) |

## 2. 流水线总览

```
P3.1 rename  → P3.2 pilot scan → P3.3 OCR error quant → P3.4 repair
                                                           ↓
P3.6 clean  ← P3.5 align vs 03 master
```

| 阶段 | 产物 | 关键指标 |
|---|---|---|
| P3.1 重命名 | rename_plan + execute_rename.py | 175/175 成功, 幂等 |
| P3.2 试点扫描 | p3_pilot_2023_2024.py | 69 文件, 11 列签名, 2 空表 |
| P3.3 错误量化 | ocr_error_catalog.md | 27,724 行, bracket_unbalanced 61, malformed 25 |
| P3.4 修复 | 13_normalized.xlsx | 23,014 行 (去 duplicate-engine 后) |
| P3.5 对齐 | 13_aligned.xlsx | 命中率 **52.4%**, malformed 仅 5 |
| P3.6 汇总 | 13_clean.xlsx | **23,009 行** (排除 5 malformed) |

## 3. P3.4 修复分布

| 修复类型 | 次数 | 说明 |
|---|---:|---|
| `normalize_chars` | 4,503 | 半角→全角括号、空白归一 |
| `forward_fill_college` | 3,629 | 多专业行的 院校代码/名称/地址 下填 |
| `pad_zero` | 11 | 院校代码 < 4 位补前导 0 |
| `strip_bracket_tag` | 6 | 专业代码尾部 `[V]` 等 OCR 标签去除 |
| `flag:short_alphanum` | 5 | 2K/0T/1A/9C/G5 等特殊代码 (保留并标记) |

## 4. P3.5 对齐结果

主表: `data/03_专家版主表/output/专业招生主表.xlsx` (48,131 行)
联合键: `(数据年份, 院校代码, 专业代码)`

| 结果 | 行数 | 占比 | 处理 |
|---|---:|---:|---|
| `_in_master=True` | 12,061 | 52.4% | 保留进入 13_clean |
| `legit_miss` (4 位合法码，主表无) | 10,948 | 47.6% | 保留 — 征集志愿补未完成计划 |
| `malformed` | 5 | 0.02% | 单独转交人工 |

### legit_miss 年份分布

| 年份 | 行数 | 说明 |
|---|---:|---|
| 2023 | 4,978 | 03 主表对 2023 历史覆盖稀薄 |
| 2024 | 5,754 | 同上 |
| 2025 | 216 | 主表覆盖充分，此为征集补充 |

**解读**: 2025 年 216 条 legit_miss 是 **征集志愿业务正常情况** (补充未完成计划)。2023/2024 的 10,732 条大部分应在未来 Task 7b (历史年份 outer join) 中被 01 数据反哺进 03 主表后命中。

## 5. 关键决策 (DECISIONS.md)

- **D-P3-001**: 跳过图像级人工验证 subagent — 程序化抽样已覆盖 OCR 错误分布
- **D-P3-002**: ADR-004 修订 — page=1 作为红旗误报，关闭
- **D-P3-003**: TBD-003 关闭 — 88 文件中仅 1 个 all_one 案例，非系统性问题

## 6. 关键工程修复

### 6.1 引擎偏好 (D-P3-004)

检测到 `_多引擎.xlsx` (PaddleOCR-VL-1.5) 导出格式有 **1 行元数据作表头**，导致列名全部识别为 `Unnamed: N`，进而 `院校代码` 列解析为空。

**修复**: `_select_preferred_engine` 实现优先级 `mimo > claude > 多引擎`。同文件夹内多变体共存时保留最高优先级。

影响: `4414_2025_物历综合_本科批次_B段_征集志愿_第三次` 文件夹仅含 claude + 多引擎 (无 mimo)，切换到 claude 后该文件 1,541 行从 "空码 malformed" 变为正确数据。

### 6.2 Forward-fill (D-P3-005)

OCR 导出的多专业行模式: 同院校首行印 院校代码/名称/地址，后续行空白。若不下填，后续行会被错误分类为 malformed。

**修复**: `_forward_fill_college` 当且仅当 `专业代码` 有值时回填 `院校代码/名称/地址`。3,629 条修复。

## 7. 交付产物

```
data/_pipeline/P3/
├── 13_normalized.xlsx       23,014 rows, 84 cols (含 _meta_* + _source_file)
├── 13_aligned.xlsx          同上 + _in_master + _miss_kind
├── 13_clean.xlsx            23,009 rows, 最终交付给 P4
├── P3_fix_log.csv           8,156 修复记录
├── P3_skipped.csv           17 skip 条目 (含 9 补充数据 + 7 engine-duplicate + 2 empty)
├── not_in_master.csv        10,948 legit_miss
└── needs_human_review.csv   5 malformed (2K/0T/1A/9C + 1 列错位)
```

## 8. 遗留事项

| 事项 | 责任 | 紧急度 |
|---|---|---|
| 5 条 malformed 的 OCR 重扫 (尤其 3799 / G5 列错位) | 需人工裁定 | 低 (占比 0.02%) |
| 2022-2024 历史年份 01×03 反哺 | Task 7b (pending) | 中 |
| 补充数据 (9 文件) 独立解析器 | 独立工单 | 低 |
| P4 三源统一 (03+01+13) | P4 阶段 | 下一阶段 |

## 9. 测试覆盖

| 模块 | 测试数 | 覆盖 |
|---|---:|---|
| `test_p3_execute_rename.py` | 6 | rename 幂等、3 type 支持 |
| `test_ocr_fixes.py` | 12 | normalize/pad/char_conf/strip_tag/memo |
| `test_p3_repair.py` | 11 | metadata parse / repair / forward-fill / engine preference |
| `test_p3_align_to_master.py` | 6 | classify_miss / align |
| `test_p3_build_clean.py` | 3 | malformed filter |
| **合计** | **38** | P3 全流水线单测全通过 |

## 10. 验收结论

- ✅ 175 文件全部完成治理 (含 9 已排除的 补充数据)
- ✅ 命中率 52.4% (2025 主表强覆盖)，legit_miss 47.6% 业务合理
- ✅ malformed 收敛到 5 条 (0.02%)，全部可解释
- ✅ 38 个单测全通过
- ✅ 产物可被 P4 直接消费

**P3 阶段验收通过，进入 P4 (三源统一)。**
