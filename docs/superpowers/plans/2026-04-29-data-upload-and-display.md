# Data Upload and Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Import xlsx master data into production MySQL via xlsx→JSON→Prisma pipeline, with upsert support for incremental updates.

**Architecture:** Python script converts xlsx wide tables to normalized JSON; TypeScript import script loads JSON into MySQL via Prisma with replace/upsert modes. Prisma schema updated to enforce 7-field natural key.

**Tech Stack:** Python (openpyxl), TypeScript (Prisma 7.4), MySQL 8.0

**Spec:** `docs/superpowers/specs/2026-04-29-data-upload-and-display-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `apps/server/prisma/schema.prisma:312-368` | Add recruitType/majorCode/majorName to EnrollmentPlan, change unique |
| Modify | `apps/server/prisma/schema.prisma:372-428` | Same for AdmissionRecord |
| Create | `apps/server/prisma/migrations/2026XXXX_natural_key/migration.sql` | Auto-generated via prisma migrate |
| Create | `scripts/data-processing/xlsx_to_json.py` | xlsx→JSON converter (all outputs) |
| Create | `scripts/data-processing/test_xlsx_to_json.py` | Unit tests for converter |
| Modify | `scripts/data-processing/import_to_db.ts:210-345` | Add new fields + --mode=upsert |

---

### Task 1: Prisma Schema — EnrollmentPlan natural key

**Files:**
- Modify: `apps/server/prisma/schema.prisma:312-368`

- [ ] **Step 1: Add new fields to EnrollmentPlan model**

In `schema.prisma`, add after the `isSinoForeign` field (around line 338):

```prisma
  // 自然主键字段（冗余存储用于唯一约束和展示）
  recruitType String  @default("") @map("recruit_type") @db.VarChar(100)
  majorCode   String  @default("") @map("major_code") @db.VarChar(50)
  majorName   String  @default("") @map("major_name") @db.VarChar(200)
```

- [ ] **Step 2: Replace unique constraint**

Replace:
```prisma
  @@unique([universityId, majorId, year, province, batch])
```

With:
```prisma
  @@unique([universityId, subjects, batch, recruitType, groupCode, majorCode, majorName, year])
```

Note: `subjects` and `groupCode` already exist as fields, just not in the unique constraint. Both need `@default("")` if they don't already have it — check and add if missing. `subjects` is currently `String?`, needs to become `String @default("")` for the unique constraint. Same for `groupCode`.

- [ ] **Step 3: Verify schema syntax**

Run:
```bash
cd apps/server && npx prisma validate
```
Expected: "The schema is valid."

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/schema.prisma
git commit -m "feat: add natural key fields to EnrollmentPlan model"
```

---

### Task 2: Prisma Schema — AdmissionRecord natural key

**Files:**
- Modify: `apps/server/prisma/schema.prisma:372-428`

- [ ] **Step 1: Add new fields to AdmissionRecord model**

Add after `filingMinRank` (around line 404):

```prisma
  // 自然主键字段
  recruitType String  @default("") @map("recruit_type") @db.VarChar(100)
  groupCode   String  @default("") @map("group_code") @db.VarChar(50)
  majorCode   String  @default("") @map("major_code") @db.VarChar(50)
  majorName   String  @default("") @map("major_name") @db.VarChar(200)
```

Note: `groupCode` is new for AdmissionRecord (EnrollmentPlan already has it). `subjects` already exists but check if it's nullable — if `String?`, change to `String @default("")`.

- [ ] **Step 2: Replace unique constraint**

Replace:
```prisma
  @@unique([universityId, majorId, year, province, batch])
```

With:
```prisma
  @@unique([universityId, subjects, batch, recruitType, groupCode, majorCode, majorName, year])
```

- [ ] **Step 3: Validate and generate migration**

```bash
cd apps/server && npx prisma validate && npx prisma migrate dev --name natural_key_alignment
```

Expected: Migration created successfully, tables altered with new columns and unique index.

- [ ] **Step 4: Commit**

```bash
git add apps/server/prisma/
git commit -m "feat: align EnrollmentPlan and AdmissionRecord to 7-field natural key"
```

---

### Task 3: Python converter — universities

**Files:**
- Create: `scripts/data-processing/xlsx_to_json.py`
- Create: `scripts/data-processing/test_xlsx_to_json.py`

- [ ] **Step 1: Write test for university conversion**

Create `scripts/data-processing/test_xlsx_to_json.py`:

```python
"""Tests for xlsx → JSON converter."""
import pytest
import json
import os

# We'll test the conversion functions directly
# The test data uses real xlsx structure


def test_convert_university_row():
    """A single row from 院校信息表 produces correct JSON."""
    from xlsx_to_json import convert_university_row

    # Simulated row values matching xlsx column order (indices 0-89)
    row = [None] * 90
    row[0] = '0001'          # 院校代码
    row[1] = '北京大学'       # 院校名称
    row[2] = '北京'          # 院校省份
    row[3] = '海淀区'        # 院校城市
    row[4] = '一线城市'      # 城市等级
    row[5] = '综合'          # 院校类型
    row[6] = '公办'          # 办学性质
    row[7] = '教育部'        # 隶属部门
    row[8] = '985/211/双一流/国重点/保研资格'  # 院校档次
    row[12] = '是'           # 是否双一流
    row[14] = 2              # 院校排名
    row[15] = 78             # 硕士点数量
    row[16] = 68             # 博士点数量
    row[21] = '58.6%'        # 保研率
    row[42] = 64             # 男生比例
    row[43] = 36             # 女生比例
    row[44] = 1              # QS排名
    row[60] = 2              # 软科排名
    row[69] = 4.6            # 综合满意度

    result = convert_university_row(row)

    assert result['enrollCode'] == '0001'
    assert result['name'] == '北京大学'
    assert result['province'] == '北京'
    assert result['city'] == '海淀区'
    assert result['runningNature'] == '公办'
    assert result['isDoubleFirstClass'] is True
    assert result['is985'] is True
    assert result['is211'] is True
    assert result['softRanking'] == 2
    assert result['rankingQS'] == 1
    assert result['satisfactionOverall'] == 4.6
    assert result['maleRatio'] == 64


def test_convert_university_tags():
    """Tags extracted correctly from 院校档次."""
    from xlsx_to_json import convert_university_row

    row = [None] * 90
    row[0] = '0001'
    row[1] = '北京大学'
    row[8] = '985/211/双一流/国重点/保研资格'

    result = convert_university_row(row)
    assert '985' in result['tags']
    assert '211' in result['tags']
    assert '双一流' in result['tags']
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py::test_convert_university_row -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'xlsx_to_json'`

