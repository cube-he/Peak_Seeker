# -*- coding: utf-8 -*-
"""Supplement enrollments.json with fields from 03/A (李老师专家版).

Exact match key: 院校代码 + 科类 + batchNodeId + 招生类别 + 专业组 + 专业代码
Confidence match: same school+subject+batch → name similarity ≥ 0.90

Source A columns (verified):
  Col02 批次 → normalize to batchNodeId
  Col03 批次备注 → enrollmentType
  Col04 科类 → subject
  Col05 院校代码 → school_code
  Col08 专业组代码 → groupCode
  Col09 专业代码 → majorCode
  Col21 门类, Col22 专业类, Col10 专业全称, Col23 是否新增
  Col64-69 软科评级/排名, 学科评估, 专业水平, 硕博点
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
import openpyxl

from three_layer.batch_normalizer import normalize_batch, BatchNormalizeError
from three_layer.field_comparator import compare_string
from three_layer.conflict_reporter import ConflictReporter, ConflictRecord

DATA_03 = Path(__file__).resolve().parents[3] / "data" / "03_专家版主表"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

# A 源批次 → batchNodeId 映射（从 batch_type 组合推导）
_A_BATCH_MAP = {
    ("本科批B段", "本科批B段普通类"): "bkp_b",
    ("专科批", "专科批"): "zkp",
    ("本科批A段(国家专项)", "本科批A段国家专项"): "bkp_a_gjzx",
    ("本科提前批B段", "本科提前批B段省级公费师范生"): "bktqp_b_sjgfsf",
    ("本科批(高校专项)", "本科批高校专项"): "bkp_gxzx",
    ("本科提前批A段", "本科提前批A段军事"): "bktqp_a_js",
    ("本科批A段(地方专项)", "本科批A段地方专项"): "bkp_a_dfzx",
    ("本科提前批B段", "本科提前批B段农村订单定向医学生"): "bktqp_b_ncddyx",
    ("本科提前批B段", "本科提前批B段地方优师"): "bktqp_b_dfyszx",
    ("本科批(区域教育均衡发展专项)", "本科批区域教育均衡发展专项"): "bkp_qyjh",
    ("专科提前批", "提前批专科定向培养军士生"): "zktqp_dxpyjs",
    ("本科批B段", "本科批B段预科"): "bkp_b",
    ("本科提前批B段", "本科提前批B段其他"): "bktqp_b_qt",
    ("本科提前批A段", "本科提前批A段公安、司法"): "bktqp_a_gasf",
    ("本科提前批B段", "本科提前批B段乡村振兴"): "bktqp_b_xczx",
    ("本科批(预科)", "省属预科"): "bkp_sxyk",
    ("本科批B段", "本科批B段民族班"): "bkp_b",
    ("本科提前批B段", "本科提前批B段国家公费师范生"): "bktqp_b_gjgfsf",
    ("本科提前批A段", "本科提前批A段综合考核试点"): "bktqp_a_zhpj",
    ("本科批B段", "本科批B段定向招生"): "bkp_b",
    ("专科提前批", "提前批专科航海类"): "zktqp_hh",
    ("本科提前批A段", "本科提前批A段航海类"): "bktqp_a_hh",
    ("本科提前批B段", "本科提前批B段国家优师专项"): "bktqp_b_gjyszx",
    ("专科提前批", "提前批专科公安、司法"): "zktqp_gasf",
    ("本科批B段", "应用本科"): "bkp_b",
    ("本科提前批(国家专项)", "本科提前批国家专项"): "bktqp_gjzx",
    ("本科提前批A段", "其他"): "bktqp_a_qt",
    ("本科提前批(高校专项)", "本科提前批高校专项"): "bktqp_gxzx",
    ("本科提前批A段", "本科提前批A段消防救援"): "bktqp_a_xfjy",
    ("本科提前批A段", "本科提前批A段飞行技术"): "bktqp_a_fxjs",
    ("本科批B段", "其他定向招生"): "bkp_b",
}


def _safe(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _load_source_a() -> tuple[dict, dict]:
    """Load Source A indexed by 6-field key and school+subject+batch key.

    Returns:
      exact_index: (school, subject, batchNodeId, groupCode, profCode) → fields
      candidate_index: (school, subject, batchNodeId) → [fields]
    """
    path = DATA_03 / "13-2026-四川-专家版.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active

    exact_index = {}
    candidate_index = defaultdict(list)
    unmapped = set()

    for i, row in enumerate(ws.iter_rows(min_row=4, values_only=True)):
        code = str(row[5]).strip().zfill(4) if row[5] else ""
        subject = _safe(row[4])
        prof_code = _safe(row[9])
        batch_raw = _safe(row[2]) or ""
        type_raw = _safe(row[3]) or ""
        group_code = _safe(row[8])
        if not code or not subject or not prof_code:
            continue

        # Normalize batch
        batch_key = (batch_raw, type_raw)
        node_id = _A_BATCH_MAP.get(batch_key)
        if not node_id:
            unmapped.add(batch_key)
            continue

        fields = {
            "profName": _safe(row[11]),
            "profCode": prof_code,
            "groupCode": group_code,
            "category": _safe(row[22]),
            "discipline": _safe(row[21]),
            "fullName": _safe(row[10]),
            "isNew": _safe(row[23]),
            "quality.rating": _safe(row[64]),
            "quality.rank": _safe(row[65]),
            "quality.assessment": _safe(row[66]),
            "quality.level": _safe(row[67]),
            "quality.masterPoint": _safe(row[68]),
            "quality.doctoralPoint": _safe(row[69]),
        }

        # 6-field exact key (without enrollmentType, use batchNodeId + groupCode + profCode)
        exact_key = (code, subject, node_id, group_code or "", prof_code)
        if exact_key not in exact_index:
            exact_index[exact_key] = fields

        # Candidate index for confidence matching
        cand_key = (code, subject, node_id)
        candidate_index[cand_key].append(fields)

    wb.close()

    if unmapped:
        print(f"  WARNING: {len(unmapped)} unmapped A batch combos")
        for u in list(unmapped)[:5]:
            print(f"    {u}")

    return exact_index, candidate_index


def supplement():
    """Supplement enrollments.json from Source A using 6-field matching."""
    enroll_path = OUTPUT_DIR / "enrollments.json"
    with open(enroll_path, "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    print("Loading Source A (6-field index)...")
    exact_index, candidate_index = _load_source_a()
    print(f"  Exact index: {len(exact_index)} entries")
    print(f"  Candidate index: {len(candidate_index)} school+subject+batch combos")

    reporter = ConflictReporter(output_dir=OUTPUT_DIR)

    stats = {
        "exact_match": 0,
        "confidence_match": 0,
        "no_match": 0,
        "fields_filled": defaultdict(int),
        "conflicts": 0,
    }

    for school_code, subjects in enrollments["data"].items():
        for subject, enroll_list in subjects.items():
            for enroll in enroll_list:
                node_id = enroll.get("batchNodeId", "")
                for group in enroll["groups"]:
                    group_code = group.get("groupCode") or ""
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
                            candidates = candidate_index.get((school_code, subject, node_id), [])
                            best_score = 0.0
                            best_src = None
                            for c in candidates:
                                name_sim = compare_string(major_name, c.get("profName", ""))
                                if name_sim > best_score:
                                    best_score = name_sim
                                    best_src = c
                            if best_score >= 0.90:
                                src = best_src
                                stats["confidence_match"] += 1
                            else:
                                stats["no_match"] += 1
                                continue

                        # Fill missing fields
                        _fill(major, "category", src.get("category"), stats)
                        _fill(major, "discipline", src.get("discipline"), stats)
                        _fill(major, "fullName", src.get("fullName"), stats)

                        is_new = src.get("isNew")
                        if is_new and major.get("isNew") is None:
                            major["isNew"] = is_new in ("是", "1", "True")
                            stats["fields_filled"]["isNew"] += 1

                        quality = major.setdefault("quality", {})
                        for qf in ["rating", "rank", "assessment", "level", "masterPoint", "doctoralPoint"]:
                            val = src.get(f"quality.{qf}")
                            if val and not quality.get(qf):
                                quality[qf] = int(val) if qf == "rank" and str(val).isdigit() else val
                                stats["fields_filled"][f"quality.{qf}"] += 1
                            elif val and quality.get(qf) and str(val) != str(quality.get(qf)):
                                stats["conflicts"] += 1

    # Save
    with open(enroll_path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)

    if reporter.count > 0:
        reporter.write("supplement_03a_conflicts.csv")

    print(f"\n=== Summary ===")
    print(f"  exact_match: {stats['exact_match']}")
    print(f"  confidence_match: {stats['confidence_match']}")
    print(f"  no_match: {stats['no_match']}")
    print(f"  conflicts: {stats['conflicts']}")
    print(f"\n  Fields filled:")
    for f, c in sorted(stats["fields_filled"].items()):
        print(f"    {f}: +{c}")


def _fill(major: dict, field: str, value, stats: dict):
    if value and not major.get(field):
        major[field] = value
        stats["fields_filled"][field] += 1


if __name__ == "__main__":
    supplement()
