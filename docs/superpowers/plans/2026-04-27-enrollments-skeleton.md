# Enrollment Skeleton (Layer 3A) — Plan 3A

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the enrollment tree skeleton from 01/2025 招生计划, establishing every school→subject→enrollment→group→major record with official plan numbers and batch normalization.

**Architecture:** Parse 01/普通批招生计划 (9677 records) + 01/提前批招生计划 (11273 M-type records). Map batch names to batch_tree node IDs. Build the nested enrollment JSON structure. Validate against batch_tree and school_registry.

**Tech Stack:** Python 3, pytest, json

---

## Data Source Details

### 01/普通批招生计划_四川_2025.json (9677 records)
- Join key: `collegeEnrollCode` = 4-digit enrollment code → registry key
- Batch: `batch` field (e.g. "本科B", "专科", "本科A(国家专项)")
- Subject: `course` field ("物理" / "历史")
- Major code: `code` field
- Major name: `professionName`
- Plan: `planNum`

### 01/提前批招生计划_四川_2025.json (21940 records, 11273 M-type)
- Hierarchical: `title` field contains batch path e.g. "一、历史类>(一)本科提前批次>1.国家专项计划"
- `dataType`: L=label/header, U=university, I=info, M=major (only M used)
- Join key: `collegeEnrollCode`
- Subject: parsed from `chooseSubject` first element or title prefix
- Major: `majorName`, `professionEnrollCode`

### Batch name mapping needed

| 01 batch value | → batchNodeId |
|---|---|
| 本科B | bkp_b (need enrollmentType to reach leaf) |
| 专科 | zkp (same) |
| 本科A(国家专项) | bkp_a_gjzx |
| 本科(高校专项) | bkp_gxzx |
| 本科A(地方专项) | bkp_a_dfzx |
| 本科(区域均衡专项) | bkp_qyjh |
| 本科(高水平运动队) | bkp_gspyd |
| 提前批 title paths | parsed from title field |

## File Structure

```
scripts/data_integration/
├── three_layer/
│   ├── build_enrollments.py        # Task 1: Main builder
│   ├── parse_01_plans.py           # Task 2: Parse 01 plan JSON files
│   └── batch_normalizer.py         # Existing, may need extending
├── three_layer_output/
│   └── enrollments.json            # Output
└── tests/test_three_layer/
    ├── test_parse_01_plans.py
    └── test_build_enrollments.py
```

---

### Task 1: parse_01_plans.py — Parse 01 plan JSON into flat records

**Files:**
- Create: `scripts/data_integration/three_layer/parse_01_plans.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_parse_01_plans.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_three_layer/test_parse_01_plans.py
# -*- coding: utf-8 -*-
"""Tests for 01 plan data parsing."""
import pytest
from three_layer.parse_01_plans import (
    parse_normal_plans, parse_early_plans, parse_title_path,
    PlanRecord,
)


def test_parse_title_path_history():
    result = parse_title_path("一、历史类>(一)本科提前批次>1.国家专项计划")
    assert result["subject"] == "历史"
    assert result["batch_level_1"] == "本科提前批次"
    assert result["batch_level_2"] == "国家专项计划"


def test_parse_title_path_physics_a():
    result = parse_title_path("二、物理类>(一)本科提前批次>2.A段>(1)军事类")
    assert result["subject"] == "物理"
    assert result["batch_level_1"] == "本科提前批次"
    assert result["batch_level_2"] == "A段"
    assert result["batch_level_3"] == "军事类"


def test_parse_normal_plans():
    records = parse_normal_plans()
    assert len(records) > 5000
    # Each record should have required fields
    r = records[0]
    assert isinstance(r, PlanRecord)
    assert r.school_code
    assert r.subject in ("物理", "历史")
    assert r.batch_node_id
    assert r.major_code
    assert r.plan_num is not None


def test_parse_early_plans():
    records = parse_early_plans()
    assert len(records) > 8000
    r = records[0]
    assert isinstance(r, PlanRecord)
    assert r.school_code
    assert r.enrollment_type


def test_no_unmapped_batches():
    """All batch names should be mappable."""
    normal = parse_normal_plans()
    early = parse_early_plans()
    unmapped = [r for r in normal + early if r.batch_node_id is None]
    assert len(unmapped) == 0, f"{len(unmapped)} unmapped batches"
```

