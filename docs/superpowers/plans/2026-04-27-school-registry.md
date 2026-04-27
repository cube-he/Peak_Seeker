# School Registry (Layer 2) — Plan 2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the existing 院校信息表 (2237 schools × 90 cols) into `school_registry.json` following the Layer 2 schema, then cross-validate against 02 raw sources.

**Architecture:** Read 院校信息表.xlsx → map 90 columns into 10 JSON groups → validate against 02/院校库 and 02/招生章程 → output conflict report for discrepancies.

**Tech Stack:** Python 3, openpyxl, pytest

**Spec:** `docs/superpowers/specs/2026-04-27-three-layer-data-structure-design.md` — Layer 2 section

---

## File Structure

```
scripts/data_integration/
├── three_layer/
│   ├── build_school_registry.py      # Task 1: Transform xlsx → JSON
│   └── validate_school_registry.py   # Task 2: Cross-validate vs 02 sources
├── three_layer_output/
│   └── school_registry.json          # Output
└── tests/test_three_layer/
    ├── test_build_school_registry.py
    └── test_validate_school_registry.py
```

## Source → Target Column Mapping (all 90 columns)

```
院校信息表 Col → JSON path

# key
Col00 院校代码 → dict key (4-digit string, zero-padded)

# location (5 fields)
Col02 院校省份 → location.province
Col55 省份代码 → location.provinceCode
Col03 院校城市 → location.city
Col04 城市等级 → location.cityTier
Col62 地址 → location.address

# basic (7 fields)
Col05 院校类型 → basic.type
Col06 办学性质 → basic.nature
Col07 隶属部门 → basic.authority
Col11 院校层级 → basic.level
Col41 建校年份 → basic.founded (int)
Col42 男生比例 → basic.maleRatio (float)
Col43 女生比例 → basic.femaleRatio (float)

# tags (4 fields)
Col08 院校档次 → tags.tier
Col09 院校背景 → tags.background
Col10 院校标签 → tags.labels
Col12 是否双一流 → tags.isDoubleFirstClass (bool: "是"→true)

# history (2 fields)
Col13 变迁史 → history.evolution
Col24 更名合并情况 → history.mergers

# ids (5 fields)
Col36 阳光高考ID → ids.yangguangId
Col49 国标代码 → ids.nationalCode
Col50 学校标识码 → ids.schoolIdentifier
Col51 国标匹配方式 → ids.matchMethod
Col52 国标匹配备注 → ids.matchNote

# rankings (10 fields)
Col14 院校排名 → rankings.composite (int)
Col57 综合排名 → rankings.overallRank (int)
Col58 综合评分 → rankings.overallScore (float)
Col44 QS排名 → rankings.qs (int)
Col45 USNews排名 → rankings.usNews (int)
Col46 校友会排名 → rankings.alumni (int)
Col59 武书连排名 → rankings.wushulian (int)
Col60 软科排名 → rankings.arwu (int)
Col61 教育部排名 → rankings.moe (int)
Col56 热度 → rankings.popularity (int)

# academics (17 fields)
Col15 硕士点数量 → academics.masterPrograms (int)
Col16 博士点数量 → academics.doctoralPrograms (int)
Col17 硕士点专业 → academics.masterSubjects (string)
Col18 博士点专业 → academics.doctoralSubjects (string)
Col19 本校硕士 → academics.localMaster
Col20 本校博士 → academics.localDoctoral
Col21 保研率 → academics.postgraduateRate (float, strip "%")
Col47 保研率_基础库 → academics.postgraduateRateAlt (float)
Col40 升学率 → academics.furtherStudyRate (float)
Col25 学科评估等级 → academics.assessmentGrade
Col48 学科评估摘要 → academics.assessmentSummary
Col63 双一流学科数 → academics.doubleFirstClassCount (int)
Col64 A类学科数 → academics.aClassCount (int)
Col65 国家级数量 → academics.nationalFeaturedCount (int)
Col66 省级数量 → academics.provincialFeaturedCount (int)
Col67 双一流专业 → academics.doubleFirstClassSubjects
Col68 特色专业 → academics.featuredMajors

# admissionRules (11 fields)
Col26 调档比例 → admissionRules.filingRatio
Col27 专业分配规则 → admissionRules.majorAllocation
Col28 同分处理规则 → admissionRules.tiebreakRule
Col29 体检限制 → admissionRules.healthRestrictions
Col30 服从调剂 → admissionRules.adjustmentPolicy
Col31 外语要求 → admissionRules.foreignLanguageReq
Col32 单科要求 → admissionRules.subjectScoreReq
Col33 加分政策 → admissionRules.bonusPolicy
Col34 学费 → admissionRules.tuition
Col22 转专业情况 → admissionRules.majorTransfer
Col35 转专业限制_章程 → admissionRules.majorTransferRestrictions

# links (6 fields)
Col23 招生简章 → links.admissionGuide
Col37 学校官网 → links.officialSite
Col38 招生网址 → links.admissionSite
Col39 招办电话 → links.phone
Col53 Logo地址 → links.logo
Col54 Banner地址 → links.banner

# satisfaction (3 groups × 7 fields = 21 fields)
Col69 综合满意度 → satisfaction.overall.score (float)
Col70 综合评价人数 → satisfaction.overall.count (int)
Col71-75 综合1-5星 → satisfaction.overall.stars [int, int, int, int, int]
Col76 生活满意度 → satisfaction.living.score (float)
Col77 生活评价人数 → satisfaction.living.count (int)
Col78-82 生活1-5星 → satisfaction.living.stars [...]
Col83 环境满意度 → satisfaction.environment.score (float)
Col84 环境评价人数 → satisfaction.environment.count (int)
Col85-89 环境1-5星 → satisfaction.environment.stars [...]
```

