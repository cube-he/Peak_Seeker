# -*- coding: utf-8 -*-
"""Supplement enrollments.json with fields from 03/F (曦鸿仕文化3月模拟版).

F source: data/03_专家版主表/曦鸿仕文化2025新高考专业组模拟3月版.xlsx → 总库 sheet
45237 rows × 49 cols. Earliest version; only has 24/23 year data (no 22).

F has NO "批次" column. batchNodeId is derived from (招生类型, 专业层次):
  (普通类, 本科) → bkp_b
  (普通类, 专科) → zkp
  (国家专项, 本科) → bkp_a_gjzx
  etc.

专业组代码 format: "101组" → strip "组" suffix to get "101".

Column layout (F 总库, 0-indexed):
  Col00 科类        Col01 招生类型    Col02 院校代码    Col03 院校名称
  Col04 专业组代码  Col05 专业代码    Col06 专业名称    Col07 专业备注
  Col08 专业层次    Col09 计划人数    Col10 学制        Col11 专业组计划人数
  Col12 24专业组录取数 Col13 投档分   Col14 最低位次    Col15 24录取数
  Col16 24最低分    Col17 24最低位    Col18 24平均分    Col19 24平均位
  Col20 老高考批次  Col21 23录取数    Col22 23最低分    Col23 23最低位
  Col24 23平均分    Col25 23平均位    Col26 23最高分    Col27 23最高位
  Col28 老批次2     Col29-40 院校级(skip)
  Col41 专业水平    Col42 本专业硕士点 Col43 本专业博士点
  Col44 软科评级    Col45 软科排名    Col46 学科评估
  Col47 学费        Col48 选科要求
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
import openpyxl

from three_layer.field_comparator import compare_string

DATA_03 = Path(__file__).resolve().parents[3] / "data" / "03_专家版主表"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


def _derive_batch_node_id(enroll_type: str, level: str) -> str | None:
    """Derive batchNodeId from F's 招生类型 + 专业层次."""
    # Normalize: strip leading "(" and trailing whitespace
    et = enroll_type.lstrip("(（").strip()

    if et.startswith("普通类") or et == "普通":
        if level in ("本科", "职教本科", "职业本科"):
            return "bkp_b"
        elif level == "专科":
            return "zkp"
    elif et.startswith("国家专项"):
        return "bkp_a_gjzx"
    elif et.startswith("高校专项"):
        return "bkp_gxzx"
    elif et.startswith("地方专项"):
        return "bkp_a_dfzx"
    elif et.startswith("区域教育均衡"):
        return "bkp_qyjh"
    # 提前批 sub-types not in enrollments
    return None


# Group-level: col_index → (year, field)
_F_GROUP_FIELDS = {
    12: ("2024", "batchEnrolled"),
    13: ("2024", "batchMin"),       # 投档分 = group-level min
    14: ("2024", "batchMinRank"),
}

# Major-level yearly: col_index → (year, field)
_F_YEARLY_FIELDS = {
    9:  ("2025", "plan"),
    15: ("2024", "enrolled"),
    16: ("2024", "min"),
    17: ("2024", "minRank"),
    18: ("2024", "avg"),
    19: ("2024", "avgRank"),
    21: ("2023", "enrolled"),
    22: ("2023", "min"),
    23: ("2023", "minRank"),
    24: ("2023", "avg"),
    25: ("2023", "avgRank"),
    26: ("2023", "max"),
    27: ("2023", "maxRank"),
}

# Quality: col_index → field
_F_QUALITY_FIELDS = {
    41: "level",
    42: "masterPoint",
    43: "doctoralPoint",
    44: "rating",
    45: "rank",
    46: "assessment",
}


