# -*- coding: utf-8 -*-
"""Build enrollments.json from 01/专业分数线 (2022-2025).

Uses 2025 as skeleton (has 专业组), fills 2022-2024 scores into yearly.
Two-level scores:
  - u* fields (uMinScore etc.) = 院校/专业组级投档线 → groupYearly
  - normal fields (minScore etc.) = 专业级分数 → major.yearly

Old gaokao mapping: 理科→物理, 文科→历史, 本一/本二→bkp_b, 专科→zkp
"""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

from three_layer.batch_normalizer import normalize_batch, BatchNormalizeError

DATA_01 = Path(__file__).resolve().parents[3] / "data" / "01_核心录取数据"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

# Old gaokao subject mapping
_SUBJECT_MAP = {"理科": "物理", "文科": "历史", "物理": "物理", "历史": "历史"}

# Batch short name → batchNodeId (covers old gaokao + 01 API names)
_BATCH_SHORT_MAP = {
    # Old gaokao (2022-2024)
    "本一": "bkp_b",
    "本二": "bkp_b",
    # 01 API names (2025)
    "本科B": "bkp_b",
    "专科": "zkp",
    "本科A(国家专项)": "bkp_a_gjzx",
    "本科A(地方专项)": "bkp_a_dfzx",
    "本科(高校专项)": "bkp_gxzx",
    "本科(区域均衡专项)": "bkp_qyjh",
    "本科(高水平运动队)": "bkp_gspyd",
}


def _safe_int(v) -> int | None:
    if v is None or v == "" or v == 0 or v == "0":
        return None
    try:
        return int(v)
    except (ValueError, TypeError):
        return None


def _safe_float(v) -> float | None:
    if v is None or v == "" or v == 0 or v == "0":
        return None
    try:
        return round(float(v), 2)
    except (ValueError, TypeError):
        return None


def _parse_group_code(source_name: str) -> str | None:
    """Extract group code from 'xxx(专业组101)' → '101'."""
    m = re.search(r'专业组(\d+)', source_name or '')
    return m.group(1) if m else None


def _normalize_batch(batch_raw: str) -> str | None:
    """Map batch short name to batchNodeId."""
    if not batch_raw:
        return None
    # Try old gaokao map first
    if batch_raw in _BATCH_SHORT_MAP:
        return _BATCH_SHORT_MAP[batch_raw]
    # Try normalizer
    try:
        return normalize_batch(batch_raw)
    except BatchNormalizeError:
        return None


