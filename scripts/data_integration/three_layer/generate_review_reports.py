# -*- coding: utf-8 -*-
"""Generate review reports for cross-year matching quality.

Report 1: 不一致报告 — enrollments.json values vs 03/H ground truth
  For each year (2022-2024), compare min/avg/max/enrolled in enrollments
  against the 03/H source (most complete, 87 cols). Output mismatches.

Report 2: 待审核报告 — 10344 confidence 0.30-0.70 records
  Re-check historical_confidence_match.csv against current enrollments.
  Mark each as: FILLED_BY_03 (now has value), STILL_EMPTY, or N/A.

Output:
  three_layer_output/review_不一致记录.xlsx
  three_layer_output/review_待审核记录.xlsx
"""
from __future__ import annotations

import csv
import json
from collections import defaultdict
from pathlib import Path

import openpyxl
import pandas as pd

DATA_03 = Path(__file__).resolve().parents[3] / "data" / "03_专家版主表"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

# H batch → batchNodeId (same as supplement_from_03h.py)
_H_BATCH_MAP = {
    "本科批B段": "bkp_b",
    "专科批": "zkp",
    "本科批A段(国家专项)": "bkp_a_gjzx",
    "本科批(高校专项)": "bkp_gxzx",
    "本科批A段(地方专项)": "bkp_a_dfzx",
    "本科批(区域教育均衡发展专项)": "bkp_qyjh",
}

# H column layout for yearly scores (same as supplement_from_03h.py)
_H_YEARLY = {
    36: ("2024", "enrolled"), 37: ("2024", "min"), 38: ("2024", "minRank"),
    39: ("2024", "avg"), 40: ("2024", "avgRank"), 41: ("2024", "max"), 42: ("2024", "maxRank"),
    43: ("2023", "enrolled"), 44: ("2023", "min"), 45: ("2023", "minRank"),
    46: ("2023", "avg"), 47: ("2023", "avgRank"), 48: ("2023", "max"), 49: ("2023", "maxRank"),
    50: ("2022", "enrolled"), 51: ("2022", "min"), 52: ("2022", "minRank"),
    53: ("2022", "avg"), 54: ("2022", "avgRank"), 55: ("2022", "max"), 56: ("2022", "maxRank"),
}


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


def _load_h_truth() -> dict:
    """Load H source as ground truth, keyed by (school, subject, batchNodeId, groupCode, profCode)."""
    path = DATA_03 / "2026四川高考志愿_清洗后_修改.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active
    index = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        code = str(row[1]).strip().zfill(4) if row[1] else ""
        subject = str(row[10]).strip() if row[10] else ""
        prof_code = str(row[6]).strip() if row[6] else ""
        batch_raw = str(row[13]).strip() if row[13] else ""
        group_code = str(row[2]).strip() if row[2] else ""
        if not code or not subject or not prof_code:
            continue
        node_id = _H_BATCH_MAP.get(batch_raw)
        if not node_id:
            continue
        yearly = {}
        for col_idx, (year, field) in _H_YEARLY.items():
            val = _safe_num(row[col_idx])
            if val is not None:
                yearly.setdefault(year, {})[field] = val
        key = (code, subject, node_id, group_code, prof_code)
        if key not in index:
            index[key] = {
                "name": str(row[5]).strip() if row[5] else "",
                "school": str(row[0]).strip() if row[0] else "",
                "yearly": yearly,
            }
    wb.close()
    return index