def _safe(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _safe_num(v) -> int | float | None:
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        f = float(s)
        return int(f) if f == int(f) else f
    except (ValueError, OverflowError):
        return None


def _load_source_f() -> tuple[dict, dict, dict]:
    """Load Source F (总库 sheet) indexed by 5-field key."""
    path = DATA_03 / "曦鸿仕文化2025新高考专业组模拟3月版.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb["总库"]

    exact_index: dict[tuple, dict] = {}
    candidate_index: dict[tuple, list] = defaultdict(list)
    group_index: dict[tuple, dict] = {}
    skipped_batch = 0
    skipped_key = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        code = str(row[2]).strip().zfill(4) if row[2] else ""
        subject = _safe(row[0])  # 科类
        prof_code = _safe(row[5])
        enroll_type = _safe(row[1]) or ""
        level = _safe(row[8]) or ""
        # 专业组代码: "101组" → "101"
        group_code_raw = _safe(row[4]) or ""
        group_code = group_code_raw.replace("组", "").strip()
        prof_name = _safe(row[6])
        if not code or not subject or not prof_code:
            skipped_key += 1
            continue

        node_id = _derive_batch_node_id(enroll_type, level)
        if not node_id:
            skipped_batch += 1
            continue

        row_data: dict = {
            "profName": prof_name,
            "profCode": prof_code,
            "groupCode": group_code,
        }

        # Major yearly
        yearly: dict[str, dict] = {}
        for col_idx, (year, field) in _F_YEARLY_FIELDS.items():
            val = _safe_num(row[col_idx])
            if val is not None:
                yearly.setdefault(year, {})[field] = val
        if yearly:
            row_data["yearly"] = yearly

        # Quality
        quality: dict[str, str] = {}
        for col_idx, qfield in _F_QUALITY_FIELDS.items():
            val = _safe(row[col_idx])
            if val and qfield not in quality:
                quality[qfield] = val
        if quality:
            row_data["quality"] = quality

        # Index
        exact_key = (code, subject, node_id, group_code, prof_code)
        if exact_key not in exact_index:
            exact_index[exact_key] = row_data

        cand_key = (code, subject, node_id)
        candidate_index[cand_key].append(row_data)

        # Group-level
        grp_key = (code, subject, node_id, group_code)
        if grp_key not in group_index:
            grp_fields: dict[str, dict] = {}
            for col_idx, (year, field) in _F_GROUP_FIELDS.items():
                val = _safe_num(row[col_idx])
                if val is not None:
                    grp_fields.setdefault(year, {})[field] = val
            if grp_fields:
                group_index[grp_key] = grp_fields

    wb.close()

    print(f"  Skipped (no batch mapping): {skipped_batch}")
    print(f"  Skipped (missing key fields): {skipped_key}")
    return exact_index, candidate_index, group_index


def supplement():
    """Supplement enrollments.json from Source F."""
    enroll_path = OUTPUT_DIR / "enrollments.json"
    with open(enroll_path, "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    print("Loading Source F (曦鸿仕文化3月模拟版, 总库 sheet)...")
    exact_index, candidate_index, group_index = _load_source_f()
    print(f"  Exact index: {len(exact_index)} entries")
    print(f"  Candidate index: {len(candidate_index)} combos")
    print(f"  Group index: {len(group_index)} groups")

    stats = {
        "exact_match": 0,
        "confidence_match": 0,
        "no_match": 0,
        "fields_filled": defaultdict(int),
        "conflicts": 0,
        "groups_filled": defaultdict(int),
    }

    for school_code, subjects in enrollments["data"].items():
        for subject, enroll_list in subjects.items():
            for enroll in enroll_list:
                node_id = enroll.get("batchNodeId", "")

                for group in enroll["groups"]:
                    group_code = group.get("groupCode") or ""

                    # --- Group-level fill ---
                    grp_key = (school_code, subject, node_id, group_code)
                    grp_src = group_index.get(grp_key)
                    if grp_src:
                        gy = group.setdefault("groupYearly", {})
                        for year, fields in grp_src.items():
                            yr_dict = gy.setdefault(year, {})
                            for field, val in fields.items():
                                if yr_dict.get(field) is None:
                                    yr_dict[field] = val
                                    stats["groups_filled"][
                                        f"groupYearly.{year}.{field}"
                                    ] += 1
                                elif yr_dict[field] != val:
                                    stats["conflicts"] += 1

                    # --- Major-level fill ---
                    for major in group["majors"]:
                        prof_code = major.get("code", "")
                        major_name = major.get("name", "")

                        exact_key = (school_code, subject, node_id, group_code, prof_code)
                        src = exact_index.get(exact_key)

                        if src:
                            stats["exact_match"] += 1
                        else:
                            candidates = candidate_index.get(
                                (school_code, subject, node_id), []
                            )
                            best_score = 0.0
                            best_src = None
                            for c in candidates:
                                name_sim = compare_string(
                                    major_name, c.get("profName", "")
                                )
                                if name_sim > best_score:
                                    best_score = name_sim
                                    best_src = c
                            if best_score >= 0.90:
                                src = best_src
                                stats["confidence_match"] += 1
                            else:
                                stats["no_match"] += 1
                                continue

                        # Fill yearly
                        src_yearly = src.get("yearly", {})
                        for year, fields in src_yearly.items():
                            yr_dict = major.setdefault("yearly", {}).setdefault(year, {})
                            for field, val in fields.items():
                                if yr_dict.get(field) is None:
                                    yr_dict[field] = val
                                    stats["fields_filled"][
                                        f"yearly.{year}.{field}"
                                    ] += 1
                                elif yr_dict[field] != val:
                                    stats["conflicts"] += 1

                        # Fill quality
                        src_quality = src.get("quality", {})
                        quality = major.setdefault("quality", {})
                        for qf, qv in src_quality.items():
                            if not quality.get(qf):
                                if qf == "rank" and str(qv).isdigit():
                                    quality[qf] = int(qv)
                                else:
                                    quality[qf] = qv
                                stats["fields_filled"][f"quality.{qf}"] += 1
                            elif str(quality[qf]) != str(qv):
                                stats["conflicts"] += 1

    # Save
    with open(enroll_path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)

    print(f"\n=== F Supplement Summary ===")
    print(f"  exact_match: {stats['exact_match']}")
    print(f"  confidence_match: {stats['confidence_match']}")
    print(f"  no_match: {stats['no_match']}")
    print(f"  conflicts: {stats['conflicts']}")
    print(f"\n  Group fields filled:")
    for f, c in sorted(stats["groups_filled"].items()):
        print(f"    {f}: +{c}")
    print(f"\n  Major fields filled:")
    for f, c in sorted(stats["fields_filled"].items()):
        print(f"    {f}: +{c}")


if __name__ == "__main__":
    supplement()