- [ ] **Step 2: Implement parse_01_plans.py**

```python
# three_layer/parse_01_plans.py
# -*- coding: utf-8 -*-
"""Parse 01_核心录取数据 plan JSON files into flat PlanRecord list.

Handles two formats:
1. 普通批: flat records with `batch` field
2. 提前批: hierarchical records with `title` path and `dataType` filter

Output: list[PlanRecord] with normalized batch_node_id.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path

from three_layer.batch_normalizer import normalize_batch, BatchNormalizeError

DATA_01 = Path(__file__).resolve().parents[3] / "data" / "01_核心录取数据"


@dataclass
class PlanRecord:
    school_code: str        # 4-digit enrollment code (collegeEnrollCode)
    school_name: str
    subject: str            # 物理 / 历史
    batch_node_id: str      # normalized to batch_tree
    enrollment_type: str    # e.g. 国家专项计划, 普通类本科
    group_code: str | None  # parsed from collegeName if present
    major_code: str         # professionEnrollCode or code
    major_name: str
    major_note: str | None
    plan_num: int | None
    duration: int | None
    tuition: int | None
    subject_req: str | None # 选科要求
    national_code: str | None  # collegeCode (国标码)


def parse_title_path(title: str) -> dict:
    """Parse 提前批 title path like '一、历史类>(一)本科提前批次>1.国家专项计划'."""
    parts = [p.strip() for p in title.split(">")]
    result = {"subject": None, "batch_level_1": None, "batch_level_2": None, "batch_level_3": None}

    for p in parts:
        if "历史" in p:
            result["subject"] = "历史"
        elif "物理" in p:
            result["subject"] = "物理"

    # Remove numbering and Chinese section markers
    def clean(s):
        return re.sub(r'^[\(（]?[\d一二三四五六七八九十]+[\.、）\)]?\s*', '', s).strip()

    levels = [clean(p) for p in parts if not any(k in p for k in ["历史类", "物理类"])]
    if len(levels) >= 1:
        result["batch_level_1"] = levels[0]
    if len(levels) >= 2:
        result["batch_level_2"] = levels[1]
    if len(levels) >= 3:
        result["batch_level_3"] = levels[2]

    return result


def _parse_group_code(college_name: str) -> str | None:
    """Extract group code from '北京大学(专业组101)' → '101'."""
    m = re.search(r'专业组(\d+)', college_name or '')
    return m.group(1) if m else None


def _safe_int(v) -> int | None:
    if v is None:
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


# Mapping for 普通批 batch short names → (batchNodeId prefix, enrollmentType)
_NORMAL_BATCH_MAP = {
    "本科B": ("bkp_b", "普通类本科"),
    "专科": ("zkp", "普通类高职(专科)"),
    "本科A(国家专项)": ("bkp_a_gjzx", "国家专项计划"),
    "本科(高校专项)": ("bkp_gxzx", "高校专项计划"),
    "本科A(地方专项)": ("bkp_a_dfzx", "地方专项计划"),
    "本科(区域均衡专项)": ("bkp_qyjh", "区域教育均衡发展专项计划"),
    "本科(高水平运动队)": ("bkp_gspyd", "高水平运动队"),
}

# Mapping for 提前批 title segments → (batchNodeId, enrollmentType)
_EARLY_BATCH_MAP = {
    # 本科提前批次
    ("本科提前批次", "国家专项计划", None): ("bktqp_gjzx", "国家专项计划"),
    ("本科提前批次", "A段", "军事类"): ("bktqp_a_js", "军事类"),
    ("本科提前批次", "A段", "飞行技术"): ("bktqp_a_fxjs", "飞行技术"),
    ("本科提前批次", "A段", "公安类、司法类"): ("bktqp_a_gasf", "公安类、司法类"),
    ("本科提前批次", "A段", "航海类"): ("bktqp_a_hh", "航海类"),
    ("本科提前批次", "A段", "消防救援"): ("bktqp_a_xfjy", "消防救援"),
    ("本科提前批次", "A段", "高校综合评价"): ("bktqp_a_zhpj", "高校综合评价"),
    ("本科提前批次", "A段", "其他"): ("bktqp_a_qt", "其他"),
    ("本科提前批次", "高校专项计划", None): ("bktqp_gxzx", "高校专项计划"),
    ("本科提前批次", "B段", "国家公费师范生"): ("bktqp_b_gjgfsf", "国家公费师范生"),
    ("本科提前批次", "B段", "国家优师专项"): ("bktqp_b_gjyszx", "国家优师专项"),
    ("本科提前批次", "B段", "农村订单定向医学生"): ("bktqp_b_ncddyx", "农村订单定向医学生"),
    ("本科提前批次", "B段", "省级公费师范生"): ("bktqp_b_sjgfsf", "省级公费师范生"),
    ("本科提前批次", "B段", "地方优师计划"): ("bktqp_b_dfyszx", "地方优师计划"),
    ("本科提前批次", "B段", "乡村振兴计划"): ("bktqp_b_xczx", "乡村振兴计划"),
    ("本科提前批次", "B段", "其他"): ("bktqp_b_qt", "其他"),
    # 本科批次 (some items in 提前批 file)
    ("本科批次", "A段", "国家专项计划"): ("bkp_a_gjzx", "国家专项计划"),
    ("本科批次", "A段", "地方专项计划"): ("bkp_a_dfzx", "地方专项计划"),
    ("本科批次", "高校专项计划", None): ("bkp_gxzx", "高校专项计划"),
    ("本科批次", "高水平运动队", None): ("bkp_gspyd", "高水平运动队"),
    ("本科批次", "B段", None): ("bkp_b", "普通类本科"),
    # 高职(专科)提前批次
    ("高职(专科)提前批次", "定向培养军士", None): ("zktqp_dxpyjs", "定向培养军士"),
    ("高职(专科)提前批次", "公安类、司法类", None): ("zktqp_gasf", "公安类、司法类"),
    ("高职(专科)提前批次", "航海类", None): ("zktqp_hh", "航海类"),
    # 高职(专科)批次
    ("高职(专科)批次", None, None): ("zkp", "普通类高职(专科)"),
}


def _resolve_early_batch(parsed: dict) -> tuple[str, str] | None:
    """Resolve parsed title path to (batchNodeId, enrollmentType)."""
    l1 = parsed.get("batch_level_1", "")
    l2 = parsed.get("batch_level_2")
    l3 = parsed.get("batch_level_3")

    # Try exact match
    key = (l1, l2, l3)
    if key in _EARLY_BATCH_MAP:
        return _EARLY_BATCH_MAP[key]

    # Try without l3
    key2 = (l1, l2, None)
    if key2 in _EARLY_BATCH_MAP:
        return _EARLY_BATCH_MAP[key2]

    # Try without l2 and l3
    key3 = (l1, None, None)
    if key3 in _EARLY_BATCH_MAP:
        return _EARLY_BATCH_MAP[key3]

    return None


def parse_normal_plans(year: str = "2025") -> list[PlanRecord]:
    """Parse 01/普通批招生计划."""
    path = DATA_01 / f"普通批招生计划_四川_{year}.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    records = []
    for r in data:
        batch_raw = r.get("batch", "")
        if not batch_raw:
            continue

        mapping = _NORMAL_BATCH_MAP.get(batch_raw)
        if not mapping:
            # Try batch_normalizer fallback
            try:
                node_id = normalize_batch(batch_raw)
                etype = batch_raw
            except BatchNormalizeError:
                continue
        else:
            node_id, etype = mapping

        code = str(r.get("collegeEnrollCode", "")).strip().zfill(4)
        subject = r.get("course", "")
        if not code or not subject:
            continue

        records.append(PlanRecord(
            school_code=code,
            school_name=r.get("collegeName", ""),
            subject=subject,
            batch_node_id=node_id,
            enrollment_type=etype,
            group_code=_parse_group_code(r.get("collegeName", "")),
            major_code=str(r.get("code", "")).strip(),
            major_name=r.get("professionName", "") or "",
            major_note=r.get("remark"),
            plan_num=_safe_int(r.get("planNum")),
            duration=_safe_int(r.get("learnYear")),
            tuition=_safe_int(r.get("cost")),
            subject_req=r.get("chooseSubjectText"),
            national_code=str(r.get("collegeCode", "")).strip(),
        ))

    return records


def parse_early_plans(year: str = "2025") -> list[PlanRecord]:
    """Parse 01/提前批招生计划 (only M-type records)."""
    path = DATA_01 / f"提前批招生计划_四川_{year}.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    records = []
    for r in data:
        if r.get("dataType") != "M":
            continue

        title = r.get("title", "")
        parsed = parse_title_path(title)
        subject = parsed["subject"]

        # Also check chooseSubject for subject
        if not subject:
            cs = r.get("chooseSubject", "")
            if "物理" in cs:
                subject = "物理"
            elif "历史" in cs:
                subject = "历史"

        if not subject:
            continue

        resolved = _resolve_early_batch(parsed)
        if not resolved:
            continue
        node_id, etype = resolved

        code = str(r.get("collegeEnrollCode", "")).strip().zfill(4)
        if not code:
            continue

        records.append(PlanRecord(
            school_code=code,
            school_name=r.get("collegeName", ""),
            subject=subject,
            batch_node_id=node_id,
            enrollment_type=etype,
            group_code=_parse_group_code(r.get("collegeName", "")),
            major_code=str(r.get("professionEnrollCode", "")).strip(),
            major_name=r.get("majorName", "") or "",
            major_note=r.get("remark"),
            plan_num=_safe_int(r.get("planNum")),
            duration=_safe_int(r.get("learnYear")),
            tuition=_safe_int(r.get("cost")),
            subject_req=r.get("chooseSubject2") or r.get("chooseSubject"),
            national_code=str(r.get("collegeCode", "")).strip(),
        ))

    return records
```

