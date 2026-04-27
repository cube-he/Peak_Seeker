# Data Integration Infrastructure — Plan 1

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the reusable infrastructure modules (column mapping, batch normalization, matching engine, conflict reporter) that Plan 2 (school_registry) and Plan 3 (enrollments) depend on.

**Architecture:** Column mappers define source→target field paths per data source. The batch normalizer extends existing batch_mapping to handle all source batch name variants. The matcher implements two-level matching (exact 6-field → full-field confidence). The conflict reporter emits CSV for human review.

**Tech Stack:** Python 3, pytest, openpyxl, rapidfuzz (string similarity), pandas (optional for reporting)

**Spec:** `docs/superpowers/specs/2026-04-27-data-integration-workflow-design.md`

---

## File Structure

```
scripts/data_integration/
├── three_layer/
│   ├── column_maps.py          # Task 1: 每个数据源 → 目标字段的列映射
│   ├── batch_normalizer.py     # Task 2: 扩展批次名归一化（所有源的批次变体）
│   ├── field_comparator.py     # Task 3: 字段级比较（字符串相似度、数值接近度）
│   ├── matcher.py              # Task 4: 两级匹配引擎
│   └── conflict_reporter.py    # Task 5: 冲突报告生成
└── tests/test_three_layer/
    ├── test_column_maps.py
    ├── test_batch_normalizer.py
    ├── test_field_comparator.py
    ├── test_matcher.py
    └── test_conflict_reporter.py
```

---

## 目标字段全量映射表

### Layer 3 enrollment 级（3 字段）

| Target Field | Source A (李老师70列) | Source 01/专业分数线 | Source 01/招生计划 | Source H (清洗后87列) | Source G (整合版85列) |
|---|---|---|---|---|---|
| batchNodeId | Col02 批次 → normalize | batch → normalize | batch → normalize | Col13 批次 → normalize | Col13 批次 → normalize |
| enrollmentType | Col03 批次备注 | — (从batch推导) | — | Col12 类型 | Col12 类型 |
| batchName | 冗余，从 batchNodeId 查 batch_tree | — | — | — | — |

### Layer 3 group 级（3 + groupYearly）

| Target Field | Source A | 01/专业分数线 | 01/院校分数线 | Source H | Source G |
|---|---|---|---|---|---|
| groupCode | Col08 专业组代码 | — (无) | — | Col02 专业组代码 | Col02 专业组代码 |
| subjectReq | Col14 选科要求 | chooseSubjectText | uChooseSubjectRule | Col11 选科要求 | Col11 选科要求 |
| note | Col13 院校备注 | uRemark | uRemark | Col04 院校备注 | Col04 院校备注 |
| groupYearly.2025.groupPlan | Col20 专业组计划人数 | — | planNum | Col16 25专业组计划 | Col16 25专业组计划 |
| groupYearly.2025.filingMin | — | — | minScore (院校级) | Col21 25投档最低分 | — |
| groupYearly.2025.filingMinRank | — | — | minRank (院校级) | Col22 25投档最低位次 | — |
| groupYearly.2025.groupEnrolled | Col26 专业组录取人数 | — | enterNum | Col23 25专业组录取人数 | — |
| groupYearly.2025.groupMin | Col27 专业组最低分 | — | — | Col24 25专业组最低分 | — |
| groupYearly.2025.groupMinRank | Col28 专业组最低位次 | — | — | Col25 25专业组最低位次 | — |
| groupYearly.2024.batchMin | — | — | (2024 院校分数线) | Col33 24专业组最低分 | Col21 24专业组最低分 |
| groupYearly.2024.batchMinRank | — | — | (2024 院校分数线) | Col34 24专业组最低分位次 | Col22 24专业组最低分位次 |
| groupYearly.2024.batchEnrolled | — | — | (2024 院校分数线) | Col35 24专业组录取人数 | Col23 24专业组录取人数 |

### Layer 3 major 级 · 基本信息（11 字段）

| Target Field | Source A | 01/专业分数线 | 01/招生计划 | Source H | Source G |
|---|---|---|---|---|---|
| code | Col09 专业代码 | professionEnrollCode | code | Col06 专业代码 | Col06 专业代码 |
| name | Col11 专业名称 | professionName | professionName | Col05 专业 | Col05 专业 |
| fullName | Col10 专业全称 | — | — | — (无此列) | — (无此列) |
| category | Col22 专业类 | — | — | Col07 专业类 | Col07 专业类 |
| discipline | Col21 门类 | — | — | Col08 门类 | Col08 门类 |
| majorNote | Col12 专业备注 | remark | remark | Col09 专业备注 | Col09 专业备注 |
| isNew | Col23 是否新增 | — | — | Col15 是否新增 | Col15 是否新增 |
| duration | Col17 学制 | learnYear | learnYear | Col18 学制 | Col18 学制 |
| tuition | Col18 学费 | cost | cost | Col19 学费 | Col19 学费 |
| oldBatch | Col41 老批次 | — | — | Col14 老批次 | Col14 老批次 |
| oldBatch2 | — (A无此列) | — | — | — (H无此列) | — (G无此列) |

### Layer 3 major 级 · quality（9 字段）

| Target Field | Source A | 02/学科评估 | Source H | Source G |
|---|---|---|---|---|
| rating | Col64 软科评级 | — | Col72 软科评级 | — |
| rank | Col65 软科排名 | — | Col73 软科排名 | — |
| assessment | Col66 学科评估 | 评估类型名称+名称 | Col74 学科评估 | Col75 学科评估等级 |
| level | Col67 专业水平 | — | Col75 专业水平 | — |
| isNationalFeatured | — (A无此列) | — | Col76 是否国家特色 | Col76 是否国家特色 |
| majorRank | — (A无此列) | — | Col77 专业排名 | Col77 专业排名 |
| honor | — (A无此列) | — | Col78 专业荣誉 | Col78 专业荣誉 |
| masterPoint | Col68 本专业硕士点 | — | Col85 本专业硕士点 | — (G无此列) |
| doctoralPoint | Col69 本专业博士点 | — | Col86 本专业博士点 | — (G无此列) |

### Layer 3 major 级 · yearly 分数