---

### Task 1: build_school_registry.py

**Files:**
- Create: `scripts/data_integration/three_layer/build_school_registry.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_build_school_registry.py`
- Output: `scripts/data_integration/three_layer_output/school_registry.json`

- [ ] **Step 1: Write tests**

```python
# tests/test_three_layer/test_build_school_registry.py
# -*- coding: utf-8 -*-
"""Tests for school registry builder."""
import json
import pytest
from pathlib import Path
from three_layer.build_school_registry import build_registry, transform_row

OUTPUT = Path(__file__).resolve().parents[2] / "three_layer_output" / "school_registry.json"


def test_transform_row_basic():
    """A minimal row should produce correct structure."""
    # Simulate a row tuple (90 cols) with key fields set
    row = [None] * 90
    row[0] = "0001"           # 院校代码
    row[1] = "北京大学"        # 院校名称
    row[2] = "北京"           # 院校省份
    row[3] = "海淀区"         # 院校城市
    row[5] = "综合"           # 院校类型
    row[6] = "公办"           # 办学性质
    row[12] = "是"            # 是否双一流
    row[14] = 2               # 院校排名
    row[41] = 1898            # 建校年份
    row[69] = 4.6             # 综合满意度
    row[70] = 1890            # 综合评价人数
    row[71] = 83; row[72] = 23; row[73] = 65; row[74] = 178; row[75] = 1541

    code, school = transform_row(row)
    assert code == "0001"
    assert school["name"] == "北京大学"
    assert school["location"]["province"] == "北京"
    assert school["basic"]["type"] == "综合"
    assert school["tags"]["isDoubleFirstClass"] is True
    assert school["rankings"]["composite"] == 2
    assert school["basic"]["founded"] == 1898
    assert school["satisfaction"]["overall"]["score"] == 4.6
    assert school["satisfaction"]["overall"]["stars"] == [83, 23, 65, 178, 1541]


def test_transform_row_null_handling():
    """Null/empty values should become None, not crash."""
    row = [None] * 90
    row[0] = "9999"
    row[1] = "测试大学"
    code, school = transform_row(row)
    assert code == "9999"
    assert school["rankings"]["composite"] is None
    assert school["basic"]["founded"] is None


def test_transform_row_percentage_parsing():
    """保研率 '58.6%' should become 58.6."""
    row = [None] * 90
    row[0] = "0001"; row[1] = "Test"
    row[21] = "58.6%"
    _, school = transform_row(row)
    assert school["academics"]["postgraduateRate"] == 58.6


def test_build_registry_structure():
    """Full build should produce valid meta + schools dict."""
    registry = build_registry()
    assert registry["meta"]["year"] == 2025
    assert registry["meta"]["count"] == len(registry["schools"])
    assert registry["meta"]["count"] > 2000
    # Spot check
    assert "0001" in registry["schools"]
    assert registry["schools"]["0001"]["name"] == "北京大学"


def test_output_file_has_all_groups():
    """Every school should have all 10 groups."""
    registry = build_registry()
    groups = {"name", "location", "basic", "tags", "history", "ids",
              "rankings", "academics", "admissionRules", "links", "satisfaction"}
    for code, school in list(registry["schools"].items())[:10]:
        missing = groups - set(school.keys())
        assert not missing, f"School {code} missing groups: {missing}"
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_build_school_registry.py -v
```