- [ ] **Step 3: Run tests**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_parse_01_plans.py -v
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data_integration/three_layer/parse_01_plans.py scripts/data_integration/tests/test_three_layer/test_parse_01_plans.py
git commit -m "feat: parse 01 plan data (normal + early batch) into PlanRecords"
```

---

### Task 2: build_enrollments.py — Assemble enrollment tree

**Files:**
- Create: `scripts/data_integration/three_layer/build_enrollments.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_build_enrollments.py`

- [ ] **Step 1: Write tests**

```python
# tests/test_three_layer/test_build_enrollments.py
# -*- coding: utf-8 -*-
"""Tests for enrollment tree builder."""
import json
import pytest
from pathlib import Path
from three_layer.build_enrollments import build_enrollments


@pytest.fixture(scope="module")
def enrollments():
    return build_enrollments()


def test_structure_has_meta(enrollments):
    assert enrollments["meta"]["batchTreeRef"] == "batch_tree_2025.json"
    assert enrollments["meta"]["schoolRegistryRef"] == "school_registry.json"
    assert enrollments["meta"]["totalRecords"] > 15000


def test_schools_present(enrollments):
    assert "0001" in enrollments["data"]  # 北京大学
    assert "0003" in enrollments["data"]  # 清华大学


def test_subject_keys(enrollments):
    pku = enrollments["data"]["0001"]
    subjects = set(pku.keys())
    assert "物理" in subjects or "历史" in subjects