| Target Field | Source A 列号 | 01/专业分数线 字段 | Source H 列号 |
|---|---|---|---|
| 2025.plan | Col16 计划人数 | planNum | Col17 计划人数 |
| 2025.enrolled | — | enterNum | Col26 25录取人数 |
| 2025.min | Col24 最低分 | minScore | Col27 25最低分 |
| 2025.minRank | Col25 最低位次 | minRank | Col28 25最低位次 |
| 2025.avg | — | avgScore | Col29 25平均分 |
| 2025.avgRank | — | avgRank | Col30 25平均位次 |
| 2025.max | — | maxScore | Col31 25最高分 |
| 2025.maxRank | — | — | Col32 25最高位次 |
| 2024.plan | Col42 计划人数结果 | (2024文件) planNum | — (H无24计划) |
| 2024.enrolled | Col36 录取人数 | (2024文件) enterNum | Col36 24录取人数 |
| 2024.min | Col37 最低分 | (2024文件) minScore | Col37 24最低分 |
| 2024.minRank | Col38 最低位次 | (2024文件) minRank | Col38 24最低分位次 |
| 2024.avg | Col39 平均分 | (2024文件) avgScore | Col39 24平均分 |
| 2024.avgRank | Col40 平均位次 | (2024文件) avgRank | Col40 24平均位 |
| 2024.max | — | (2024文件) maxScore | Col41 24最高分 |
| 2024.maxRank | — | — | Col42 24最高位 |
| 2023.plan | — | (2023文件) planNum | — (H无23计划) |
| 2023.enrolled | Col45 录取人数 | (2023文件) enterNum | Col43 23录取人数 |
| 2023.min | Col43 最低分 | (2023文件) minScore | Col44 23最低分 |
| 2023.minRank | Col44 最低位次 | (2023文件) minRank | Col45 23最低分位次 |
| 2023.avg | — | (2023文件) avgScore | Col46 23平均分 |
| 2023.avgRank | — | — | Col47 23平均位 |
| 2023.max | — | (2023文件) maxScore | Col48 23最高分 |
| 2023.maxRank | — | — | Col49 23最高位 |
| 2022.enrolled | — | (2022文件) enterNum | Col50 22录取人数 |
| 2022.min | — | (2022文件) minScore | Col51 22最低分 |
| 2022.minRank | — | (2022文件) minRank | Col52 22最低分位次 |
| 2022.avg | — | (2022文件) avgScore | Col53 22平均分 |
| 2022.avgRank | — | — | Col54 22平均分位次 |
| 2022.max | — | (2022文件) maxScore | Col55 22最高分 |
| 2022.maxRank | — | — | Col56 22最高分位次 |

### 未覆盖字段 (No Source Found)

| Target Field | 说明 |
|---|---|
| **oldBatch2** | 2023年老批次名。Source A 无此列，H/G 也无。仅存在于 `output/专业招生主表.xlsx` Col08，需从历史产出回填或从 01/2023 招生计划的 batch 字段推导 |
| **2025.maxRank** | Source A 无，01/专业分数线 无 maxRank 字段，仅 H 有 (Col32) |
| **2024/2023/2022.maxRank** | Source A 无，01 无，仅 H 有 |
| **2024.plan (24计划人数)** | A 的 Col42 标注"计划人数结果"语义模糊，H 无此列，需从 01/2024招生计划获取 |
| **2023.plan** | A 无，H 无，需从 01/2023招生计划获取 |
| **supplementary (征集志愿)** | 所有常规源均无。需从 `data/13_征集志愿/` 单独处理，不在 Plan 1 范围 |
| **satisfaction (满意度星级)** | 02/院校满意度 有综合/生活/环境满意度但缺 `生活评价人数` 和 `环境评价人数` 列。需校验 |

---

### Task 1: column_maps.py — 全源列映射定义

**Files:**
- Create: `scripts/data_integration/three_layer/column_maps.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_column_maps.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_three_layer/test_column_maps.py
# -*- coding: utf-8 -*-
"""Tests for column mapping definitions."""
import pytest
from three_layer.column_maps import (
    SOURCE_A_MAP, SOURCE_H_MAP, SOURCE_01_SCORE_MAP,
    SOURCE_01_PLAN_MAP, SOURCE_02_SCHOOL_MAP,
    TARGET_ENROLLMENT_FIELDS, TARGET_GROUP_FIELDS,
    TARGET_MAJOR_FIELDS, TARGET_QUALITY_FIELDS,
    TARGET_YEARLY_FIELDS, TARGET_SCHOOL_FIELDS,
    get_source_map, list_sources,
)


def test_source_a_has_all_enrollment_fields():
    """Source A must map at least batchNodeId source column."""
    assert "batchNodeId" in SOURCE_A_MAP


def test_source_a_major_basic_coverage():
    """Source A must cover: code, name, fullName, category, discipline, majorNote, duration, tuition."""
    required = {"code", "name", "fullName", "category", "discipline", "majorNote", "duration", "tuition"}
    mapped = set(SOURCE_A_MAP.keys())
    missing = required - mapped
    assert not missing, f"Source A missing major basic fields: {missing}"


def test_source_01_score_covers_yearly():
    """01/专业分数线 must map all score fields."""
    required = {"min", "minRank", "avg", "avgRank", "max", "enrolled", "plan"}
    mapped = set(SOURCE_01_SCORE_MAP.keys())
    missing = required - mapped
    assert not missing, f"01 score missing: {missing}"


def test_source_02_school_covers_target():
    """02/院校库 must cover basic school fields."""
    required = {"name", "province", "city", "type", "nature", "authority"}
    mapped = set(SOURCE_02_SCHOOL_MAP.keys())
    missing = required - mapped
    assert not missing, f"02 school missing: {missing}"


def test_all_target_fields_have_at_least_one_source():
    """Every target field must be mapped from at least one source (or flagged as uncovered)."""
    from three_layer.column_maps import UNCOVERED_FIELDS, ALL_TARGET_FIELDS
    all_maps = [SOURCE_A_MAP, SOURCE_H_MAP, SOURCE_01_SCORE_MAP, SOURCE_01_PLAN_MAP, SOURCE_02_SCHOOL_MAP]
    covered = set()
    for m in all_maps:
        covered.update(m.keys())
    uncovered = ALL_TARGET_FIELDS - covered - UNCOVERED_FIELDS
    assert not uncovered, f"Fields neither mapped nor flagged as uncovered: {uncovered}"


def test_get_source_map_returns_correct():
    assert get_source_map("A") is SOURCE_A_MAP
    assert get_source_map("01_score") is SOURCE_01_SCORE_MAP


def test_list_sources():
    sources = list_sources()
    assert "A" in sources
    assert "H" in sources
    assert "01_score" in sources
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_column_maps.py -v
```