- [ ] **Step 3: Implement build_school_registry.py**

```python
# three_layer/build_school_registry.py
# -*- coding: utf-8 -*-
"""Build school_registry.json from 院校信息表.xlsx.

Reads 2237 schools × 90 columns, transforms into the Layer 2
target schema with 10 groups. Outputs to three_layer_output/.

Source: data/03_专家版主表/output/院校信息表.xlsx
Schema: docs/superpowers/specs/2026-04-27-three-layer-data-structure-design.md
"""
from __future__ import annotations

import json
from pathlib import Path
import openpyxl

SCHOOL_TABLE = Path(__file__).resolve().parents[2] / "data" / "03_专家版主表" / "output" / "院校信息表.xlsx"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


def _safe_int(val) -> int | None:
    if val is None: return None
    try: return int(val)
    except (ValueError, TypeError): return None


def _safe_float(val) -> float | None:
    if val is None: return None
    if isinstance(val, str):
        val = val.strip().rstrip("%")
    try: return round(float(val), 2)
    except (ValueError, TypeError): return None


def _safe_str(val) -> str | None:
    if val is None: return None
    s = str(val).strip()
    return s if s else None


def transform_row(row: list | tuple) -> tuple[str, dict]:
    """Transform a single xlsx row (90 cols) into (code, school_dict)."""
    code = str(row[0]).strip() if row[0] else "????"
    # Zero-pad to 4 digits
    if code.isdigit():
        code = code.zfill(4)

    school = {
        "name": _safe_str(row[1]),
        "location": {
            "province": _safe_str(row[2]),
            "provinceCode": _safe_str(row[55]),
            "city": _safe_str(row[3]),
            "cityTier": _safe_str(row[4]),
            "address": _safe_str(row[62]),
        },
        "basic": {
            "type": _safe_str(row[5]),
            "nature": _safe_str(row[6]),
            "authority": _safe_str(row[7]),
            "level": _safe_str(row[11]),
            "founded": _safe_int(row[41]),
            "maleRatio": _safe_float(row[42]),
            "femaleRatio": _safe_float(row[43]),
        },
        "tags": {
            "tier": _safe_str(row[8]),
            "background": _safe_str(row[9]),
            "labels": _safe_str(row[10]),
            "isDoubleFirstClass": str(row[12]).strip() == "是" if row[12] else False,
        },
        "history": {
            "evolution": _safe_str(row[13]),
            "mergers": _safe_str(row[24]),
        },
        "ids": {
            "yangguangId": _safe_str(row[36]),
            "nationalCode": _safe_str(row[49]),
            "schoolIdentifier": _safe_str(row[50]),
            "matchMethod": _safe_str(row[51]),
            "matchNote": _safe_str(row[52]),
        },
        "rankings": {
            "composite": _safe_int(row[14]),
            "overallRank": _safe_int(row[57]),
            "overallScore": _safe_float(row[58]),
            "qs": _safe_int(row[44]),
            "usNews": _safe_int(row[45]),
            "alumni": _safe_int(row[46]),
            "wushulian": _safe_int(row[59]),
            "arwu": _safe_int(row[60]),
            "moe": _safe_int(row[61]),
            "popularity": _safe_int(row[56]),
        },
        "academics": {
            "masterPrograms": _safe_int(row[15]),
            "doctoralPrograms": _safe_int(row[16]),
            "masterSubjects": _safe_str(row[17]),
            "doctoralSubjects": _safe_str(row[18]),
            "localMaster": _safe_str(row[19]),
            "localDoctoral": _safe_str(row[20]),
            "postgraduateRate": _safe_float(row[21]),
            "postgraduateRateAlt": _safe_float(row[47]),
            "furtherStudyRate": _safe_float(row[40]),
            "assessmentGrade": _safe_str(row[25]),
            "assessmentSummary": _safe_str(row[48]),
            "doubleFirstClassCount": _safe_int(row[63]),
            "aClassCount": _safe_int(row[64]),
            "nationalFeaturedCount": _safe_int(row[65]),
            "provincialFeaturedCount": _safe_int(row[66]),
            "doubleFirstClassSubjects": _safe_str(row[67]),
            "featuredMajors": _safe_str(row[68]),
        },
        "admissionRules": {
            "filingRatio": _safe_str(row[26]),
            "majorAllocation": _safe_str(row[27]),
            "tiebreakRule": _safe_str(row[28]),
            "healthRestrictions": _safe_str(row[29]),
            "adjustmentPolicy": _safe_str(row[30]),
            "foreignLanguageReq": _safe_str(row[31]),
            "subjectScoreReq": _safe_str(row[32]),
            "bonusPolicy": _safe_str(row[33]),
            "tuition": _safe_str(row[34]),
            "majorTransfer": _safe_str(row[22]),
            "majorTransferRestrictions": _safe_str(row[35]),
        },
        "links": {
            "admissionGuide": _safe_str(row[23]),
            "officialSite": _safe_str(row[37]),
            "admissionSite": _safe_str(row[38]),
            "phone": _safe_str(row[39]),
            "logo": _safe_str(row[53]),
            "banner": _safe_str(row[54]),
        },
        "satisfaction": {
            "overall": {
                "score": _safe_float(row[69]),
                "count": _safe_int(row[70]),
                "stars": [_safe_int(row[71+i]) or 0 for i in range(5)],
            },
            "living": {
                "score": _safe_float(row[76]),
                "count": _safe_int(row[77]),
                "stars": [_safe_int(row[78+i]) or 0 for i in range(5)],
            },
            "environment": {
                "score": _safe_float(row[83]),
                "count": _safe_int(row[84]),
                "stars": [_safe_int(row[85+i]) or 0 for i in range(5)],
            },
        },
    }
    return code, school


def build_registry(source_path: Path | None = None) -> dict:
    """Build the complete school registry from xlsx."""
    src = source_path or SCHOOL_TABLE
    wb = openpyxl.load_workbook(src, read_only=True)
    ws = wb.active

    schools = {}
    for i, row in enumerate(ws.iter_rows(min_row=2, values_only=True)):
        code, school = transform_row(list(row))
        if code and code != "????":
            schools[code] = school

    wb.close()

    return {
        "meta": {
            "count": len(schools),
            "source": "专家版主表·院校信息表",
            "year": 2025,
        },
        "schools": schools,
    }


def generate(output_dir: Path | None = None) -> Path:
    """Build and write school_registry.json."""
    out = output_dir or OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / "school_registry.json"
    registry = build_registry()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print(f"Written {registry['meta']['count']} schools to {path}")
    return path


if __name__ == "__main__":
    generate()
```