def report_mismatches():
    """Compare enrollments yearly values against H ground truth."""
    print("Loading enrollments.json...")
    with open(OUTPUT_DIR / "enrollments.json", "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    print("Loading H ground truth...")
    h_truth = _load_h_truth()
    print(f"  H index: {len(h_truth)} entries")

    rows = []
    year_stats = defaultdict(lambda: {"comparable": 0, "match": 0, "mismatch": 0})

    for school_code, subjects in enrollments["data"].items():
        for subject, enroll_list in subjects.items():
            for enroll in enroll_list:
                node_id = enroll.get("batchNodeId", "")
                for group in enroll["groups"]:
                    group_code = group.get("groupCode") or ""
                    for major in group["majors"]:
                        prof_code = major.get("code", "")
                        key = (school_code, subject, node_id, group_code, prof_code)
                        h = h_truth.get(key)
                        if not h:
                            continue
                        e_yearly = major.get("yearly", {})
                        h_yearly = h.get("yearly", {})
                        for year in ["2022", "2023", "2024"]:
                            e_yr = e_yearly.get(year, {})
                            h_yr = h_yearly.get(year, {})
                            for field in ["enrolled", "min", "minRank", "avg", "max"]:
                                e_val = e_yr.get(field)
                                h_val = h_yr.get(field)
                                if e_val is not None and h_val is not None:
                                    year_stats[year]["comparable"] += 1
                                    if e_val == h_val:
                                        year_stats[year]["match"] += 1
                                    else:
                                        year_stats[year]["mismatch"] += 1
                                        rows.append({
                                            "院校代码": school_code,
                                            "院校名称": h["school"],
                                            "科目": subject,
                                            "批次": node_id,
                                            "专业组": group_code,
                                            "专业代码": prof_code,
                                            "专业名称": major.get("name", ""),
                                            "年份": year,
                                            "字段": field,
                                            "当前值": e_val,
                                            "03/H值": h_val,
                                            "差值": e_val - h_val if isinstance(e_val, (int, float)) and isinstance(h_val, (int, float)) else "",
                                        })

    # Summary
    print("\n=== 准确率对比 ===")
    total_comparable = 0
    total_mismatch = 0
    for year in ["2022", "2023", "2024"]:
        s = year_stats[year]
        acc = s["match"] / s["comparable"] * 100 if s["comparable"] else 0
        print(f"  {year}: {s['comparable']} 可比对, {s['match']} 一致, {s['mismatch']} 不一致 ({acc:.1f}%)")
        total_comparable += s["comparable"]
        total_mismatch += s["mismatch"]
    print(f"  总计: {total_comparable} 可比对, {total_mismatch} 不一致")

    # Output
    out = OUTPUT_DIR / "review_不一致记录.xlsx"
    df = pd.DataFrame(rows)
    if len(df) > 0:
        df = df.sort_values(["年份", "院校代码", "专业代码", "字段"])
    df.to_excel(out, index=False)
    print(f"\n→ {out} ({len(df)} rows)")
    return len(df)


def report_pending_review():
    """Re-check 10344 pending confidence matches against current enrollments."""
    print("\nLoading enrollments.json for pending review...")
    with open(OUTPUT_DIR / "enrollments.json", "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    # Build fast lookup: (school_code, subject) → {major_name → yearly}
    lookup = {}
    for school_code, subjects in enrollments["data"].items():
        for subject, enroll_list in subjects.items():
            for enroll in enroll_list:
                for group in enroll["groups"]:
                    for major in group["majors"]:
                        name = major.get("name", "")
                        mk = (school_code, subject, name)
                        if mk not in lookup:
                            lookup[mk] = major.get("yearly", {})

    csv_path = OUTPUT_DIR / "historical_confidence_match.csv"
    rows = []
    status_counts = defaultdict(int)
    with open(csv_path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            school_code = row["school_code"].strip().zfill(4)
            # field_name format: "yearly.2024"
            field_parts = row["field_name"].split(".")
            year = field_parts[1] if len(field_parts) > 1 else ""
            # new_value format: "min=542,rank=13989"
            new_val_str = row["new_value"]

            # Check if enrollments now has data for this year
            # Try multiple lookup strategies since CSV uses different keys
            subject = row.get("subject", "").strip()
            major_name = row.get("major_name", "").strip()
            mk = (school_code, subject, major_name)
            e_yearly = lookup.get(mk, {})
            yr_data = e_yearly.get(year, {})

            has_min = yr_data.get("min") is not None
            has_avg = yr_data.get("avg") is not None

            if has_min or has_avg:
                status = "已有值"
            else:
                status = "仍为空"
            status_counts[status] += 1

            rows.append({
                "院校代码": school_code,
                "院校名称": row.get("school_name", ""),
                "科目": subject,
                "批次": row.get("batch", ""),
                "专业代码": row.get("major_code", ""),
                "专业名称": major_name,
                "年份": year,
                "置信度": float(row["confidence"]),
                "匹配候选": row.get("current_value", ""),
                "候选值": new_val_str,
                "当前状态": status,
            })

    print(f"\n=== 待审核状态 ===")
    for s, c in status_counts.items():
        print(f"  {s}: {c}")

    out = OUTPUT_DIR / "review_待审核记录.xlsx"
    df = pd.DataFrame(rows)
    df = df.sort_values(["当前状态", "置信度"], ascending=[True, False])
    df.to_excel(out, index=False)
    print(f"\n→ {out} ({len(df)} rows)")
    return len(df)


if __name__ == "__main__":
    report_mismatches()
    report_pending_review()