- [ ] **Step 3: Implement column_maps.py**

Each source map is a dict: `{target_field_name: source_column_identifier}`.
Source column identifiers are:
- For xlsx: column index (int) or column header name (str)
- For JSON: JSON key path (str)

```python
# three_layer/column_maps.py
# -*- coding: utf-8 -*-
"""Column mappings from each data source to the target three-layer schema.

Each map: {target_field: source_column}
- xlsx sources: source_column is the column header string
- json sources: source_column is the JSON key string

Design ref: docs/superpowers/specs/2026-04-27-data-integration-workflow-design.md
Full mapping table: docs/superpowers/plans/2026-04-27-integration-infrastructure.md
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Target field registry (exhaustive list of all fields in three-layer schema)
# ---------------------------------------------------------------------------

TARGET_ENROLLMENT_FIELDS = {"batchNodeId", "batchName", "enrollmentType"}

TARGET_GROUP_FIELDS = {
    "groupCode", "subjectReq", "note",
    "groupYearly.2025.groupPlan", "groupYearly.2025.filingMin",
    "groupYearly.2025.filingMinRank", "groupYearly.2025.groupEnrolled",
    "groupYearly.2025.groupMin", "groupYearly.2025.groupMinRank",
    "groupYearly.2024.batchMin", "groupYearly.2024.batchMinRank",
    "groupYearly.2024.batchEnrolled",
}

TARGET_MAJOR_FIELDS = {
    "code", "name", "fullName", "category", "discipline",
    "majorNote", "isNew", "duration", "tuition",
    "oldBatch", "oldBatch2",
}

TARGET_QUALITY_FIELDS = {
    "quality.rating", "quality.rank", "quality.assessment",
    "quality.level", "quality.isNationalFeatured",
    "quality.majorRank", "quality.honor",
    "quality.masterPoint", "quality.doctoralPoint",
}

TARGET_YEARLY_FIELDS = {
    f"yearly.{y}.{f}"
    for y in ("2025", "2024", "2023", "2022")
    for f in ("plan", "enrolled", "min", "minRank", "avg", "avgRank", "max", "maxRank")
}

TARGET_SCHOOL_FIELDS = {
    # location
    "school.province", "school.provinceCode", "school.city",
    "school.cityTier", "school.address",
    # basic
    "school.type", "school.nature", "school.authority",
    "school.level", "school.founded", "school.maleRatio", "school.femaleRatio",
    # tags
    "school.tier", "school.background", "school.labels", "school.isDoubleFirstClass",
    # history
    "school.evolution", "school.mergers",
    # ids
    "school.yangguangId", "school.nationalCode", "school.schoolIdentifier",
    # rankings
    "school.composite", "school.overallRank", "school.overallScore",
    "school.qs", "school.usNews", "school.alumni",
    "school.wushulian", "school.arwu", "school.moe", "school.popularity",
    # academics
    "school.masterPrograms", "school.doctoralPrograms",
    "school.masterSubjects", "school.doctoralSubjects",
    "school.localMaster", "school.localDoctoral",
    "school.postgraduateRate", "school.furtherStudyRate",
    "school.assessmentSummary", "school.doubleFirstClassCount",
    "school.aClassCount", "school.nationalFeaturedCount", "school.provincialFeaturedCount",
    "school.doubleFirstClassSubjects", "school.featuredMajors",
    # admissionRules
    "school.filingRatio", "school.majorAllocation", "school.tiebreakRule",
    "school.healthRestrictions", "school.adjustmentPolicy",
    "school.foreignLanguageReq", "school.subjectScoreReq",
    "school.bonusPolicy", "school.tuitionPolicy",
    "school.majorTransfer", "school.majorTransferRestrictions",
    # links
    "school.admissionGuide", "school.officialSite", "school.phone",
    "school.logo", "school.banner",
    # satisfaction
    "school.satisfaction.overall", "school.satisfaction.living",
    "school.satisfaction.environment",
}

ALL_TARGET_FIELDS = (
    TARGET_ENROLLMENT_FIELDS | TARGET_GROUP_FIELDS |
    TARGET_MAJOR_FIELDS | TARGET_QUALITY_FIELDS |
    TARGET_YEARLY_FIELDS | TARGET_SCHOOL_FIELDS
)

# Fields that have NO source in any current data file
UNCOVERED_FIELDS = {
    "batchName",                   # derived from batchNodeId + batch_tree
    "oldBatch2",                   # only in historical output, needs reconstruction
    "yearly.2025.maxRank",         # only in H, not in A or 01
    "yearly.2024.maxRank",         # only in H
    "yearly.2023.maxRank",         # only in H
    "yearly.2022.maxRank",         # only in H
    "school.officialSite",         # not in 02 (only in 03 vendor data)
    "school.admissionSite",        # not in 02 (only in 03 vendor data)
}


# ---------------------------------------------------------------------------
# Source A: 13-2026-四川-专家版 (李老师) — 48135 rows, header at row 3
# ---------------------------------------------------------------------------

SOURCE_A_MAP = {
    # enrollment
    "batchNodeId": "批次",               # Col02, needs normalize
    "enrollmentType": "批次备注",         # Col03
    # group
    "groupCode": "专业组代码",            # Col08
    "subjectReq": "选科要求",             # Col14
    "note": "院校备注",                   # Col13
    "groupYearly.2025.groupPlan": "专业组计划人数",    # Col20
    "groupYearly.2025.groupEnrolled": "专业组录取人数", # Col26
    "groupYearly.2025.groupMin": "专业组最低分",       # Col27
    "groupYearly.2025.groupMinRank": "专业组最低位次", # Col28
    # major basic
    "code": "专业代码",                   # Col09
    "name": "专业名称",                   # Col11
    "fullName": "专业全称",               # Col10
    "category": "专业类",                 # Col22
    "discipline": "门类",                 # Col21
    "majorNote": "专业备注",              # Col12
    "isNew": "是否新增",                  # Col23
    "duration": "学制",                   # Col17
    "tuition": "学费",                    # Col18
    "oldBatch": "老批次",                 # Col41
    # major quality
    "quality.rating": "软科评级",          # Col64
    "quality.rank": "软科排名",            # Col65
    "quality.assessment": "学科评估",      # Col66
    "quality.level": "专业水平",           # Col67
    "quality.masterPoint": "本专业硕士点", # Col68
    "quality.doctoralPoint": "本专业博士点", # Col69
    # yearly 2025
    "yearly.2025.plan": "计划人数",        # Col16
    "yearly.2025.min": "最低分",           # Col24 (第一个同名列)
    "yearly.2025.minRank": "最低位次",     # Col25
    # yearly 2024
    "yearly.2024.enrolled": "录取人数",    # Col36
    "yearly.2024.min": "最低分_2",         # Col37
    "yearly.2024.minRank": "最低位次_2",   # Col38
    "yearly.2024.avg": "平均分",           # Col39
    "yearly.2024.avgRank": "平均位次",     # Col40
    "yearly.2024.plan": "计划人数结果",    # Col42
    # yearly 2023
    "yearly.2023.min": "最低分_3",         # Col43
    "yearly.2023.minRank": "最低位次_3",   # Col44
    "yearly.2023.enrolled": "录取人数_2",  # Col45
    # match key helpers
    "_subject": "科类",                    # Col04 (物理/历史)
    "_schoolCode": "院校代码",             # Col05
    "_schoolName": "院校名称",             # Col06
}


# ---------------------------------------------------------------------------
# Source H: 2026四川高考志愿_清洗后_修改 — 48133 rows, header at row 1
# ---------------------------------------------------------------------------

SOURCE_H_MAP = {
    "batchNodeId": "批次",
    "enrollmentType": "类型",
    "groupCode": "专业组代码",
    "subjectReq": "选科要求",
    "note": "院校备注",
    "groupYearly.2025.groupPlan": "25专业组计划",
    "groupYearly.2025.filingMin": "25投档最低分",
    "groupYearly.2025.filingMinRank": "25投档最低位次",
    "groupYearly.2025.groupEnrolled": "25专业组录取人数",
    "groupYearly.2025.groupMin": "25专业组最低分",
    "groupYearly.2025.groupMinRank": "25专业组最低位次",
    "groupYearly.2024.batchMin": "24专业组最低分",
    "groupYearly.2024.batchMinRank": "24专业组最低分位次",
    "groupYearly.2024.batchEnrolled": "24专业组录取人数",
    "code": "专业代码",
    "name": "专业",
    "category": "专业类",
    "discipline": "门类",
    "majorNote": "专业备注",
    "isNew": "是否新增",
    "duration": "学制",
    "tuition": "学费",
    "oldBatch": "老批次",
    "quality.rating": "软科评级",
    "quality.rank": "软科排名",
    "quality.assessment": "学科评估",
    "quality.level": "专业水平",
    "quality.isNationalFeatured": "是否国家特色",
    "quality.majorRank": "专业排名",
    "quality.honor": "专业荣誉",
    "quality.masterPoint": "本专业硕士点",
    "quality.doctoralPoint": "本专业博士点",
    "yearly.2025.plan": "计划人数",
    "yearly.2025.enrolled": "25录取人数",
    "yearly.2025.min": "25最低分",
    "yearly.2025.minRank": "25最低位次",
    "yearly.2025.avg": "25平均分",
    "yearly.2025.avgRank": "25平均位次",
    "yearly.2025.max": "25最高分",
    "yearly.2025.maxRank": "25最高位次",
    "yearly.2024.enrolled": "24录取人数",
    "yearly.2024.min": "24最低分",
    "yearly.2024.minRank": "24最低分位次",
    "yearly.2024.avg": "24平均分",
    "yearly.2024.avgRank": "24平均位",
    "yearly.2024.max": "24最高分",
    "yearly.2024.maxRank": "24最高位",
    "yearly.2023.enrolled": "23录取人数",
    "yearly.2023.min": "23最低分",
    "yearly.2023.minRank": "23最低分位次",
    "yearly.2023.avg": "23平均分",
    "yearly.2023.avgRank": "23平均位",
    "yearly.2023.max": "23最高分",
    "yearly.2023.maxRank": "23最高位",
    "yearly.2022.enrolled": "22录取人数",
    "yearly.2022.min": "22最低分",
    "yearly.2022.minRank": "22最低分位次",
    "yearly.2022.avg": "22平均分",
    "yearly.2022.avgRank": "22平均分位次",
    "yearly.2022.max": "22最高分",
    "yearly.2022.maxRank": "22最高分位次",
    "_subject": "科目",
    "_schoolCode": "院校代码",
    "_schoolName": "院校",
}


# ---------------------------------------------------------------------------
# Source 01/专业分数线 JSON — per year file
# ---------------------------------------------------------------------------

SOURCE_01_SCORE_MAP = {
    "min": "minScore",
    "minRank": "minRank",
    "avg": "avgScore",
    "avgRank": "avgRank",
    "max": "maxScore",
    "enrolled": "enterNum",
    "plan": "planNum",
    "_subject": "course",
    "_schoolCode": "collegeCode",
    "_schoolName": "collegeName",
    "_batch": "batch",
    "_majorCode": "professionEnrollCode",
    "_majorName": "professionName",
    "_majorNote": "remark",
    "_subjectReq": "chooseSubjectText",
}


# ---------------------------------------------------------------------------
# Source 01/招生计划 JSON
# ---------------------------------------------------------------------------

SOURCE_01_PLAN_MAP = {
    "plan": "planNum",
    "duration": "learnYear",
    "tuition": "cost",
    "majorNote": "remark",
    "code": "code",
    "name": "professionName",
    "_subject": "course",
    "_schoolCode": "collegeCode",
    "_schoolName": "collegeName",
    "_batch": "batch",
    "_subjectReq": "chooseSubjectText",
}


# ---------------------------------------------------------------------------
# Source 02/院校库_全国
# ---------------------------------------------------------------------------

SOURCE_02_SCHOOL_MAP = {
    "name": "中文名称",                    # Col12
    "province": "省份名称",                # Col21
    "provinceCode": "省份代码",            # Col20
    "city": "城市",                        # Col22
    "type": "院校类型",                    # Col18
    "nature": "办学性质名称",              # Col40
    "authority": "隶属部门",               # Col17
    "level": "学历层次名称",               # Col39
    "founded": "建校年份",                 # Col34
    "maleRatio": "男生比例",               # Col32
    "femaleRatio": "女生比例",             # Col33
    "tier": "院校特色",                    # Col19
    "logo": "Logo地址",                    # Col13
    "banner": "Banner地址",                # Col14
    "popularity": "热度",                  # Col23
    "composite": "综合排名",               # Col24
    "overallScore": "综合评分",            # Col31
    "wushulian": "武书连排名",             # Col25
    "arwu": "软科排名",                    # Col26
    "alumni": "校友会排名",                # Col27
    "qs": "QS排名",                       # Col28
    "usNews": "USNews排名",               # Col29
    "moe": "教育部排名",                   # Col30
    "masterPrograms": "硕士点数",           # Col06
    "doctoralPrograms": "博士点数",         # Col07
    "postgraduateRate": "保研率",           # Col00
    "furtherStudyRate": "升学率",           # Col01
    "doubleFirstClassCount": "双一流学科数", # Col02
    "nationalFeaturedCount": "国家级数量",   # Col03
    "provincialFeaturedCount": "省级数量",   # Col04
    "aClassCount": "A类学科数",             # Col05
    "doubleFirstClassSubjects": "双一流专业", # Col08
    "featuredMajors": "特色专业",           # Col09
    "address": "地址",                      # Col37
    "nationalCode": "国标代码",             # Col11
    "schoolIdentifier": "代码",             # Col10
    "_schoolCode": "院校代码",              # Col41
}


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

_SOURCE_REGISTRY: dict[str, dict] = {
    "A": SOURCE_A_MAP,
    "H": SOURCE_H_MAP,
    "01_score": SOURCE_01_SCORE_MAP,
    "01_plan": SOURCE_01_PLAN_MAP,
    "02_school": SOURCE_02_SCHOOL_MAP,
}


def get_source_map(source_id: str) -> dict:
    """Get column mapping for a source by its ID."""
    return _SOURCE_REGISTRY[source_id]


def list_sources() -> list[str]:
    """List all registered source IDs."""
    return list(_SOURCE_REGISTRY.keys())
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_column_maps.py -v
```

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/column_maps.py scripts/data_integration/tests/test_three_layer/test_column_maps.py
git commit -m "feat: add column mapping definitions for all data sources"
```

---

### Task 2: batch_normalizer.py — 扩展批次名归一化

**Files:**
- Create: `scripts/data_integration/three_layer/batch_normalizer.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_batch_normalizer.py`

Extends existing `batch_mapping.py` (which handles 专业招生主表's 28 exact names) with fuzzy variants from all other sources.

- [ ] **Step 1: Write failing tests**

```python
# tests/test_three_layer/test_batch_normalizer.py
# -*- coding: utf-8 -*-
"""Tests for extended batch name normalization across all sources."""
import pytest
from three_layer.batch_normalizer import normalize_batch, BatchNormalizeError