- [ ] **Step 3: Implement university converter**

Create `scripts/data-processing/xlsx_to_json.py`:

```python
"""
xlsx → JSON 转换器

读取 data/03_专家版主表/output/ 下的 xlsx 文件，
输出到 scripts/data-processing/output/ 下的 JSON 文件。

Usage:
    python scripts/data-processing/xlsx_to_json.py
    python scripts/data-processing/xlsx_to_json.py --xlsx-dir=path/to/xlsx --out-dir=path/to/output
"""
import json
import os
import sys
import argparse
from pathlib import Path

try:
    import openpyxl
except ImportError:
    print("需要 openpyxl: pip install openpyxl")
    sys.exit(1)


# ── Helpers ──────────────────────────────────────────────────────────

def to_int(val):
    if val is None:
        return None
    try:
        return int(float(str(val)))
    except (ValueError, TypeError):
        return None


def to_float(val):
    if val is None:
        return None
    try:
        return float(str(val))
    except (ValueError, TypeError):
        return None


def to_str(val):
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def parse_bool(val):
    """'是' / True → True, else False."""
    if val is None:
        return False
    if isinstance(val, bool):
        return val
    return str(val).strip() in ('是', 'True', 'true', '1')


def parse_tags(grade_str):
    """'985/211/双一流/国重点/保研资格' → ['985','211','双一流','国重点','保研资格']"""
    if not grade_str:
        return []
    return [t.strip() for t in str(grade_str).split('/') if t.strip()]


def read_xlsx_rows(filepath, sheet_index=0, header_row=1):
    """Read xlsx, return (headers, data_rows) where each row is a list of values."""
    wb = openpyxl.load_workbook(filepath, read_only=True, data_only=True)
    ws = wb.worksheets[sheet_index]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()
    headers = list(rows[header_row - 1]) if rows else []
    data = [list(r) for r in rows[header_row:]]
    return headers, data


# ── University Converter ─────────────────────────────────────────────

def convert_university_row(row):
    """Convert a single row (list of values, index 0-89) to university JSON dict."""
    tags = parse_tags(row[8])  # 院校档次

    return {
        'enrollCode': to_str(row[0]),
        'name': to_str(row[1]),
        'province': to_str(row[2]),
        'city': to_str(row[3]),
        'type': to_str(row[5]),
        'level': to_str(row[11]),
        'runningNature': to_str(row[6]),
        'isDoubleFirstClass': parse_bool(row[12]),
        'is985': '985' in tags,
        'is211': '211' in tags,
        'tags': tags,
        'grade': to_str(row[4]),
        'department': to_str(row[7]),
        'ranking': to_int(row[14]),
        'admissionGuide': to_str(row[23]),
        'renameHistory': to_str(row[24]),
        'transferDifficulty': to_str(row[22]),
        'postgradRate': to_str(row[21]),
        'disciplineEvaluationLevel': to_str(row[25]),
        'softRating': None,  # 院校信息表无此列，从主表取
        'softRanking': to_int(row[60]),
        'hasMasterProgram': (to_int(row[15]) or 0) > 0,
        'hasDoctoralProgram': (to_int(row[16]) or 0) > 0,
        'masterProgramCount': to_int(row[15]),
        'doctoralProgramCount': to_int(row[16]),
        'masterPrograms': to_str(row[17]),
        'doctoralPrograms': to_str(row[18]),
        'maleRatio': to_int(row[42]),
        'femaleRatio': to_int(row[43]),
        'createdYear': to_str(row[41]),
        'logoUrl': to_str(row[53]),
        'aClassDisciplineCount': to_int(row[64]),
        'rankingAlumni': to_int(row[46]),
        'rankingQS': to_int(row[44]),
        'rankingUSNews': to_int(row[45]),
        'satisfactionOverall': to_float(row[69]),
        'satisfactionLife': to_float(row[76]),
        'satisfactionEnviron': to_float(row[83]),
        'satisfactionCount': to_int(row[70]),
        'employmentRate': to_str(row[40]),
        'furtherStudyRate': None,
        'avgSalary': None,
        'topEmployers': None,
        # 额外字段（Prisma schema 已有但之前 JSON 缺失的）
        'charterInfo': {
            'filingRatio': to_str(row[26]),
            'majorAllocationRule': to_str(row[27]),
            'tiebreakRule': to_str(row[28]),
            'healthRestriction': to_str(row[29]),
            'adjustmentPolicy': to_str(row[30]),
            'foreignLanguageReq': to_str(row[31]),
            'subjectReq': to_str(row[32]),
            'bonusPolicy': to_str(row[33]),
        },
        'notes': to_str(row[9]),  # 院校背景
    }


def convert_universities(xlsx_path, out_dir):
    """Convert 院校信息表.xlsx → universities_enriched.json"""
    print(f'Converting universities from {xlsx_path}...')
    _, rows = read_xlsx_rows(xlsx_path)
    results = []
    for row in rows:
        if not row[0] and not row[1]:
            continue  # skip empty rows
        uni = convert_university_row(row)
        if uni['enrollCode'] and uni['name']:
            results.append(uni)
    out_path = os.path.join(out_dir, 'universities_enriched.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'  → {len(results)} universities → {out_path}')
    return results
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py::test_convert_university_row test_xlsx_to_json.py::test_convert_university_tags -v
```
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/data-processing/xlsx_to_json.py scripts/data-processing/test_xlsx_to_json.py
git commit -m "feat: xlsx→JSON converter — university conversion"
```

---

### Task 4: Python converter — majors deduplication

**Files:**
- Modify: `scripts/data-processing/xlsx_to_json.py`
- Modify: `scripts/data-processing/test_xlsx_to_json.py`

- [ ] **Step 1: Write test for major deduplication**

Append to `test_xlsx_to_json.py`:

```python
def test_convert_majors_dedup():
    """Majors deduped by name, metadata fields extracted."""
    from xlsx_to_json import convert_majors_from_main_table

    # Two rows with same 专业 name but different universities
    header_row = [None] * 71
    row1 = [None] * 71
    row1[12] = '环境科学'     # 专业
    row1[14] = '环境科学与工程类'  # 专业类
    row1[15] = '工学'         # 门类
    row1[62] = 'A+'           # 软科评级
    row1[63] = 1              # 软科排名
    row1[64] = '四轮：A；五轮：A+'  # 学科评估
    row1[69] = '环境科学与工程'     # 本专业硕士点
    row1[70] = '环境科学与工程'     # 本专业博士点

    row2 = [None] * 71
    row2[12] = '环境科学'     # same major
    row2[14] = '环境科学与工程类'
    row2[15] = '工学'
    row2[62] = 'A'
    row2[63] = 5

    row3 = [None] * 71
    row3[12] = '计算机科学与技术'  # different major
    row3[14] = '计算机类'
    row3[15] = '工学'
    row3[62] = 'A+'

    result = convert_majors_from_main_table([row1, row2, row3])

    assert len(result) == 2  # deduped
    names = {m['name'] for m in result}
    assert '环境科学' in names
    assert '计算机科学与技术' in names

    # First occurrence wins for soft rating
    env = next(m for m in result if m['name'] == '环境科学')
    assert env['category'] == '工学'
    assert env['discipline'] == '环境科学与工程类'
