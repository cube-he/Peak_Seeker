# -*- coding: utf-8 -*-
"""Fill 2022-2024 historical scores into enrollments.json using confidence matching.

For records where exact profCode match failed (old→new gaokao code changes),
uses full-field confidence matching within same school+subject to find the
best matching 2025 major and fill historical scores into its yearly data.

Uses: three_layer.field_comparator.compare_fields for scoring.
Output: updated enrollments.json + confidence_match_report.csv
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from three_layer.field_comparator import compare_string, compare_numeric, FieldDiff
from three_layer.conflict_reporter import ConflictReporter, ConflictRecord

DATA_01 = Path(__file__).resolve().parents[3] / "data" / "01_核心录取数据"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

_SUBJECT_MAP = {"理科": "物理", "文科": "历史", "物理": "物理", "历史": "历史"}

THRESHOLD_HIGH = 0.70
THRESHOLD_LOW = 0.30


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


def _score_match(src: dict, candidate: dict) -> float:
    """Compute confidence score between a historical record and a 2025 candidate.

    Fast path: if professionName matches exactly → 0.90+ directly.
    Otherwise: weighted multi-field comparison.
    """
    src_name = str(src.get("professionName", "")).strip()
    cand_name = str(candidate.get("name", "")).strip()

    # Fast path: exact name match is overwhelmingly likely to be the same major
    if src_name and cand_name and src_name == cand_name:
        # Bonus from stable identity fields (not year-varying values)
        bonus = 0.0
        src_mc = str(src.get("majorCode", "")).strip()
        cand_mc = str(candidate.get("majorCode", "")).strip()
        if src_mc and cand_mc and src_mc == cand_mc:
            bonus += 0.05
        return min(0.95 + bonus, 1.0)

    # Name highly similar (>0.8 fuzzy) — likely same major with minor naming change
    name_sim = compare_string(src_name, cand_name)
    if name_sim >= 0.8:
        return round(0.75 + name_sim * 0.15, 4)

    # General weighted comparison — only use identity fields (not year-varying values)
    # 学费/计划人数年年变，不能跨年比对；学制理论上不变但01源全空，也跳过
    total_weight = 0.0
    total_score = 0.0

    fields = [
        ("professionName", "name", 60, "string"),       # 专业名称：核心身份特征
        ("majorCode", "majorCode", 25, "string"),        # 学科代码：稳定标识
        ("remark", "majorNote", 15, "string"),           # 备注：含方向信息，有助区分同名专业
    ]

    for src_field, cand_field, weight, ftype in fields:
        sv = src.get(src_field)
        cv = candidate.get(cand_field)

        # Normalize empty-ish values to None
        if sv is not None and str(sv).strip() in ("", "0", "None"):
            sv = None
        if cv is not None and str(cv).strip() in ("", "0", "None"):
            cv = None

        # Both empty → skip this field entirely (no free points)
        if sv is None and cv is None:
            continue

        # One side empty → penalize
        if sv is None or cv is None:
            sim = 0.0
        elif ftype == "string":
            sim = compare_string(str(sv), str(cv))
        elif ftype == "numeric":
            sim = compare_numeric(
                _safe_int(sv) or _safe_float(sv),
                _safe_int(cv) or _safe_float(cv)
            )
        else:
            sim = 0.0

        total_weight += weight
        total_score += sim * weight

    return round(total_score / total_weight, 4) if total_weight > 0 else 0.0


def _build_candidate_index(enrollments: dict) -> dict:
    """Build (school_code, subject) → list of (major_dict, enroll_idx, group_idx, major_idx) from enrollments."""
    index = defaultdict(list)
    for school_code, subjects in enrollments["data"].items():
        for subject, enroll_list in subjects.items():
            for ei, enroll in enumerate(enroll_list):
                for gi, group in enumerate(enroll["groups"]):
                    for mi, major in enumerate(group["majors"]):
                        cand = {
                            "name": major.get("name", ""),
                            "code": major.get("code", ""),
                            "majorCode": major.get("category", ""),  # majorCode mapped to category if available
                            "majorNote": major.get("majorNote", ""),
                            "duration": major.get("duration"),
                            "tuition": major.get("tuition"),
                            "plan_2025": (major.get("yearly", {}).get("2025", {}) or {}).get("plan"),
                            "_path": (ei, gi, mi),
                        }
                        index[(school_code, subject)].append(cand)
    return index


def fill_scores():
    """Fill 2022-2024 historical scores using confidence matching."""
    # Load current enrollments
    enroll_path = OUTPUT_DIR / "enrollments.json"
    with open(enroll_path, "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    candidate_index = _build_candidate_index(enrollments)
    reporter = ConflictReporter(output_dir=OUTPUT_DIR)

    stats = {
        "exact_already": 0,  # already filled by exact match
        "confidence_filled": 0,
        "review_needed": 0,
        "no_match": 0,
        "school_missing": 0,
    }

    for year in ["2024", "2023", "2022"]:
        print(f"\nProcessing {year}...")
        path = DATA_01 / f"专业分数线_四川_{year}.json"
        with open(path, "r", encoding="utf-8") as f:
            data_year = json.load(f)

        year_stats = {"confidence": 0, "review": 0, "no_match": 0, "skip": 0}

        for r in data_year:
            code = str(r.get("collegeEnrollCode", "")).strip().zfill(4)
            subject = _SUBJECT_MAP.get(r.get("course", ""), "")
            prof_code = str(r.get("professionEnrollCode", "")).strip()
            if not code or not subject or not prof_code:
                continue

            # Skip if no scores to fill
            min_score = _safe_int(r.get("minScore"))
            if min_score is None:
                year_stats["skip"] += 1
                continue

            # Check if already filled (exact match in build_enrollments_v2)
            already = False
            for school_code, subjects in enrollments["data"].items():
                if school_code != code:
                    continue
                for subj, enroll_list in subjects.items():
                    if subj != subject:
                        continue
                    for enroll in enroll_list:
                        for group in enroll["groups"]:
                            for major in group["majors"]:
                                if major.get("code") == prof_code and year in major.get("yearly", {}):
                                    yd = major["yearly"][year]
                                    if yd.get("min") is not None:
                                        already = True
                                        break
                            if already:
                                break
                        if already:
                            break
                    if already:
                        break
                if already:
                    break

            if already:
                stats["exact_already"] += 1
                continue

            # Confidence match
            candidates = candidate_index.get((code, subject), [])
            if not candidates:
                stats["school_missing"] += 1
                continue

            best_score = 0.0
            best_cand = None
            for cand in candidates:
                score = _score_match(r, cand)
                if score > best_score:
                    best_score = score
                    best_cand = cand

            yearly_data = {
                "plan": _safe_int(r.get("planNum")),
                "enrolled": _safe_int(r.get("enterNum")),
                "min": min_score,
                "minRank": _safe_int(r.get("minRank")),
                "avg": _safe_float(r.get("avgScore")),
                "avgRank": _safe_int(r.get("avgRank")),
                "max": _safe_int(r.get("maxScore")),
                "maxRank": _safe_int(r.get("maxRank")),
            }

            if best_score >= THRESHOLD_HIGH and best_cand:
                # Auto-fill
                ei, gi, mi = best_cand["_path"]
                major = enrollments["data"][code][subject][ei]["groups"][gi]["majors"][mi]
                if year not in major.get("yearly", {}):
                    major.setdefault("yearly", {})[year] = yearly_data
                    stats["confidence_filled"] += 1
                    year_stats["confidence"] += 1

            elif best_score >= THRESHOLD_LOW and best_cand:
                # Needs review
                reporter.add_conflict(ConflictRecord(
                    school_code=code,
                    school_name=r.get("collegeName", ""),
                    subject=subject,
                    batch=r.get("batch", ""),
                    major_code=prof_code,
                    major_name=r.get("professionName", ""),
                    field_name=f"yearly.{year}",
                    current_value=f"best_match={best_cand['name']}(code={best_cand['code']})",
                    new_value=f"min={min_score},rank={_safe_int(r.get('minRank'))}",
                    source=f"01_专业分数线_{year}",
                    match_type="confidence",
                    confidence=best_score,
                    diff_type="numeric_large",
                ))
                stats["review_needed"] += 1
                year_stats["review"] += 1

            else:
                stats["no_match"] += 1
                year_stats["no_match"] += 1

        print(f"  {year}: confidence={year_stats['confidence']}, review={year_stats['review']}, no_match={year_stats['no_match']}, skip={year_stats['skip']}")

    # Save updated enrollments
    with open(enroll_path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)

    # Save report
    if reporter.count > 0:
        csv_path = reporter.write("historical_confidence_match.csv")
        print(f"\nReview needed: {reporter.count} → {csv_path}")

    print(f"\n=== Summary ===")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    fill_scores()