@pytest.mark.parametrize("raw,etype,expected", [
    # 01 API variants
    ("本科B", None, "bkp_b"),               # 01 uses short names
    ("本科A", None, "bkp_a"),
    ("提前", None, "bktqp"),
    ("专科", None, "zkp"),
    ("专科提前", None, "zktqp"),
    # 03/A 李老师 variants
    ("本科提前批A段", "军事类", "bktqp_a_js"),
    ("本科批B段", "普通类本科", "bkp_b_pt"),
    # 03/C 万能版 variants
    ("本科批B段普通类", None, "bkp_b_pt"),
    ("本科提前批B段国家公费师范生", None, "bktqp_b_gjgfsf"),
    # 03/F 曦鸿仕 variants
    ("本科第一批", None, "bkp_b"),            # old gaokao name → new
    ("本科第二批", None, "bkp_b"),
    ("专科批", None, "zkp"),
])
def test_normalize_known_variants(raw, etype, expected):
    result = normalize_batch(raw, etype)
    assert result == expected or result.startswith(expected)


def test_unknown_batch_raises():
    with pytest.raises(BatchNormalizeError):
        normalize_batch("完全不存在的批次", None)
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement batch_normalizer.py**

```python
# three_layer/batch_normalizer.py
# -*- coding: utf-8 -*-
"""Extended batch name normalization across all data sources.

Handles batch name variants from:
- 01_核心录取数据 API (short names: 本科B, 提前, 专科)
- 03 vendor tables (various naming conventions)
- Old gaokao names (本科第一批, 本科第二批)

Uses batch_mapping.BATCH_MAPPING for exact matches first,
then falls back to pattern-based normalization.
"""
from __future__ import annotations
import re
from three_layer.batch_mapping import BATCH_MAPPING, resolve_batch_node_id, BatchMappingError


class BatchNormalizeError(ValueError):
    """Cannot normalize batch name to any known node."""
    pass


# Pattern → node ID (or parent node ID if enrollmentType needed to disambiguate)
# Order matters: more specific patterns first
_PATTERNS: list[tuple[str, str]] = [
    # 01 API short names
    (r"^本科B$", "bkp_b"),
    (r"^本科A$", "bkp_a"),
    (r"^提前$", "bktqp"),
    (r"^专科提前$", "zktqp"),
    (r"^专科$", "zkp"),
    # 万能版 compound names (batch+type merged)
    (r"本科批B段普通类", "bkp_b_pt"),
    (r"本科提前批B段国家公费师范生", "bktqp_b_gjgfsf"),
    (r"本科提前批B段国家优师", "bktqp_b_gjyszx"),
    (r"本科提前批B段农村订单", "bktqp_b_ncddyx"),
    (r"本科提前批B段省级公费师范", "bktqp_b_sjgfsf"),
    (r"本科提前批B段地方优师", "bktqp_b_dfyszx"),
    (r"本科提前批B段乡村振兴", "bktqp_b_xczx"),
    # Old gaokao names → new equivalents
    (r"本科第一批", "bkp_b"),
    (r"本科第二批", "bkp_b"),
    (r"本科一批", "bkp_b"),
    (r"本科二批", "bkp_b"),
    (r"专科批$", "zkp"),
    (r"高职\(专科\)批$", "zkp"),
    (r"高职\(专科\)提前批$", "zktqp"),
    # Partial matches
    (r"本科提前.*国家专项", "bktqp_gjzx"),
    (r"本科提前.*高校专项", "bktqp_gxzx"),
    (r"本科提前.*A段", "bktqp_a"),
    (r"本科提前.*B段", "bktqp_b"),
    (r"本科批.*高校专项", "bkp_gxzx"),
    (r"本科批.*A段", "bkp_a"),
    (r"本科批.*B段", "bkp_b"),
    (r"本科批.*区域", "bkp_qyjh"),
    (r"本科批.*少数民族预科", "bkp_sxyk"),
    (r"少数民族语言", "bkp_smzyy"),
    (r"加授.*民族语文", "bkp_jsmzyw"),
]

_COMPILED = [(re.compile(p), nid) for p, nid in _PATTERNS]


def normalize_batch(raw_batch: str, enrollment_type: str | None = None) -> str:
    """Normalize a raw batch name to a batch tree node ID.

    First tries exact match via BATCH_MAPPING (if enrollment_type provided).
    Then falls back to pattern matching.

    Returns the most specific node ID possible. May return a parent node
    (e.g. "bkp_b") when enrollment_type is needed to reach the leaf.
    """
    if not raw_batch:
        raise BatchNormalizeError("Empty batch name")

    raw = raw_batch.strip()

    # Try exact match first
    if enrollment_type:
        try:
            return resolve_batch_node_id(raw, enrollment_type.strip())
        except BatchMappingError:
            pass

    # Pattern fallback
    for pattern, node_id in _COMPILED:
        if pattern.search(raw):
            return node_id

    raise BatchNormalizeError(f"Cannot normalize: batch={raw!r}, type={enrollment_type!r}")
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/batch_normalizer.py scripts/data_integration/tests/test_three_layer/test_batch_normalizer.py
git commit -m "feat: add batch name normalizer for all source variants"
```