```

- [ ] **Step 2: Run test — should fail**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py::test_convert_majors_dedup -v
```
Expected: FAIL — `cannot import name 'convert_majors_from_main_table'`

- [ ] **Step 3: Implement major converter**

Append to `xlsx_to_json.py`:

```python
# ── Major Converter ──────────────────────────────────────────────────

def convert_majors_from_main_table(data_rows):
    """Deduplicate majors from 专业招生主表 rows.

    Takes first occurrence of each unique 专业 name,
    extracts metadata columns (专业类, 门类, 软科评级, etc.)
    """
    seen = {}
    for row in data_rows:
        name = to_str(row[12])  # 专业
        if not name or name in seen:
            continue
        seen[name] = {
            'name': name,
            'code': to_str(row[4]),        # 专业代码
            'category': to_str(row[15]),    # 门类
            'level': '本科',
            'discipline': to_str(row[14]),  # 专业类
            'type': None,
            'notes': to_str(row[16]),       # 专业备注
            'majorLevel': to_str(row[65]),  # 专业水平
            'softRating': to_str(row[62]),  # 软科评级
        }
    return list(seen.values())


def convert_majors(main_xlsx_path, out_dir):
    """Convert 专业招生主表 → majors_enriched.json (deduped by 专业 name)."""
    print(f'Converting majors from {main_xlsx_path}...')
    _, rows = read_xlsx_rows(main_xlsx_path)
    results = convert_majors_from_main_table(rows)
    out_path = os.path.join(out_dir, 'majors_enriched.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'  → {len(results)} majors → {out_path}')
    return results
```

- [ ] **Step 4: Run test — should pass**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py::test_convert_majors_dedup -v
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/data-processing/xlsx_to_json.py scripts/data-processing/test_xlsx_to_json.py
git commit -m "feat: xlsx→JSON converter — major deduplication from main table"
```

---

### Task 5: Python converter — enrollment plans (wide → long)

**Files:**
- Modify: `scripts/data-processing/xlsx_to_json.py`
- Modify: `scripts/data-processing/test_xlsx_to_json.py`

- [ ] **Step 1: Write test for plan splitting**

Append to `test_xlsx_to_json.py`:

```python
def test_convert_enrollment_plans_splits_years():
    """One xlsx row with 25/24/23 plan data produces 3 enrollment plan records."""
    from xlsx_to_json import convert_enrollment_plans_from_row

    row = [None] * 71
    row[0] = 2025            # 数据年份
    row[1] = 1               # 院校代码
    row[2] = '北京大学'       # 院校名称
    row[3] = '101'           # 专业组代码
    row[4] = '41'            # 专业代码
    row[5] = '本科批(高校专项)'  # 录取批次
    row[6] = '物理'          # 科目
    row[9] = '高校专项计划'   # 招生类型
    row[10] = 7              # 投档顺序
    row[11] = '2个志愿'       # 志愿设置
    row[12] = '环境科学'      # 专业
    row[13] = '环境科学(高校专项)'  # 专业全称
    row[14] = '环境科学与工程类'    # 专业类
    row[15] = '工学'          # 门类
    row[17] = '院校备注：...'  # 院校备注
    row[19] = '化学'          # 选科要求
    row[20] = 2              # 25专业组计划
    row[21] = 1              # 计划人数
    row[22] = 4              # 学制
    row[23] = 5000           # 学费
    row[39] = 2              # 24计划人数
    row[47] = 1              # 23计划人数

    plans = convert_enrollment_plans_from_row(row)

    assert len(plans) == 3
    years = {p['year'] for p in plans}
    assert years == {2025, 2024, 2023}

    p25 = next(p for p in plans if p['year'] == 2025)
    assert p25['universityEnrollCode'] == '1'
    assert p25['majorName'] == '环境科学'
    assert p25['majorCode'] == '41'
    assert p25['groupCode'] == '101'
    assert p25['subjects'] == '物理'
    assert p25['batch'] == '本科批(高校专项)'
    assert p25['recruitType'] == '高校专项计划'
    assert p25['planCount'] == 1
    assert p25['groupPlanCount'] == 2
    assert p25['tuition'] == 5000

    p24 = next(p for p in plans if p['year'] == 2024)
    assert p24['planCount'] == 2
    assert p24['groupCode'] == '101'  # shared fields preserved

    p23 = next(p for p in plans if p['year'] == 2023)
    assert p23['planCount'] == 1