def _load_year(year: str) -> list[dict]:
    """Load one year of 专业分数线."""
    path = DATA_01 / f"专业分数线_四川_{year}.json"
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def build_enrollments() -> dict:
    """Build complete enrollment tree from 01/专业分数线 2022-2025."""

    # ── Phase 1: Build skeleton from 2025 (has 专业组) ──
    data_2025 = _load_year("2025")

    # Key structure: school → subject → (batchNodeId) → groupCode → profCode → record
    skeleton: dict = defaultdict(  # school_code
        lambda: defaultdict(  # subject
            lambda: defaultdict(  # batch_node_id
                lambda: defaultdict(  # group_code
                    lambda: {}  # prof_code → record dict
                )
            )
        )
    )

    unmapped_batches = set()

    for r in data_2025:
        code = str(r.get("collegeEnrollCode", "")).strip().zfill(4)
        subject = _SUBJECT_MAP.get(r.get("course", ""), "")
        if not code or not subject:
            continue

        batch_node = _normalize_batch(r.get("batch", ""))
        if not batch_node:
            unmapped_batches.add(r.get("batch", ""))
            continue

        group_code = _parse_group_code(r.get("collegeSourceName", ""))
        prof_code = str(r.get("professionEnrollCode", "")).strip()
        if not prof_code:
            continue

        skeleton[code][subject][batch_node][group_code or "000"][prof_code] = {
            "code": prof_code,
            "name": r.get("professionName", ""),
            "majorNote": r.get("remark") or None,
            "duration": _safe_int(r.get("learnYear")),
            "tuition": _safe_int(r.get("cost")),
            "category": None,  # not in 01 data, will be filled from 03
            "discipline": None,
            "subjectReq": r.get("chooseSubjectText") or r.get("chooseSubject2") or None,
            "oldBatch": r.get("batch"),  # raw batch name for reference
            "quality": {},
            "yearly": {
                "2025": {
                    "plan": _safe_int(r.get("planNum")),
                    "enrolled": _safe_int(r.get("enterNum")),
                    "min": _safe_int(r.get("minScore")),
                    "minRank": _safe_int(r.get("minRank")),
                    "avg": _safe_float(r.get("avgScore")),
                    "avgRank": _safe_int(r.get("avgRank")),
                    "max": _safe_int(r.get("maxScore")),
                    "maxRank": _safe_int(r.get("maxRank")),
                },
            },
            # Group-level data (from u* fields, stored temporarily)
            "_groupYearly_2025": {
                "groupPlan": _safe_int(r.get("planNum")),  # planNum at u-level
                "filingMin": _safe_int(r.get("uMinScore")),
                "filingMinRank": _safe_int(r.get("uMinRank")),
                "groupEnrolled": _safe_int(r.get("uEnterNum")),
                "groupMin": _safe_int(r.get("uMinScore")),
                "groupMinRank": _safe_int(r.get("uMinRank")),
            },
            "_schoolName": r.get("collegeName", ""),
            "_nationalCode": str(r.get("collegeCode", "")),
        }

    if unmapped_batches:
        print(f"WARNING: unmapped batches in 2025: {unmapped_batches}")

    # ── Phase 2: Fill 2022-2024 scores into yearly ──
    for year in ["2024", "2023", "2022"]:
        data_year = _load_year(year)
        matched = 0
        unmatched = 0

        for r in data_year:
            code = str(r.get("collegeEnrollCode", "")).strip().zfill(4)
            raw_subject = r.get("course", "")
            subject = _SUBJECT_MAP.get(raw_subject, "")
            prof_code = str(r.get("professionEnrollCode", "")).strip()
            if not code or not subject or not prof_code:
                continue

            # Find matching major in skeleton
            # Try all batch nodes for this school+subject (old gaokao batch may differ)
            found = False
            for batch_node in skeleton[code][subject]:
                for group_code in skeleton[code][subject][batch_node]:
                    if prof_code in skeleton[code][subject][batch_node][group_code]:
                        major = skeleton[code][subject][batch_node][group_code][prof_code]
                        major["yearly"][year] = {
                            "plan": _safe_int(r.get("planNum")),
                            "enrolled": _safe_int(r.get("enterNum")),
                            "min": _safe_int(r.get("minScore")),
                            "minRank": _safe_int(r.get("minRank")),
                            "avg": _safe_float(r.get("avgScore")),
                            "avgRank": _safe_int(r.get("avgRank")),
                            "max": _safe_int(r.get("maxScore")),
                            "maxRank": _safe_int(r.get("maxRank")),
                        }
                        # Also store group-level for that year
                        major[f"_groupYearly_{year}"] = {
                            "batchMin": _safe_int(r.get("uMinScore")),
                            "batchMinRank": _safe_int(r.get("uMinRank")),
                            "batchEnrolled": _safe_int(r.get("uEnterNum")),
                        }
                        found = True
                        matched += 1
                        break
                if found:
                    break

            if not found:
                unmatched += 1

        print(f"  {year}: matched {matched}, unmatched {unmatched}")

    # ── Phase 3: Assemble output JSON ──
    output_data = {}
    total_records = 0

    for school_code in sorted(skeleton.keys()):
        school_data = {}
        for subject in sorted(skeleton[school_code].keys()):
            enrollments = []
            for batch_node in sorted(skeleton[school_code][subject].keys()):
                groups = []
                for group_code in sorted(skeleton[school_code][subject][batch_node].keys()):
                    majors_raw = skeleton[school_code][subject][batch_node][group_code]

                    # Extract group-level yearly from first major's temp fields
                    first_major = next(iter(majors_raw.values())) if majors_raw else {}
                    group_yearly = {}
                    gy_2025 = first_major.get("_groupYearly_2025", {})
                    if any(v is not None for v in gy_2025.values()):
                        group_yearly["2025"] = gy_2025
                    for yr in ["2024", "2023", "2022"]:
                        gy = first_major.get(f"_groupYearly_{yr}", {})
                        if any(v is not None for v in gy.values()):
                            group_yearly[yr] = gy

                    major_list = []
                    for prof_code, m in sorted(majors_raw.items()):
                        # Clean up temp fields
                        clean = {k: v for k, v in m.items() if not k.startswith("_")}
                        major_list.append(clean)
                        total_records += 1

                    groups.append({
                        "groupCode": group_code if group_code != "000" else None,
                        "subjectReq": major_list[0].get("subjectReq") if major_list else None,
                        "note": None,
                        "groupYearly": group_yearly if group_yearly else {},
                        "majors": major_list,
                    })

                # Determine enrollment type from batch_node
                etype = _enrollment_type_from_node(batch_node)
                enrollments.append({
                    "batchNodeId": batch_node,
                    "enrollmentType": etype,
                    "groups": groups,
                })

            school_data[subject] = enrollments
        output_data[school_code] = school_data

    return {
        "meta": {
            "source": "01_核心录取数据/专业分数线_四川_2022-2025",
            "batchTreeRef": "batch_tree_2025.json",
            "schoolRegistryRef": "school_registry.json",
            "totalRecords": total_records,
            "schools": len(output_data),
            "years": ["2025", "2024", "2023", "2022"],
        },
        "data": output_data,
    }


def _enrollment_type_from_node(node_id: str) -> str:
    """Derive enrollment type from batch node ID."""
    # Load batch_tree for lookup
    tree_path = OUTPUT_DIR / "batch_tree_2025.json"
    if not hasattr(_enrollment_type_from_node, "_cache"):
        with open(tree_path, "r", encoding="utf-8") as f:
            tree = json.load(f)
        _enrollment_type_from_node._cache = {}
        _collect_types(tree["tree"], _enrollment_type_from_node._cache)

    return _enrollment_type_from_node._cache.get(node_id, node_id)


def _collect_types(nodes: list, cache: dict):
    for n in nodes:
        if "enrollmentType" in n:
            cache[n["id"]] = n["enrollmentType"]
        if "children" in n:
            _collect_types(n["children"], cache)


def generate(output_dir: Path | None = None) -> Path:
    out = output_dir or OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / "enrollments.json"
    enrollments = build_enrollments()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)
    meta = enrollments["meta"]
    print(f"\nWritten {meta['totalRecords']} records, {meta['schools']} schools → {path}")
    return path


if __name__ == "__main__":
    generate()