---

### Task 3: field_comparator.py — 字段级比较

**Files:**
- Create: `scripts/data_integration/three_layer/field_comparator.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_field_comparator.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_three_layer/test_field_comparator.py
# -*- coding: utf-8 -*-
import pytest
from three_layer.field_comparator import (
    compare_string, compare_numeric, compare_code,
    compare_fields, FieldDiff,
)


def test_string_exact_match():
    assert compare_string("计算机科学与技术", "计算机科学与技术") == 1.0


def test_string_similar():
    score = compare_string("计算机科学与技术", "计算机类")
    assert 0.3 < score < 0.8


def test_string_different():
    score = compare_string("计算机科学与技术", "法学")
    assert score < 0.3


def test_string_none_handling():
    assert compare_string(None, None) == 1.0
    assert compare_string("abc", None) == 0.0


def test_numeric_exact():
    assert compare_numeric(690, 690) == 1.0


def test_numeric_close():
    score = compare_numeric(690, 692)
    assert score > 0.8


def test_numeric_far():
    score = compare_numeric(690, 500)
    assert score < 0.3


def test_numeric_none():
    assert compare_numeric(None, None) == 1.0
    assert compare_numeric(690, None) == 0.0


def test_code_exact():
    assert compare_code("01", "01") == 1.0


def test_code_off_by_one():
    score = compare_code("05", "06")
    assert 0.5 < score < 1.0


def test_code_different():
    assert compare_code("01", "99") == 0.0


def test_compare_fields_returns_diff():
    result = compare_fields(
        {"name": "计算机", "min": 690, "code": "01"},
        {"name": "计算机科学", "min": 692, "code": "01"},
    )
    assert isinstance(result, FieldDiff)
    assert 0.0 <= result.score <= 1.0
    assert len(result.details) > 0
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement field_comparator.py**

```python
# three_layer/field_comparator.py
# -*- coding: utf-8 -*-
"""Field-level comparison for confidence matching.

Compares two records field-by-field, returning a weighted similarity score.
Used by the two-level matcher when exact match fails.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class FieldDiff:
    """Result of comparing two records."""
    score: float                          # 0.0 - 1.0 overall similarity
    details: dict[str, float] = field(default_factory=dict)  # per-field scores


# Field classification for auto-dispatch
_STRING_FIELDS = {
    "name", "fullName", "category", "discipline", "majorNote",
    "note", "subjectReq", "oldBatch",
}
_NUMERIC_FIELDS = {
    "duration", "tuition", "plan", "enrolled",
    "min", "minRank", "avg", "avgRank", "max", "maxRank",
}
_CODE_FIELDS = {"code", "groupCode"}

# Weights (higher = more important for matching identity)
_WEIGHTS = {
    "code": 15, "name": 25, "fullName": 10,
    "category": 8, "discipline": 5, "majorNote": 5,
    "duration": 5, "tuition": 5,
    "plan": 5, "enrolled": 3, "min": 5, "minRank": 4,
    "subjectReq": 5,
}
_DEFAULT_WEIGHT = 3


def compare_string(a: str | None, b: str | None) -> float:
    """Compare two strings using character-level similarity."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    a, b = str(a).strip(), str(b).strip()
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    # Simple ratio based on longest common subsequence length
    try:
        from rapidfuzz import fuzz
        return fuzz.ratio(a, b) / 100.0
    except ImportError:
        # Fallback: character overlap
        common = set(a) & set(b)
        return len(common) / max(len(set(a)), len(set(b)))