def test_convert_enrollment_plans_skips_empty_year():
    """Year with no plan data is not emitted."""
    from xlsx_to_json import convert_enrollment_plans_from_row

    row = [None] * 71
    row[1] = 1
    row[3] = '101'
    row[4] = '41'
    row[5] = '本科批'
    row[6] = '物理'
    row[9] = '普通类'
    row[12] = '环境科学'
    row[21] = 3              # 25 plan count
    # 24, 23 plan counts are None

    plans = convert_enrollment_plans_from_row(row)

    assert len(plans) == 1
    assert plans[0]['year'] == 2025
```

- [ ] **Step 2: Run test — should fail**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py::test_convert_enrollment_plans_splits_years test_xlsx_to_json.py::test_convert_enrollment_plans_skips_empty_year -v
```
Expected: FAIL

- [ ] **Step 3: Implement enrollment plan converter**

Append to `xlsx_to_json.py`:

```python
# ── Enrollment Plan Converter ────────────────────────────────────────

def convert_enrollment_plans_from_row(row):
    """Convert one xlsx row → list of enrollment plan dicts (one per year with data).

    Shared columns (indices in 专业招生主表):
      [1] 院校代码, [3] 专业组代码, [4] 专业代码, [5] 录取批次,
      [6] 科目, [9] 招生类型, [12] 专业

    Year-specific plan columns:
      2025: [20] 专业组计划, [21] 计划人数, [22] 学制, [23] 学费
      2024: [39] 计划人数
      2023: [47] 计划人数
    """
    # Shared fields for all years
    shared = {
        'universityEnrollCode': to_str(row[1]),
        'majorName': to_str(row[12]),
        'majorCode': to_str(row[4]),
        'groupCode': to_str(row[3]),
        'province': '四川',
        'batch': to_str(row[5]) or '',
        'subjects': to_str(row[6]) or '',
        'recruitType': to_str(row[9]) or '',
        'subjectRequirements': to_str(row[19]),
        'level': '本科',
        'planNotes': to_str(row[17]),
        'isNew': parse_bool(row[18]),
        'oldBatch': to_str(row[7]),
        # 专业评价（所有年份共享）
        'disciplineEval': to_str(row[64]),
        'isNationalFeature': parse_bool(row[66]),
        'majorRanking': to_str(row[67]),
        'majorHonor': to_str(row[68]),
        'localMasterPoint': to_str(row[69]),
        'localDoctoralPoint': to_str(row[70]),
        'softRating': to_str(row[62]),
    }

    # Year-specific data
    year_configs = [
        {
            'year': 2025,
            'planCount': to_int(row[21]),
            'groupPlanCount': to_int(row[20]),
            'duration': to_str(row[22]),
            'tuition': to_int(row[23]),
            'filingOrder': to_int(row[10]),
            'volunteerSetting': to_str(row[11]),
            'groupName': to_str(row[13]),
        },
        {
            'year': 2024,
            'planCount': to_int(row[39]),
        },
        {
            'year': 2023,
            'planCount': to_int(row[47]),
        },
    ]

    results = []
    for yc in year_configs:
        # Skip year if no plan data
        if yc.get('planCount') is None:
            continue
        record = {**shared, **yc}
        results.append(record)

    return results


def convert_enrollment_plans(main_xlsx_path, out_dir):
    """Convert 专业招生主表 → enrollment_plans_enriched.json (wide→long split)."""
    print(f'Converting enrollment plans from {main_xlsx_path}...')
    _, rows = read_xlsx_rows(main_xlsx_path)
    results = []
    for row in rows:
        if not row[1] and not row[12]:
            continue
        results.extend(convert_enrollment_plans_from_row(row))
    out_path = os.path.join(out_dir, 'enrollment_plans_enriched.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'  → {len(results)} enrollment plans → {out_path}')
    return results
```

- [ ] **Step 4: Run tests — should pass**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py -k "enrollment" -v
```
Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/data-processing/xlsx_to_json.py scripts/data-processing/test_xlsx_to_json.py
git commit -m "feat: xlsx→JSON converter — enrollment plan wide-to-long split"
```

---

### Task 6: Python converter — admission records (wide → long)

**Files:**
- Modify: `scripts/data-processing/xlsx_to_json.py`
- Modify: `scripts/data-processing/test_xlsx_to_json.py`

- [ ] **Step 1: Write test for admission record splitting**

Append to `test_xlsx_to_json.py`:

```python
def test_convert_admission_records_splits_4_years():
    """One row with all 4 years of score data → 4 admission records."""
    from xlsx_to_json import convert_admission_records_from_row

    row = [None] * 71
    row[1] = 1               # 院校代码
    row[3] = '101'           # 专业组代码
    row[4] = '41'            # 专业代码
    row[5] = '本科批'         # 录取批次
    row[6] = '物理'          # 科目
    row[9] = '普通类'         # 招生类型
    row[12] = '环境科学'      # 专业
    # 2025
    row[24] = 680            # 25投档最低分
    row[25] = 120            # 25投档最低位次
    row[26] = 25             # 25专业组录取人数
    row[27] = 670            # 25专业组最低分
    row[28] = 150            # 25专业组最低位次
    row[29] = 3              # 25录取人数
    row[30] = 675            # 25最低分
    row[31] = 130            # 25最低位次
    row[32] = 678            # 25平均分
    row[33] = 125            # 25平均位次
    row[34] = 690            # 25最高分
    row[35] = 80             # 25最高位次
    # 2024
    row[36] = 665            # 24专业组最低分
    row[37] = 180            # 24专业组最低分位次
    row[38] = 20             # 24专业组录取人数
    row[40] = 2              # 24录取人数
    row[41] = 660            # 24最低分
    row[42] = 200            # 24最低分位次
    row[43] = 665            # 24平均分
    row[44] = 180            # 24平均位
    row[45] = 670            # 24最高分
    row[46] = 160            # 24最高位
    # 2023
    row[48] = 2              # 23录取人数
    row[49] = 650            # 23最低分
    row[50] = 250            # 23最低分位次
    row[51] = 655            # 23平均分
    row[52] = 220            # 23平均位
    row[53] = 660            # 23最高分
    row[54] = 200            # 23最高位
    # 2022
    row[55] = 1              # 22录取人数
    row[56] = 640            # 22最低分
    row[57] = 300            # 22最低分位次
    row[58] = 645            # 22平均分
    row[59] = 280            # 22平均分位次
    row[60] = 650            # 22最高分
    row[61] = 250            # 22最高分位次

    records = convert_admission_records_from_row(row)

    assert len(records) == 4
    years = {r['year'] for r in records}
    assert years == {2025, 2024, 2023, 2022}

    r25 = next(r for r in records if r['year'] == 2025)
    assert r25['majorMinScore'] == 675
    assert r25['majorMinRank'] == 130
    assert r25['majorAdmissionCount'] == 3
    assert r25['filingMinScore'] == 680
    assert r25['filingMinRank'] == 120
    assert r25['groupMinScore'] == 670
    assert r25['groupMinRank'] == 150
    assert r25['groupAdmissionCount'] == 25
    assert r25['groupCode'] == '101'
    assert r25['recruitType'] == '普通类'

    r22 = next(r for r in records if r['year'] == 2022)
    assert r22['majorMinScore'] == 640
    assert r22['majorAdmissionCount'] == 1


def test_convert_admission_records_skips_empty_year():
    """Year with all null score fields is not emitted."""
    from xlsx_to_json import convert_admission_records_from_row

    row = [None] * 71
    row[1] = 1
    row[3] = '101'
    row[4] = '41'
    row[5] = '本科批'
    row[6] = '物理'
    row[9] = '普通类'
    row[12] = '环境科学'
    row[30] = 675  # only 2025 has data
    row[31] = 130

    records = convert_admission_records_from_row(row)

    assert len(records) == 1
    assert records[0]['year'] == 2025
```

- [ ] **Step 2: Run test — should fail**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py -k "admission" -v
```
Expected: FAIL

- [ ] **Step 3: Implement admission record converter**

Append to `xlsx_to_json.py`:

```python
# ── Admission Record Converter ───────────────────────────────────────

def convert_admission_records_from_row(row):
    """Convert one xlsx row → list of admission record dicts (one per year with data).

    Year-specific score columns:
      2025: [24-35] 投档/专业组/专业 各分数位次
      2024: [36-46] 专业组/专业 各分数位次
      2023: [48-54] 专业 各分数位次
      2022: [55-61] 专业 各分数位次
    """
    shared = {
        'universityEnrollCode': to_str(row[1]),
        'majorName': to_str(row[12]),
        'majorCode': to_str(row[4]),
        'groupCode': to_str(row[3]),
        'province': '四川',
        'batch': to_str(row[5]) or '',
        'subjects': to_str(row[6]) or '',
        'recruitType': to_str(row[9]) or '',
    }

    year_configs = [
        {
            'year': 2025,
            'fields': {
                'filingMinScore': to_int(row[24]),
                'filingMinRank': to_int(row[25]),
                'groupAdmissionCount': to_int(row[26]),
                'groupMinScore': to_int(row[27]),
                'groupMinRank': to_int(row[28]),
                'majorAdmissionCount': to_int(row[29]),
                'majorMinScore': to_int(row[30]),
                'majorMinRank': to_int(row[31]),
                'majorAvgScore': to_int(row[32]),
                'majorAvgRank': to_int(row[33]),
                'majorMaxScore': to_int(row[34]),
                'majorMaxRank': to_int(row[35]),
            },
        },
        {
            'year': 2024,
            'fields': {
                'groupMinScore': to_int(row[36]),
                'groupMinRank': to_int(row[37]),
                'groupAdmissionCount': to_int(row[38]),
                'majorAdmissionCount': to_int(row[40]),
                'majorMinScore': to_int(row[41]),
                'majorMinRank': to_int(row[42]),
                'majorAvgScore': to_int(row[43]),
                'majorAvgRank': to_int(row[44]),
                'majorMaxScore': to_int(row[45]),
                'majorMaxRank': to_int(row[46]),
            },
        },
        {
            'year': 2023,
            'fields': {
                'majorAdmissionCount': to_int(row[48]),
                'majorMinScore': to_int(row[49]),
                'majorMinRank': to_int(row[50]),
                'majorAvgScore': to_int(row[51]),
                'majorAvgRank': to_int(row[52]),
                'majorMaxScore': to_int(row[53]),
                'majorMaxRank': to_int(row[54]),
            },
        },
        {
            'year': 2022,
            'fields': {
                'majorAdmissionCount': to_int(row[55]),
                'majorMinScore': to_int(row[56]),
                'majorMinRank': to_int(row[57]),
                'majorAvgScore': to_int(row[58]),
                'majorAvgRank': to_int(row[59]),
                'majorMaxScore': to_int(row[60]),
                'majorMaxRank': to_int(row[61]),
            },
        },
    ]

    results = []
    for yc in year_configs:
        fields = yc['fields']
        # Skip if ALL score/count fields are null
        if all(v is None for v in fields.values()):
            continue
        record = {**shared, 'year': yc['year'], **fields}
        results.append(record)

    return results