- [ ] **Step 4: Generate school_registry.json**

```bash
cd scripts/data_integration && python -m three_layer.build_school_registry
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_build_school_registry.py -v
```

- [ ] **Step 6: Commit**

```bash
git add scripts/data_integration/three_layer/build_school_registry.py scripts/data_integration/tests/test_three_layer/test_build_school_registry.py scripts/data_integration/three_layer_output/school_registry.json
git commit -m "feat: build school_registry.json (2237 schools × 90 cols → 10 groups)"
```

---

### Task 2: validate_school_registry.py — 交叉校验

**Files:**
- Create: `scripts/data_integration/three_layer/validate_school_registry.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_validate_school_registry.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_three_layer/test_validate_school_registry.py
# -*- coding: utf-8 -*-
"""Tests for school registry cross-validation."""
import pytest
from three_layer.validate_school_registry import (
    load_02_school_map, cross_validate, ValidationReport,
)


def test_load_02_school_map():
    """Should load 02/院校库 into a dict keyed by 国标代码."""
    schools = load_02_school_map()
    assert len(schools) > 2000
    # Check a known school
    assert any("清华" in s.get("name", "") for s in schools.values())


def test_cross_validate_produces_report():
    """Cross-validation should return a report with stats."""
    report = cross_validate()
    assert isinstance(report, ValidationReport)
    assert report.matched >= 0
    assert report.unmatched_in_registry >= 0
    assert report.unmatched_in_02 >= 0
    assert len(report.field_diffs) >= 0
```

- [ ] **Step 2: Implement validate_school_registry.py**

