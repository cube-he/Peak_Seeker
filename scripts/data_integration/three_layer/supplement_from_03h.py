# -*- coding: utf-8 -*-
"""Supplement enrollments.json with fields from 03/H (清洗后修改版).

H source: data/03_专家版主表/2026四川高考志愿_清洗后_修改.xlsx (48132 rows × 87 cols)

Key contributions over A:
  - Group-level: 25投档最低分/位次 (Col21-22), 25专业组录取人数/最低分/位次 (Col23-25)
  - Group-level: 24专业组最低分/位次/录取人数 (Col33-35)
  - Major-level: various avgRank/maxRank across years (currently ~0%)
  - Major-level: additional yearly scores where A was sparse
  - Quality: 软科评级/排名, 学科评估, 专业水平, 硕博点 etc.

Column layout (H, 0-indexed):
  Col00 院校        Col01 院校代码    Col02 专业组代码  Col03 院校专业组
  Col04 院校备注    Col05 专业        Col06 专业代码    Col07 专业类
  Col08 门类        Col09 专业备注    Col10 科目        Col11 选科要求
  Col12 类型        Col13 批次        Col14 老批次      Col15 是否新增
  Col16 25专业组计划 Col17 计划人数   Col18 学制        Col19 学费
  Col20 组内专业    Col21 25投档最低分 Col22 25投档最低位次
  Col23 25专业组录取人数 Col24 25专业组最低分 Col25 25专业组最低位次
  Col26 25录取人数  Col27 25最低分    Col28 25最低位次
  Col29 25平均分    Col30 25平均位次  Col31 25最高分    Col32 25最高位次
  Col33 24专业组最低分 Col34 24专业组最低分位次 Col35 24专业组录取人数
  Col36 24录取人数  Col37 24最低分    Col38 24最低分位次
  Col39 24平均分    Col40 24平均位    Col41 24最高分    Col42 24最高位
  Col43 23录取人数  Col44 23最低分    Col45 23最低分位次
  Col46 23平均分    Col47 23平均位    Col48 23最高分    Col49 23最高位
  Col50 22录取人数  Col51 22最低分    Col52 22最低分位次
  Col53 22平均分    Col54 22平均分位次 Col55 22最高分   Col56 22最高分位次
  Col57-70 院校级字段(省份/城市/标签等, skip, belongs to school_registry)
  Col71 学科评估等级 Col72 软科评级   Col73 软科排名    Col74 学科评估
  Col75 专业水平    Col76 是否国家特色 Col77 专业排名   Col78 专业荣誉
  Col79 本校硕士    Col80 本校博士    Col81 硕士点数量  Col82 硕士点专业
  Col83 博士点数量  Col84 博士点专业  Col85 本专业硕士点 Col86 本专业博士点
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
import openpyxl

from three_layer.field_comparator import compare_string

DATA_03 = Path(__file__).resolve().parents[3] / "data" / "03_专家版主表"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

# H batch (Col13) → batchNodeId.
# Only 6 of H's 11 batch values exist in enrollments; the other 5
# (本科提前批A段/B段, 专科提前批, 本科提前批(国家/高校专项)) are skipped.
_H_BATCH_MAP = {
    "本科批B段": "bkp_b",
    "专科批": "zkp",
    "本科批A段(国家专项)": "bkp_a_gjzx",
    "本科批(高校专项)": "bkp_gxzx",
    "本科批A段(地方专项)": "bkp_a_dfzx",
    "本科批(区域教育均衡发展专项)": "bkp_qyjh",
}

# Group-level yearly fields: col_index → (year, field_name)
_H_GROUP_FIELDS = {
    21: ("2025", "filingMin"),
    22: ("2025", "filingMinRank"),
    23: ("2025", "groupEnrolled"),
    24: ("2025", "groupMin"),
    25: ("2025", "groupMinRank"),
    33: ("2024", "batchMin"),
    34: ("2024", "batchMinRank"),
    35: ("2024", "batchEnrolled"),
}

# Major-level yearly fields: col_index → (year, field_name)
_H_YEARLY_FIELDS = {
    17: ("2025", "plan"),
    26: ("2025", "enrolled"),
    27: ("2025", "min"),
    28: ("2025", "minRank"),
    29: ("2025", "avg"),
    30: ("2025", "avgRank"),
    31: ("2025", "max"),
    32: ("2025", "maxRank"),
    36: ("2024", "enrolled"),
    37: ("2024", "min"),
    38: ("2024", "minRank"),
    39: ("2024", "avg"),
    40: ("2024", "avgRank"),
    41: ("2024", "max"),
    42: ("2024", "maxRank"),
    43: ("2023", "enrolled"),
    44: ("2023", "min"),
    45: ("2023", "minRank"),
    46: ("2023", "avg"),
    47: ("2023", "avgRank"),
    48: ("2023", "max"),
    49: ("2023", "maxRank"),
    50: ("2022", "enrolled"),
    51: ("2022", "min"),
    52: ("2022", "minRank"),
    53: ("2022", "avg"),
    54: ("2022", "avgRank"),
    55: ("2022", "max"),
    56: ("2022", "maxRank"),
}

# Major-level quality fields: col_index → field_name
_H_QUALITY_FIELDS = {
    71: "assessment",       # 学科评估等级 (fallback if Col74 empty)
    72: "rating",           # 软科评级
    73: "rank",             # 软科排名
    74: "assessment",       # 学科评估 (primary)
    75: "level",            # 专业水平
    76: "isNationalFeatured",
    77: "majorRank",
    78: "honor",
    85: "masterPoint",      # 本专业硕士点
    86: "doctoralPoint",    # 本专业博士点
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


def _load_source_h() -> tuple[dict, dict, dict]:
    """Load Source H indexed by 5-field key.

    Returns:
      exact_index: (school, subject, batchNodeId, groupCode, profCode) → row_data
      candidate_index: (school, subject, batchNodeId) → [row_data]
      group_index: (school, subject, batchNodeId, groupCode) → {year: {field: val}}
    """
    path = DATA_03 / "2026四川高考志愿_清洗后_修改.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active

    exact_index: dict[tuple, dict] = {}
    candidate_index: dict[tuple, list] = defaultdict(list)
    group_index: dict[tuple, dict] = {}
    skipped_batch = 0
    skipped_key = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        code = str(row[1]).strip().zfill(4) if row[1] else ""
        subject = _safe(row[10])
        prof_code = _safe(row[6])
        batch_raw = _safe(row[13]) or ""
        group_code = _safe(row[2]) or ""
        prof_name = _safe(row[5])
        if not code or not subject or not prof_code:
            skipped_key += 1
            continue

        node_id = _H_BATCH_MAP.get(batch_raw)
        if not node_id:
            skipped_batch += 1
            continue

        # -- Collect row data --
        row_data: dict = {
            "profName": prof_name,
            "profCode": prof_code,
            "groupCode": group_code,
        }

        # Major yearly
        yearly: dict[str, dict] = {}
        for col_idx, (year, field) in _H_YEARLY_FIELDS.items():
            val = _safe_num(row[col_idx])
            if val is not None:
                yearly.setdefault(year, {})[field] = val
        if yearly:
            row_data["yearly"] = yearly

        # Quality (Col74 takes priority over Col71 for "assessment")
        quality: dict[str, str] = {}
        for col_idx in sorted(_H_QUALITY_FIELDS.keys()):
            qfield = _H_QUALITY_FIELDS[col_idx]
            val = _safe(row[col_idx])
            if val and qfield not in quality:
                quality[qfield] = val
        if quality:
            row_data["quality"] = quality

        # -- Index --
        exact_key = (code, subject, node_id, group_code, prof_code)
        if exact_key not in exact_index:
            exact_index[exact_key] = row_data

        cand_key = (code, subject, node_id)
        candidate_index[cand_key].append(row_data)

        # Group-level (one per group, first row wins)
        grp_key = (code, subject, node_id, group_code)
        if grp_key not in group_index:
            grp_fields: dict[str, dict] = {}
            for col_idx, (year, field) in _H_GROUP_FIELDS.items():
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
    """Supplement enrollments.json from Source H."""
    enroll_path = OUTPUT_DIR / "enrollments.json"
    with open(enroll_path, "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    print("Loading Source H (2026四川高考志愿_清洗后_修改.xlsx)...")
    exact_index, candidate_index, group_index = _load_source_h()
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
                                    stats["groups_filled"][f"groupYearly.{year}.{field}"] += 1
                                elif yr_dict[field] != val:
                                    stats["conflicts"] += 1

                    # --- Major-level fill ---
                    for major in group["majors"]:
                        prof_code = major.get("code", "")
                        major_name = major.get("name", "")

                        # Phase 1: Exact 5-field match
                        exact_key = (school_code, subject, node_id, group_code, prof_code)
                        src = exact_index.get(exact_key)

                        if src:
                            stats["exact_match"] += 1
                        else:
                            # Phase 2: Confidence match within same school+subject+batch
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

                        # Fill yearly scores
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

    print(f"\n=== H Supplement Summary ===")
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
