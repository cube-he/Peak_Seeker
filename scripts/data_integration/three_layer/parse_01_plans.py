# -*- coding: utf-8 -*-
"""Parse 01_核心录取数据 plan JSON files into flat PlanRecord list.

Handles two formats:
1. 普通批: nested records — top-level is college/group (dataType=c), actual
   majors are in the `majors` sub-array (dataType=p). Each major inherits
   batch, course, collegeEnrollCode from its parent.
2. 提前批: hierarchical records with `title` path and `dataType` filter
   (only M-type rows are major rows).

Output: list[PlanRecord] with normalized batch_node_id.
Records with unresolvable batch names are silently skipped (not returned
with batch_node_id=None), so batch_node_id is always non-None in output.
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
    subject_req: str | None  # 选科要求
    national_code: str | None  # collegeCode (国标码)


def parse_title_path(title: str) -> dict:
    """Parse 提前批 title path like '一、历史类>(一)本科提前批次>1.国家专项计划'.

    Returns dict with keys: subject, batch_level_1, batch_level_2, batch_level_3.
    Strips leading numbering from each segment (e.g. "1." / "(一)" / "2.A段").
    """
    parts = [p.strip() for p in title.split(">")]
    result = {"subject": None, "batch_level_1": None, "batch_level_2": None, "batch_level_3": None}

    for p in parts:
        if "历史" in p:
            result["subject"] = "历史"
        elif "物理" in p:
            result["subject"] = "物理"

    def clean(s: str) -> str:
        # Remove leading numbering like "1.", "(一)", "2.A段" → keep "A段"
        return re.sub(r'^[\(（]?[\d一二三四五六七八九十]+[\.、）\)]?\s*', '', s).strip()

    # Exclude the subject-class segment (first part)
    non_subject_parts = [p for p in parts if not any(k in p for k in ["历史类", "物理类", "艺术类", "体育类"])]
    levels = [clean(p) for p in non_subject_parts]
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


# Mapping for 普通批 batch short names → (batchNodeId, enrollmentType)
_NORMAL_BATCH_MAP: dict[str, tuple[str, str]] = {
    "本科B": ("bkp_b", "普通类本科"),
    "专科": ("zkp", "普通类高职(专科)"),
    "本科A(国家专项)": ("bkp_a_gjzx", "国家专项计划"),
    "本科(高校专项)": ("bkp_gxzx", "高校专项计划"),
    "本科A(地方专项)": ("bkp_a_dfzx", "地方专项计划"),
    "本科(区域均衡专项)": ("bkp_qyjh", "区域教育均衡发展专项计划"),
    "本科(高水平运动队)": ("bkp_gspyd", "高水平运动队"),
}

# Mapping for 提前批 title segments → (batchNodeId, enrollmentType)
# Key: (batch_level_1, batch_level_2, batch_level_3) — None means "any"
_EARLY_BATCH_MAP: dict[tuple, tuple[str, str]] = {
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
    # 高职(专科)提前批次
    ("高职(专科)提前批次", "定向培养军士", None): ("zktqp_dxpyjs", "定向培养军士"),
    ("高职(专科)提前批次", "公安类、司法类", None): ("zktqp_gasf", "公安类、司法类"),
    ("高职(专科)提前批次", "航海类", None): ("zktqp_hh", "航海类"),
}


def _resolve_early_batch(parsed: dict) -> tuple[str, str] | None:
    """Resolve parsed title to (batchNodeId, enrollmentType), or None if unmapped."""
    l1 = parsed.get("batch_level_1") or ""
    l2 = parsed.get("batch_level_2")
    l3 = parsed.get("batch_level_3")

    # Try exact (l1, l2, l3)
    key = (l1, l2, l3)
    if key in _EARLY_BATCH_MAP:
        return _EARLY_BATCH_MAP[key]

    # Try (l1, l2, None) — ignore l3
    key2 = (l1, l2, None)
    if key2 in _EARLY_BATCH_MAP:
        return _EARLY_BATCH_MAP[key2]

    # Try (l1, None, None) — ignore l2 and l3
    key3 = (l1, None, None)
    if key3 in _EARLY_BATCH_MAP:
        return _EARLY_BATCH_MAP[key3]

    return None


def parse_normal_plans(year: str = "2025") -> list[PlanRecord]:
    """Parse 01/普通批招生计划 into flat PlanRecord list.

    The JSON is nested: top-level records are college/group containers (dataType=c)
    each with a `majors` sub-array of actual major rows (dataType=p).
    We iterate through the majors; each major inherits batch/course/school fields
    from its parent.
    """
    path = DATA_01 / f"普通批招生计划_四川_{year}.json"
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    records = []
    for group in data:
        batch_raw = group.get("batch", "")
        if not batch_raw:
            continue

        mapping = _NORMAL_BATCH_MAP.get(batch_raw)
        if not mapping:
            # Fallback to batch_normalizer
            try:
                node_id = normalize_batch(batch_raw)
                etype = batch_raw
            except BatchNormalizeError:
                continue
        else:
            node_id, etype = mapping

        code = str(group.get("collegeEnrollCode", "")).strip().zfill(4)
        subject = group.get("course", "")
        college_name = group.get("collegeName", "")
        national_code = str(group.get("collegeCode", "")).strip()
        group_code = _parse_group_code(college_name)

        if not code or not subject:
            continue

        for major in group.get("majors", []):
            major_code = str(major.get("code", "")).strip()
            major_name = major.get("professionName", "") or ""
            if not major_code:
                continue
            records.append(PlanRecord(
                school_code=code,
                school_name=college_name,
                subject=subject,
                batch_node_id=node_id,
                enrollment_type=etype,
                group_code=group_code,
                major_code=major_code,
                major_name=major_name,
                major_note=major.get("remark"),
                plan_num=_safe_int(major.get("planNum")),
                duration=_safe_int(major.get("learnYear")),
                tuition=_safe_int(major.get("cost")),
                subject_req=major.get("chooseSubjectText"),
                national_code=national_code,
            ))

    return records


def parse_early_plans(year: str = "2025") -> list[PlanRecord]:
    """Parse 01/提前批招生计划 (only M-type records, only 历史/物理 subjects)."""
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

        # Also try chooseSubject field as fallback for subject detection
        if not subject:
            cs = r.get("chooseSubject", "")
            if "物理" in cs:
                subject = "物理"
            elif "历史" in cs:
                subject = "历史"

        # Skip 艺术类, 体育类, and any record without a recognized subject
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