```python
# three_layer/validate_school_registry.py
# -*- coding: utf-8 -*-
"""Cross-validate school_registry.json against 02/院校库_全国.

Matches schools by 国标代码 (ids.nationalCode ↔ 02.国标代码).
Reports field-level discrepancies as a conflict report.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
import openpyxl

from three_layer.conflict_reporter import ConflictReporter, ConflictRecord

DATA_DIR = Path(__file__).resolve().parents[2] / "data"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

# Fields to compare between registry and 02/院校库
_COMPARE_FIELDS = {
    # registry_path: 02 column header
    "basic.type": "院校类型",
    "basic.nature": "办学性质名称",
    "basic.authority": "隶属部门",
    "rankings.qs": "QS排名",
    "rankings.usNews": "USNews排名",
    "rankings.arwu": "软科排名",
    "rankings.alumni": "校友会排名",
    "academics.masterPrograms": "硕士点数",
    "academics.doctoralPrograms": "博士点数",
    "academics.postgraduateRate": "保研率",
}


@dataclass
class ValidationReport:
    matched: int = 0
    unmatched_in_registry: int = 0
    unmatched_in_02: int = 0
    field_diffs: list = field(default_factory=list)


def load_02_school_map() -> dict[str, dict]:
    """Load 02/院校库_全国 into a dict keyed by 国标代码."""
    path = DATA_DIR / "02_全国基础库" / "院校库_全国.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    headers = []
    schools = {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            headers = [str(c).strip() if c else "" for c in row]
            continue
        record = {headers[j]: row[j] for j in range(len(headers)) if j < len(row)}
        national_code = str(record.get("国标代码", "")).strip()
        if national_code:
            schools[national_code] = record
    wb.close()
    return schools


def _get_nested(obj: dict, path: str):
    """Get a nested value by dot path: 'rankings.qs' → obj['rankings']['qs']."""
    parts = path.split(".")
    for p in parts:
        if isinstance(obj, dict):
            obj = obj.get(p)
        else:
            return None
    return obj


def cross_validate() -> ValidationReport:
    """Cross-validate school_registry.json vs 02/院校库."""
    reg_path = OUTPUT_DIR / "school_registry.json"
    with open(reg_path, "r", encoding="utf-8") as f:
        registry = json.load(f)

    schools_02 = load_02_school_map()
    reporter = ConflictReporter(output_dir=OUTPUT_DIR)
    report = ValidationReport()

    for code, school in registry["schools"].items():
        national_code = (school.get("ids") or {}).get("nationalCode")
        if not national_code or national_code not in schools_02:
            report.unmatched_in_registry += 1
            continue

        report.matched += 1
        s02 = schools_02[national_code]

        for reg_field, col_02 in _COMPARE_FIELDS.items():
            val_reg = _get_nested(school, reg_field)
            val_02 = s02.get(col_02)

            # Normalize for comparison
            str_reg = str(val_reg).strip() if val_reg is not None else ""
            str_02 = str(val_02).strip() if val_02 is not None else ""

            if str_reg == str_02:
                continue
            if not str_reg and not str_02:
                continue

            # Determine diff type
            diff_type = "one_side_missing"
            if str_reg and str_02:
                try:
                    diff = abs(float(str_reg) - float(str_02))
                    diff_type = "numeric_small" if diff <= 3 else "numeric_large"
                except ValueError:
                    diff_type = "text_minor" if str_reg[:3] == str_02[:3] else "text_major"

            reporter.add_conflict(ConflictRecord(
                school_code=code,
                school_name=school.get("name", ""),
                subject="—",
                batch="—",
                major_code="—",
                major_name="—",
                field_name=reg_field,
                current_value=str_reg,
                new_value=str_02,
                source="02_院校库",
                match_type="exact",
                confidence=1.0,
                diff_type=diff_type,
            ))
            report.field_diffs.append((code, reg_field))

    report.unmatched_in_02 = len(schools_02) - report.matched

    if reporter.count > 0:
        csv_path = reporter.write("school_registry_conflicts.csv")
        print(f"Conflicts: {reporter.count} → {csv_path}")
        summary = reporter.summary()
        print(f"  By type: {summary['by_diff_type']}")
    else:
        print("No conflicts found.")

    print(f"Matched: {report.matched}, Unmatched in registry: {report.unmatched_in_registry}, Unmatched in 02: {report.unmatched_in_02}")
    return report


if __name__ == "__main__":
    cross_validate()
```

- [ ] **Step 3: Run validation**

```bash
cd scripts/data_integration && python -m three_layer.validate_school_registry
```

- [ ] **Step 4: Run tests**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_validate_school_registry.py -v
```

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/validate_school_registry.py scripts/data_integration/tests/test_three_layer/test_validate_school_registry.py
git commit -m "feat: add school registry cross-validation vs 02 sources"
```