def test_enrollment_node_structure(enrollments):
    pku = enrollments["data"]["0001"]
    for subj, enrolls in pku.items():
        for e in enrolls:
            assert "batchNodeId" in e
            assert "enrollmentType" in e
            assert "groups" in e
            for g in e["groups"]:
                assert "groupCode" in g or g.get("groupCode") is None
                assert "majors" in g
                for m in g["majors"]:
                    assert "code" in m
                    assert "name" in m
                    assert "yearly" in m
                    assert "2025" in m["yearly"]
                    assert "plan" in m["yearly"]["2025"]


def test_no_empty_schools(enrollments):
    for code, subjs in enrollments["data"].items():
        for subj, enrolls in subjs.items():
            assert len(enrolls) > 0, f"School {code}/{subj} has empty enrollments"
```

- [ ] **Step 2: Implement build_enrollments.py**

```python
# three_layer/build_enrollments.py
# -*- coding: utf-8 -*-
"""Build enrollments.json (Layer 3 skeleton) from 01 plan data.

Assembles: school → subject → enrollment → group → major → yearly(2025 plan)
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from three_layer.parse_01_plans import parse_normal_plans, parse_early_plans, PlanRecord

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


def build_enrollments() -> dict:
    """Build complete enrollment tree from 01 plan data."""
    normal = parse_normal_plans("2025")
    early = parse_early_plans("2025")
    all_records = normal + early

    # Group by school → subject → (batchNodeId, enrollmentType) → groupCode → majors
    tree: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(list))))

    for r in all_records:
        enroll_key = (r.batch_node_id, r.enrollment_type)
        group_key = r.group_code or "000"  # default group if none parsed
        tree[r.school_code][r.subject][enroll_key][group_key].append(r)

    # Convert to output structure
    data = {}
    total_records = 0

    for school_code in sorted(tree.keys()):
        school_data = {}
        for subject in sorted(tree[school_code].keys()):
            enrollments = []
            for (node_id, etype), groups in sorted(tree[school_code][subject].items()):
                group_list = []
                for group_code, majors in sorted(groups.items()):
                    major_list = []
                    for r in majors:
                        major_list.append({
                            "code": r.major_code,
                            "name": r.major_name,
                            "majorNote": r.major_note,
                            "duration": r.duration,
                            "tuition": r.tuition,
                            "subjectReq": r.subject_req,
                            "yearly": {
                                "2025": {
                                    "plan": r.plan_num,
                                }
                            }
                        })
                        total_records += 1
                    group_list.append({
                        "groupCode": group_code if group_code != "000" else None,
                        "subjectReq": majors[0].subject_req if majors else None,
                        "majors": major_list,
                    })
                enrollments.append({
                    "batchNodeId": node_id,
                    "enrollmentType": etype,
                    "groups": group_list,
                })
            school_data[subject] = enrollments
        data[school_code] = school_data

    return {
        "meta": {
            "source": "01_核心录取数据/招生计划_四川_2025",
            "batchTreeRef": "batch_tree_2025.json",
            "schoolRegistryRef": "school_registry.json",
            "totalRecords": total_records,
            "schools": len(data),
        },
        "data": data,
    }


def generate(output_dir: Path | None = None) -> Path:
    out = output_dir or OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / "enrollments.json"
    enrollments = build_enrollments()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)
    meta = enrollments["meta"]
    print(f"Written {meta['totalRecords']} records, {meta['schools']} schools → {path}")
    return path


if __name__ == "__main__":
    generate()
```

- [ ] **Step 3: Generate enrollments.json**

```bash
cd scripts/data_integration && python -m three_layer.build_enrollments
```

- [ ] **Step 4: Run tests**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_build_enrollments.py -v
```

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/build_enrollments.py scripts/data_integration/three_layer/parse_01_plans.py scripts/data_integration/tests/test_three_layer/ scripts/data_integration/three_layer_output/enrollments.json
git commit -m "feat: build enrollment skeleton from 01 plans (Layer 3A)"
```