def compare_numeric(a: int | float | None, b: int | float | None) -> float:
    """Compare two numeric values by closeness."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    try:
        a, b = float(a), float(b)
    except (ValueError, TypeError):
        return 0.0
    if a == b:
        return 1.0
    diff = abs(a - b)
    max_val = max(abs(a), abs(b), 1)
    return max(0.0, 1.0 - diff / max_val)


def compare_code(a: str | None, b: str | None) -> float:
    """Compare code fields (exact or near-match)."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    a, b = str(a).strip(), str(b).strip()
    if a == b:
        return 1.0
    # Numeric codes: off-by-one or off-by-two
    try:
        diff = abs(int(a) - int(b))
        if diff <= 1:
            return 0.7
        if diff <= 2:
            return 0.4
    except ValueError:
        pass
    return 0.0


def compare_fields(record_a: dict, record_b: dict) -> FieldDiff:
    """Compare all shared fields between two records.

    Returns a weighted average similarity score and per-field details.
    """
    all_keys = set(record_a.keys()) | set(record_b.keys())
    # Exclude internal keys
    all_keys = {k for k in all_keys if not k.startswith("_")}

    details = {}
    total_weight = 0.0
    total_score = 0.0

    for key in all_keys:
        va = record_a.get(key)
        vb = record_b.get(key)
        weight = _WEIGHTS.get(key, _DEFAULT_WEIGHT)

        if key in _CODE_FIELDS:
            sim = compare_code(va, vb)
        elif key in _NUMERIC_FIELDS:
            sim = compare_numeric(va, vb)
        else:
            sim = compare_string(va, vb)

        details[key] = sim
        total_weight += weight
        total_score += sim * weight

    overall = total_score / total_weight if total_weight > 0 else 0.0
    return FieldDiff(score=round(overall, 4), details=details)
