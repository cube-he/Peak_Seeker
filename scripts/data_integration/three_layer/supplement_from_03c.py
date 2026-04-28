# -*- coding: utf-8 -*-
"""Supplement enrollments.json with fields from 03/C (万能版).

C source: data/03_专家版主表/四川2025新高考专业组三维大数据正式版(机构万能版0624.xlsx
47759 rows × 61 cols. Independent vendor source (not derived from A/H).

Key contributions over A+H:
  - yearly.2023.plan (Col39) / yearly.2024.plan (Col38): fill plan gaps
  - yearly.2023.maxRank (Col54): 63% coverage, currently 65.5% filled → potential +15%
  - Other yearly score backfill (23/24)
  - Quality fields (marginal, most already from A/H)

Column layout (C, 0-indexed):
  Col00 批次        Col01 招生类型    Col02 批次备注    Col03 老批次
  Col04 院校代码    Col05 院校名称    Col06 所在省      Col07 城市
  Col08 院校档次    Col09 院校背景    Col10 变迁史      Col11 隶属单位
  Col12 转专业      Col13 城市水平    Col14 类型        Col15 大学排名
  Col16 硕士点数    Col17 博士点数    Col18 保研率      Col19 院校专业组
  Col20 院校专业组专业批次  Col21 专业组代码  Col22 专业代码  Col23 专业名称
  Col24 专业备注    Col25 院校备注    Col26 类别        Col27 软科评级
  Col28 专业排名    Col29 学科评估    Col30 专业水平    Col31 硕士点
  Col32 博士点      Col33 组内专业    Col34 门类        Col35 专业类
  Col36 25专业组计划 Col37 25计划     Col38 24计划      Col39 23计划
  Col40 24专业组录取数 Col41 24专业组最低分 Col42 24专业组最低位
  Col43 24最低分    Col44 24最低位    Col45 24平均分    Col46 24平均位
  Col47 24最高分    Col48 24最高位    Col49 23最低分    Col50 23最低位
  Col51 23平均分    Col52 23平均位    Col53 23最高分    Col54 23最高位
  Col55 2025招生章程 Col56 学制       Col57 学费        Col58 科类
  Col59 选科要求    Col60 是否新增
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
import openpyxl

from three_layer.field_comparator import compare_string

DATA_03 = Path(__file__).resolve().parents[3] / "data" / "03_专家版主表"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

_C_BATCH_MAP = {
    "本科批B段": "bkp_b",
    "专科批": "zkp",
    "本科批A段(国家专项)": "bkp_a_gjzx",
    "本科批(高校专项)": "bkp_gxzx",
    "本科批A段(地方专项)": "bkp_a_dfzx",
    "本科批(区域教育均衡发展专项)": "bkp_qyjh",
}

# Group-level yearly: col_index → (year, field)
_C_GROUP_FIELDS = {
    40: ("2024", "batchEnrolled"),
    41: ("2024", "batchMin"),
    42: ("2024", "batchMinRank"),
}

# Major-level yearly: col_index → (year, field)
_C_YEARLY_FIELDS = {
    37: ("2025", "plan"),
    38: ("2024", "plan"),
    39: ("2023", "plan"),
    43: ("2024", "min"),
    44: ("2024", "minRank"),
    45: ("2024", "avg"),
    46: ("2024", "avgRank"),
    47: ("2024", "max"),
    48: ("2024", "maxRank"),
    49: ("2023", "min"),
    50: ("2023", "minRank"),
    51: ("2023", "avg"),
    52: ("2023", "avgRank"),
    53: ("2023", "max"),
    54: ("2023", "maxRank"),
}

# Major-level quality: col_index → field
_C_QUALITY_FIELDS = {
    27: "rating",
    28: "majorRank",
    29: "assessment",
    30: "level",
    31: "masterPoint",
    32: "doctoralPoint",
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


def _load_source_c() -> tuple[dict, dict, dict]:
    """Load Source C indexed by 5-field key.

    Returns:
      exact_index: (school, subject, batchNodeId, groupCode, profCode) → row_data
      candidate_index: (school, subject, batchNodeId) → [row_data]
      group_index: (school, subject, batchNodeId, groupCode) → {year: {field: val}}
    """
    path = DATA_03 / "四川2025新高考专业组三维大数据正式版(机构万能版0624.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active

    exact_index: dict[tuple, dict] = {}
    candidate_index: dict[tuple, list] = defaultdict(list)
    group_index: dict[tuple, dict] = {}
    skipped_batch = 0
    skipped_key = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        # C has different column positions than A/H
        code = str(row[4]).strip().zfill(4) if row[4] else ""
        subject = _safe(row[58])  # 科类
        prof_code = _safe(row[22])
        batch_raw = _safe(row[0]) or ""
        group_code = _safe(row[21]) or ""
        prof_name = _safe(row[23])
        if not code or not subject or not prof_code:
            skipped_key += 1
            continue

        node_id = _C_BATCH_MAP.get(batch_raw)
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
        for col_idx, (year, field) in _C_YEARLY_FIELDS.items():
            val = _safe_num(row[col_idx])
            if val is not None:
                yearly.setdefault(year, {})[field] = val
        if yearly:
            row_data["yearly"] = yearly

        # Quality
        quality: dict[str, str] = {}
        for col_idx, qfield in _C_QUALITY_FIELDS.items():
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
            for col_idx, (year, field) in _C_GROUP_FIELDS.items():
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
    """Supplement enrollments.json from Source C."""
    enroll_path = OUTPUT_DIR / "enrollments.json"
    with open(enroll_path, "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    print("Loading Source C (万能版)...")
    exact_index, candidate_index, group_index = _load_source_c()
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

    print(f"\n=== C Supplement Summary ===")
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