def convert_admission_records(main_xlsx_path, out_dir):
    """Convert 专业招生主表 → admission_records_filled.json (wide→long split)."""
    print(f'Converting admission records from {main_xlsx_path}...')
    _, rows = read_xlsx_rows(main_xlsx_path)
    results = []
    for row in rows:
        if not row[1] and not row[12]:
            continue
        results.extend(convert_admission_records_from_row(row))
    out_path = os.path.join(out_dir, 'admission_records_filled.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'  → {len(results)} admission records → {out_path}')
    return results
```

- [ ] **Step 4: Run all tests**

```bash
cd scripts/data-processing && python -m pytest test_xlsx_to_json.py -v
```
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/data-processing/xlsx_to_json.py scripts/data-processing/test_xlsx_to_json.py
git commit -m "feat: xlsx→JSON converter — admission records wide-to-long split"
```

---

### Task 7: Python converter — batch config + main entry

**Files:**
- Modify: `scripts/data-processing/xlsx_to_json.py`

- [ ] **Step 1: Add batch config converter and main()**

Append to `xlsx_to_json.py`:

```python
# ── Batch Config Converter ───────────────────────────────────────────

def convert_batch_config(xlsx_paths, out_dir):
    """Convert 批次结构 xlsx files → batch_config.json.

    Each file has header at row 3: 序号, 录取批次, 投档顺序, 招生类型, 志愿设置
    """
    print('Converting batch configs...')
    results = []
    year_map = {'2023': 2023, '2024': 2024, '2025': 2025}

    for xlsx_path in xlsx_paths:
        basename = os.path.basename(xlsx_path)
        year = None
        for y_str, y_int in year_map.items():
            if y_str in basename:
                year = y_int
                break
        if year is None:
            print(f'  Skipping {basename} (cannot determine year)')
            continue

        _, rows = read_xlsx_rows(xlsx_path, header_row=3)
        for row in rows:
            if not row[1]:
                continue
            results.append({
                'year': year,
                'province': '四川',
                'sequence': to_int(row[0]),
                'batch': to_str(row[1]),
                'filingOrder': to_str(row[2]),
                'recruitType': to_str(row[3]),
                'volunteerSetting': to_str(row[4]),
            })

    out_path = os.path.join(out_dir, 'batch_config.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f'  → {len(results)} batch configs → {out_path}')
    return results


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='xlsx → JSON converter')
    parser.add_argument('--xlsx-dir', default=None,
                        help='xlsx 源目录 (default: data/03_专家版主表/output)')
    parser.add_argument('--out-dir', default=None,
                        help='JSON 输出目录 (default: scripts/data-processing/output)')
    args = parser.parse_args()

    # Resolve paths relative to project root
    project_root = Path(__file__).resolve().parent.parent.parent
    xlsx_dir = Path(args.xlsx_dir) if args.xlsx_dir else project_root / 'data' / '03_专家版主表' / 'output'
    out_dir = Path(args.out_dir) if args.out_dir else Path(__file__).resolve().parent / 'output'

    if not xlsx_dir.exists():
        print(f'ERROR: xlsx dir not found: {xlsx_dir}')
        sys.exit(1)
    os.makedirs(out_dir, exist_ok=True)

    print(f'xlsx dir: {xlsx_dir}')
    print(f'output dir: {out_dir}')
    print('=' * 60)

    # 1. Universities
    uni_xlsx = xlsx_dir / '院校信息表.xlsx'
    if uni_xlsx.exists():
        convert_universities(str(uni_xlsx), str(out_dir))
    else:
        print(f'WARNING: {uni_xlsx} not found, skipping universities')

    # 2-4. From 专业招生主表
    main_xlsx = xlsx_dir / '专业招生主表.xlsx'
    if main_xlsx.exists():
        convert_majors(str(main_xlsx), str(out_dir))
        convert_enrollment_plans(str(main_xlsx), str(out_dir))
        convert_admission_records(str(main_xlsx), str(out_dir))
    else:
        print(f'WARNING: {main_xlsx} not found, skipping main table')

    # 5. Batch configs
    batch_files = sorted(xlsx_dir.glob('*批次结构*.xlsx'))
    batch_files = [f for f in batch_files if '对比' not in f.name]
    if batch_files:
        convert_batch_config([str(f) for f in batch_files], str(out_dir))

    print('\n' + '=' * 60)
    print('Conversion complete ✓')


if __name__ == '__main__':
    main()
```

- [ ] **Step 2: Run full converter against real data as smoke test**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python scripts/data-processing/xlsx_to_json.py
```

Expected output (approximate):
```
Converting universities... → ~2237 universities
Converting majors... → ~1500+ majors
Converting enrollment plans... → ~80K+ enrollment plans
Converting admission records... → ~100K+ admission records
Converting batch configs... → ~100+ batch configs
Conversion complete ✓
```

- [ ] **Step 3: Verify output JSON samples**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python -c "
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
for f in ['universities_enriched','majors_enriched','enrollment_plans_enriched','admission_records_filled','batch_config']:
    d = json.load(open(f'scripts/data-processing/output/{f}.json', encoding='utf-8'))
    print(f'{f}: {len(d)} records')
    if d: print(f'  sample keys: {list(d[0].keys())[:8]}...')
"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data-processing/xlsx_to_json.py scripts/data-processing/test_xlsx_to_json.py
git commit -m "feat: xlsx→JSON converter — batch config + main entry point"
```

---

### Task 8: import_to_db.ts — add new fields and --mode=upsert

**Files:**
- Modify: `scripts/data-processing/import_to_db.ts`

- [ ] **Step 1: Add --mode CLI argument parsing**

In `import_to_db.ts`, after the existing CLI argument parsing block (around line 25-29), add:

```typescript
let MODE: 'replace' | 'upsert' = 'replace';

for (const arg of process.argv.slice(2)) {
  if (arg.startsWith('--data=')) {
    DATA_DIR = path.resolve(arg.slice(7));
  }
  if (arg.startsWith('--mode=')) {
    const m = arg.slice(7);
    if (m !== 'replace' && m !== 'upsert') {
      console.error(`Invalid mode: ${m}. Use 'replace' or 'upsert'.`);
      process.exit(1);
    }
    MODE = m;
  }
}
```

(Replace the existing `for` loop that only handles `--data=`.)

- [ ] **Step 2: Update importEnrollmentPlans to support new fields + upsert**

Replace the `importEnrollmentPlans` function (lines ~211-277) with:

```typescript
async function importEnrollmentPlans(
  uniCodeToId: Map<string, number>,
  majorNameToId: Map<string, number>,
) {
  console.log('\n=== [5/7] Enrollment Plans ===');
  const data = loadJSON<any[]>('enrollment_plans_enriched.json');

  if (MODE === 'replace') {
    // existing replace behavior — clear handled by importUniversities
  }

  let count = 0;
  let skipped = 0;
  const batchSize = 200;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    for (const p of batch) {
      const uniId = uniCodeToId.get(String(p.universityEnrollCode));
      const majorId = majorNameToId.get(p.majorName);
      if (!uniId) { skipped++; continue; }

      const record = {
        universityId: uniId,
        majorId: majorId || 0,
        year: p.year || 2025,
        province: p.province || '四川',
        planCount: toInt(p.planCount),
        planNotes: toStr(p.planNotes),
        batch: toStr(p.batch) || '',
        level: toStr(p.level),
        subjects: toStr(p.subjects) || '',
        subjectRequirements: toStr(p.subjectRequirements),
        duration: toStr(p.duration),
        tuition: toInt(p.tuition),
        isSinoForeign: false,
        localMasterPoint: toStr(p.localMasterPoint) || null,
        localDoctoralPoint: toStr(p.localDoctoralPoint) || null,
        groupCode: toStr(p.groupCode) || '',
        groupName: toStr(p.groupName),
        groupMajors: toStr(p.groupMajors),
        groupPlanCount: toInt(p.groupPlanCount),
        isNew: !!p.isNew,
        oldBatch: toStr(p.oldBatch),
        disciplineEval: toStr(p.disciplineEval),
        isNationalFeature: !!p.isNationalFeature,
        majorRanking: toStr(p.majorRanking),
        majorHonor: toStr(p.majorHonor),
        // 自然主键新增字段
        recruitType: toStr(p.recruitType) || '',
        majorCode: toStr(p.majorCode) || '',
        majorName: toStr(p.majorName) || '',
      };

      try {
        if (MODE === 'upsert') {
          await prisma.enrollmentPlan.upsert({
            where: {
              universityId_subjects_batch_recruitType_groupCode_majorCode_majorName_year: {
                universityId: record.universityId,
                subjects: record.subjects,
                batch: record.batch,
                recruitType: record.recruitType,
                groupCode: record.groupCode,
                majorCode: record.majorCode,
                majorName: record.majorName,
                year: record.year,
              },
            },
            update: record,
            create: record,
          });
        } else {
          await prisma.enrollmentPlan.create({ data: record });
        }
        count++;
      } catch (e: any) {
        skipped++;
        if (skipped <= 5) console.error(`  Error: ${e.message?.slice(0, 120)}`);
      }
    }
    if ((i / batchSize) % 10 === 0) process.stdout.write(`  ${count}/${data.length}\r`);
  }
  console.log(`  Imported ${count} plans (skipped ${skipped})`);
}
```

- [ ] **Step 3: Update importAdmissionRecords to support new fields + upsert**

Replace the `importAdmissionRecords` function (lines ~280-345) with:

```typescript
async function importAdmissionRecords(
  uniCodeToId: Map<string, number>,
  majorNameToId: Map<string, number>,
) {
  console.log('\n=== [6/7] Admission Records ===');
  const data = loadJSON<any[]>('admission_records_filled.json');

  let count = 0;
  let skipped = 0;
  const batchSize = 300;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);

    for (const r of batch) {
      const uniId = uniCodeToId.get(String(r.universityEnrollCode));
      const majorId = majorNameToId.get(r.majorName);
      if (!uniId) { skipped++; continue; }

      const record = {
        universityId: uniId,
        majorId: majorId || 0,
        year: r.year,
        province: r.province || '四川',
        batch: toStr(r.batch) || '',
        subjects: toStr(r.subjects) || '',
        majorMinScore: toInt(r.majorMinScore),
        majorMinRank: toInt(r.majorMinRank),
        majorAvgScore: toInt(r.majorAvgScore),
        majorAvgRank: toInt(r.majorAvgRank),
        majorMaxScore: toInt(r.majorMaxScore),
        majorMaxRank: toInt(r.majorMaxRank),
        majorAdmissionCount: toInt(r.majorAdmissionCount),
        groupMinScore: toInt(r.groupMinScore),
        groupMinRank: toInt(r.groupMinRank),
        groupAdmissionCount: toInt(r.groupAdmissionCount),
        filingMinScore: toInt(r.filingMinScore),
        filingMinRank: toInt(r.filingMinRank),
        universityMinScore: toInt(r.universityMinScore),
        universityMinRank: toInt(r.universityMinRank),
        universityAvgScore: toInt(r.universityAvgScore),
        universityAvgRank: toInt(r.universityAvgRank),
        universityMaxScore: toInt(r.universityMaxScore),
        universityMaxRank: toInt(r.universityMaxRank),
        universityAdmissionCount: toInt(r.universityAdmissionCount),
        // 自然主键新增字段
        recruitType: toStr(r.recruitType) || '',
        groupCode: toStr(r.groupCode) || '',
        majorCode: toStr(r.majorCode) || '',
        majorName: toStr(r.majorName) || '',
      };

      try {
        if (MODE === 'upsert') {
          await prisma.admissionRecord.upsert({
            where: {
              universityId_subjects_batch_recruitType_groupCode_majorCode_majorName_year: {
                universityId: record.universityId,
                subjects: record.subjects,
                batch: record.batch,
                recruitType: record.recruitType,
                groupCode: record.groupCode,
                majorCode: record.majorCode,
                majorName: record.majorName,
                year: record.year,
              },
            },
            update: record,
            create: record,
          });
        } else {
          await prisma.admissionRecord.create({ data: record });
        }
        count++;
      } catch (e: any) {
        skipped++;
        if (skipped <= 5) console.error(`  Error: ${e.message?.slice(0, 120)}`);
      }
    }
    if ((i / batchSize) % 20 === 0) process.stdout.write(`  ${count}/${data.length}\r`);
  }
  console.log(`  Imported ${count} records (skipped ${skipped})`);
}
```

- [ ] **Step 4: Update main() to print mode**

In the `main()` function, after the banner, add:

```typescript
  console.log(`Mode: ${MODE}`);
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd apps/server && npx tsx --check ../../scripts/data-processing/import_to_db.ts
```
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add scripts/data-processing/import_to_db.ts
git commit -m "feat: import_to_db.ts supports --mode=upsert and natural key fields"
```

---

### Task 9: Run full pipeline locally

**Files:** No code changes — execution and validation.

- [ ] **Step 1: Run xlsx → JSON conversion**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python scripts/data-processing/xlsx_to_json.py
```

Verify output file counts are reasonable.

- [ ] **Step 2: Spot-check JSON output correctness**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python -c "
import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Check enrollment plans have all 7 natural key fields
plans = json.load(open('scripts/data-processing/output/enrollment_plans_enriched.json', encoding='utf-8'))
required = ['universityEnrollCode','majorName','majorCode','groupCode','subjects','batch','recruitType','year']
sample = plans[0]
for k in required:
    assert k in sample, f'Missing key: {k}'
    print(f'  {k}: {sample[k]}')
print(f'All {len(required)} natural key fields present ✓')
print(f'Total plans: {len(plans)}')

# Check admission records
recs = json.load(open('scripts/data-processing/output/admission_records_filled.json', encoding='utf-8'))
sample = recs[0]
for k in required:
    assert k in sample, f'Missing key: {k}'
print(f'Admission records: {len(recs)}, all keys present ✓')
"
```

- [ ] **Step 3: Commit converted JSON files**

```bash
git add scripts/data-processing/output/
git commit -m "chore: regenerate JSON from xlsx master tables"
```

---

### Task 10: Deploy and import to production

**Files:** No code changes — deployment.

- [ ] **Step 1: Push all commits to Gitee**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && git push origin master
```

- [ ] **Step 2: Deploy code + data to server**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper && python deploy_auto.py --import-enriched
```

This will:
1. Build backend/frontend
2. Upload to server
3. Run Prisma migration (adds new columns + unique constraint)
4. Run import_to_db.ts with data

If `deploy_auto.py --import-enriched` doesn't support the new migration flow, fall back to manual steps:

```bash
# SSH to server
ssh -i cube.pem ubuntu@132.232.245.53

# On server
cd /home/ubuntu/apps/volunteer-helper/apps/server
npx prisma migrate deploy

# Run import
cd /home/ubuntu/apps/volunteer-helper
npx tsx scripts/data-processing/import_to_db.ts --data=scripts/data-processing/output --mode=replace
```

- [ ] **Step 3: Verify data via API**

```bash
curl -s http://volunteer.teach-helper.cn/api/v1/health
curl -s http://volunteer.teach-helper.cn/api/v1/universities?page=1&pageSize=3 | python -m json.tool | head -30
curl -s http://volunteer.teach-helper.cn/api/v1/admissions/by-score?score=600&province=四川 | python -m json.tool | head -30
```

- [ ] **Step 4: Verify frontend displays data**

Open `http://volunteer.teach-helper.cn` in browser and check:
- 院校列表页：显示真实院校数据、筛选可用
- 院校详情页：基本信息、招生计划表、历史录取数据
- 分数查询页：输入分数能返回匹配专业

---

### Task 11: Frontend data integration fixes (if needed)

**Files:** Varies based on issues found in Task 10.

- [ ] **Step 1: Identify API response mismatches**

If frontend pages show blank data or errors after import, check browser DevTools Network tab for:
- API responses returning unexpected field names
- Missing fields the frontend expects
- Pagination/filter parameters not matching backend expectations

- [ ] **Step 2: Fix mismatches in backend service layer**

Common fixes needed:
- University service `findMajors()` may need to include new fields (`recruitType`, `majorCode`, `majorName`) in its Prisma select
- Admission service `findByScore()` / `findByRank()` may need to update its select/include to return new fields
- API responses for "multi-year comparison" may need aggregation logic (GROUP BY year, return years object)

- [ ] **Step 3: Verify fixes**

Re-test all pages from Task 10 Step 4. Confirm data renders correctly.

- [ ] **Step 4: Commit fixes**

```bash
git add -A
git commit -m "fix: align frontend data integration with new schema fields"
```