```

- [ ] **Step 4: Install rapidfuzz, run tests**

```bash
pip install rapidfuzz -q
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_field_comparator.py -v
```

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/field_comparator.py scripts/data_integration/tests/test_three_layer/test_field_comparator.py
git commit -m "feat: add field-level comparator with weighted scoring"
```

---

### Task 4: matcher.py — 两级匹配引擎

**Files:**
- Create: `scripts/data_integration/three_layer/matcher.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_matcher.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_three_layer/test_matcher.py
# -*- coding: utf-8 -*-
import pytest
from three_layer.matcher import TwoLevelMatcher, MatchResult


@pytest.fixture
def base_records():
    return [
        {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
         "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
         "name": "数学类", "duration": 4, "tuition": 5000},
        {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
         "enrollmentType": "普通类本科", "groupCode": "101", "code": "02",
         "name": "物理学类", "duration": 4, "tuition": 5000},
        {"_schoolCode": "0002", "_subject": "物理", "batchNodeId": "bkp_b_pt",
         "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
         "name": "法学", "duration": 4, "tuition": 4500},
    ]


@pytest.fixture
def matcher(base_records):
    m = TwoLevelMatcher()
    m.load_base(base_records)
    return m


def test_exact_match(matcher):
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
              "name": "数学类"}
    result = matcher.match(source)
    assert result.match_type == "exact"
    assert result.base_record["code"] == "01"


def test_confidence_match_code_typo(matcher):
    """Code off by 1 but name matches → confidence match."""
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "03",
              "name": "数学类", "duration": 4, "tuition": 5000}
    result = matcher.match(source)
    assert result.match_type == "confidence"
    assert result.confidence >= 0.7
    assert result.base_record["code"] == "01"


def test_no_match_new_record(matcher):
    """Completely different record → new."""
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "102", "code": "99",
              "name": "人工智能", "duration": 4, "tuition": 8000}
    result = matcher.match(source)
    assert result.match_type == "new"
    assert result.confidence < 0.3


def test_ambiguous_match(matcher):
    """Middle confidence → needs review."""
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
              "name": "应用数学", "duration": 4, "tuition": 6000}
    result = matcher.match(source)
    assert result.match_type in ("confidence", "review")


def test_different_school_no_cross_match(matcher):
    """Records from different schools should not cross-match."""
    source = {"_schoolCode": "9999", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
              "name": "数学类"}
    result = matcher.match(source)
    assert result.match_type == "new"
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement matcher.py**

```python
# three_layer/matcher.py
# -*- coding: utf-8 -*-
"""Two-level matching engine for data integration.

Level 1: Exact match on 6 fields (schoolCode + subject + batchNodeId +
         enrollmentType + groupCode + majorCode)
Level 2: Confidence match using full-field comparison within the
         (schoolCode + subject + batchNodeId) candidate set.

Thresholds:
  >= 0.70  →  "confidence" match (auto-merge, flagged)
  0.30-0.70 → "review" (human review needed)
  < 0.30  →  "new" record
"""
from __future__ import annotations
from dataclasses import dataclass, field
from collections import defaultdict

from three_layer.field_comparator import compare_fields


@dataclass
class MatchResult:
    match_type: str           # "exact" | "confidence" | "review" | "new"
    confidence: float         # 0.0 - 1.0
    base_record: dict | None  # the matched base record (or None if new)
    source_record: dict       # the incoming record
    field_diffs: dict = field(default_factory=dict)  # per-field similarity

    THRESHOLD_HIGH = 0.70
    THRESHOLD_LOW = 0.30


class TwoLevelMatcher:
    """Two-level matching engine."""

    def __init__(self):
        self._exact_index: dict[tuple, dict] = {}
        self._candidate_index: dict[tuple, list[dict]] = defaultdict(list)

    def load_base(self, records: list[dict]) -> None:
        """Index base records for matching."""
        self._exact_index.clear()
        self._candidate_index.clear()
        for rec in records:
            exact_key = self._exact_key(rec)
            self._exact_index[exact_key] = rec
            cand_key = self._candidate_key(rec)
            self._candidate_index[cand_key].append(rec)

    def match(self, source: dict) -> MatchResult:
        """Match a source record against the base."""
        # Level 1: exact match
        exact_key = self._exact_key(source)
        if exact_key in self._exact_index:
            return MatchResult(
                match_type="exact",
                confidence=1.0,
                base_record=self._exact_index[exact_key],
                source_record=source,
            )

        # Level 2: confidence match within candidate set
        cand_key = self._candidate_key(source)
        candidates = self._candidate_index.get(cand_key, [])

        if not candidates:
            return MatchResult(
                match_type="new",
                confidence=0.0,
                base_record=None,
                source_record=source,
            )

        best_score = 0.0
        best_record = None
        best_diffs = {}

        for cand in candidates:
            diff = compare_fields(source, cand)
            if diff.score > best_score:
                best_score = diff.score
                best_record = cand
                best_diffs = diff.details

        if best_score >= MatchResult.THRESHOLD_HIGH:
            match_type = "confidence"
        elif best_score >= MatchResult.THRESHOLD_LOW:
            match_type = "review"
        else:
            match_type = "new"
            best_record = None

        return MatchResult(
            match_type=match_type,
            confidence=round(best_score, 4),
            base_record=best_record if match_type != "new" else None,
            source_record=source,
            field_diffs=best_diffs,
        )

    @staticmethod
    def _exact_key(rec: dict) -> tuple:
        return (
            rec.get("_schoolCode", ""),
            rec.get("_subject", ""),
            rec.get("batchNodeId", ""),
            rec.get("enrollmentType", ""),
            rec.get("groupCode", ""),
            rec.get("code", ""),
        )

    @staticmethod
    def _candidate_key(rec: dict) -> tuple:
        return (
            rec.get("_schoolCode", ""),
            rec.get("_subject", ""),
            rec.get("batchNodeId", ""),
        )
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/matcher.py scripts/data_integration/tests/test_three_layer/test_matcher.py
git commit -m "feat: add two-level matching engine (exact + confidence)"
```

---

### Task 5: conflict_reporter.py — 冲突报告

**Files:**
- Create: `scripts/data_integration/three_layer/conflict_reporter.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_conflict_reporter.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_three_layer/test_conflict_reporter.py
# -*- coding: utf-8 -*-
import csv
from pathlib import Path
import pytest
from three_layer.conflict_reporter import ConflictReporter, ConflictRecord


@pytest.fixture
def reporter(tmp_path):
    return ConflictReporter(output_dir=tmp_path)


def test_add_value_conflict(reporter):
    reporter.add_conflict(ConflictRecord(
        school_code="0001", school_name="北京大学",
        subject="物理", batch="本科批B段",
        major_code="01", major_name="数学类",
        field_name="min", current_value="690", new_value="692",
        source="H", match_type="exact", confidence=1.0,
        diff_type="numeric_small",
    ))
    assert reporter.count == 1


def test_write_csv(reporter, tmp_path):
    reporter.add_conflict(ConflictRecord(
        school_code="0001", school_name="北京大学",
        subject="物理", batch="本科批B段",
        major_code="01", major_name="数学类",
        field_name="min", current_value="690", new_value="692",
        source="H", match_type="exact", confidence=1.0,
        diff_type="numeric_small",
    ))
    path = reporter.write()
    assert path.exists()
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert len(rows) == 1
    assert rows[0]["school_code"] == "0001"
    assert rows[0]["field_name"] == "min"


def test_summary_stats(reporter):
    for i in range(5):
        reporter.add_conflict(ConflictRecord(
            school_code=f"000{i}", school_name="Test",
            subject="物理", batch="test", major_code="01", major_name="Test",
            field_name="min", current_value="1", new_value="2",
            source="A", match_type="exact", confidence=1.0,
            diff_type="numeric_small",
        ))
    stats = reporter.summary()
    assert stats["total"] == 5
    assert "numeric_small" in stats["by_diff_type"]
```

- [ ] **Step 2: Run tests — expect FAIL**

- [ ] **Step 3: Implement conflict_reporter.py**

```python
# three_layer/conflict_reporter.py
# -*- coding: utf-8 -*-
"""Conflict report generator for human review.

Outputs a CSV file sorted by severity, with one row per field conflict.
"""
from __future__ import annotations
import csv
from collections import Counter
from dataclasses import dataclass, asdict
from pathlib import Path


@dataclass
class ConflictRecord:
    school_code: str
    school_name: str
    subject: str
    batch: str
    major_code: str
    major_name: str
    field_name: str
    current_value: str
    new_value: str
    source: str
    match_type: str        # "exact" | "confidence" | "review"
    confidence: float
    diff_type: str         # "numeric_small" | "numeric_large" | "text_minor" | "text_major" | "one_side_missing"


_SEVERITY_ORDER = {
    "text_major": 0,
    "numeric_large": 1,
    "one_side_missing": 2,
    "text_minor": 3,
    "numeric_small": 4,
}

_CSV_COLUMNS = [
    "school_code", "school_name", "subject", "batch",
    "major_code", "major_name", "field_name",
    "current_value", "new_value", "source",
    "match_type", "confidence", "diff_type",
]


class ConflictReporter:
    def __init__(self, output_dir: Path | None = None):
        self._records: list[ConflictRecord] = []
        self._output_dir = output_dir or Path("three_layer_output")

    @property
    def count(self) -> int:
        return len(self._records)

    def add_conflict(self, record: ConflictRecord) -> None:
        self._records.append(record)

    def write(self, filename: str = "conflict_report.csv") -> Path:
        """Write conflict report CSV sorted by severity."""
        self._output_dir.mkdir(parents=True, exist_ok=True)
        path = self._output_dir / filename

        sorted_records = sorted(
            self._records,
            key=lambda r: _SEVERITY_ORDER.get(r.diff_type, 99),
        )

        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=_CSV_COLUMNS)
            writer.writeheader()
            for rec in sorted_records:
                writer.writerow({k: getattr(rec, k) for k in _CSV_COLUMNS})

        return path

    def summary(self) -> dict:
        """Return summary statistics."""
        by_type = Counter(r.diff_type for r in self._records)
        by_source = Counter(r.source for r in self._records)
        by_match = Counter(r.match_type for r in self._records)
        return {
            "total": len(self._records),
            "by_diff_type": dict(by_type),
            "by_source": dict(by_source),
            "by_match_type": dict(by_match),
        }
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/conflict_reporter.py scripts/data_integration/tests/test_three_layer/test_conflict_reporter.py
git commit -m "feat: add conflict reporter with CSV output and severity sorting"
```
