# -*- coding: utf-8 -*-
"""P2 Task 9: Cross-source diff report for 2025 data.

Generates two xlsx artefacts from the 2025 outer-join result:
  交叉差异报告_2025.xlsx — every field-level diff between 03 and 01 for
                          rows where both sources matched (merge == 'both')
  异常差异_2025.xlsx      — filtered subset: only rows exceeding anomaly
                          thresholds (sorted by |差值| desc, NaN last)

Why two files: the full diff log is the audit trail; the anomaly list is the
actionable "must-check" shortlist for data reviewers.

2025-only scope: historical years (2022-2024) deferred to Task 7b due to
wide/long schema and batch/course translation complexity (ISSUE-013).
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from scripts.data_integration.lib.diff_rules import is_anomaly
from scripts.data_integration.p2_join import join_03_and_01_2025

logger = logging.getLogger(__name__)

# Repo root: this file is at scripts/data_integration/p2_diff_report.py,
# so parents[2] = repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]

PRIMARY_KEY = ["数据年份", "院校代码_国标", "专业代码", "批次", "科目"]

# Each tuple: (label, col_03, col_01, field_type)
# col_03 is the bare 03-side column name; col_01 is the _01-suffixed name from the merge.
OVERLAP_FIELDS = [
    # (label, col_03, col_01, ftype)
    ("最低分", "最低分", "最低分_01", "score"),
    ("平均分", "平均分", "平均分_01", "score"),
    ("最高分", "最高分", "最高分_01", "score"),
    ("最低位次", "最低位次", "最低位次_01", "rank"),
    ("平均位次", "平均位次", "平均位次_01", "rank"),
    ("最高位次", "最高位次", "最高位次_01", "rank"),
    ("计划人数", "计划人数", "计划人数_01", "count"),
    ("录取人数", "录取人数", "录取人数_01", "count"),
    ("专业名称", "专业", "专业名称_01", "text"),
    ("院校名称", "院校名称", "院校名称_01", "text"),
]


def build_diff_rows(joined: pd.DataFrame) -> pd.DataFrame:
    """Iterate both-side rows × overlap fields. Emit one diff row per (pk, field)
    where values differ (after null filtering). Used by CLI to write xlsx.

    Skips:
    - rows where _merge != 'both' (left_only / right_only handled elsewhere)
    - (col_03, col_01) pairs absent from the DataFrame
    - field pairs where both values are null
    - field pairs where both values are present and equal

    Emits for:
    - one side null, other non-null (supplementary fill candidate; anomaly=False)
    - both present but unequal (may be anomaly depending on field type + magnitude)
    """
    both = joined[joined["_merge"] == "both"].copy()
    rows = []
    for _, r in both.iterrows():
        pk_values = {k: r[k] for k in PRIMARY_KEY}
        for label, col_03, col_01, ftype in OVERLAP_FIELDS:
            if col_03 not in both.columns or col_01 not in both.columns:
                continue
            lhs, rhs = r.get(col_03), r.get(col_01)
            # Both missing: skip — no information to diff
            if pd.isna(lhs) and pd.isna(rhs):
                continue
            # Both present and equal: skip — no diff
            if (not pd.isna(lhs)) and (not pd.isna(rhs)) and lhs == rhs:
                continue
            # Compute numeric diff when both sides are present
            diff = None
            if ftype in ("score", "rank", "count") and not (pd.isna(lhs) or pd.isna(rhs)):
                try:
                    diff = float(rhs) - float(lhs)
                except (TypeError, ValueError):
                    diff = None
            rows.append({
                **pk_values,
                "字段": label,
                "03值": lhs,
                "01值": rhs,
                "差值": diff,
                "类型": ftype,
                # Cast to Python bool so downstream `is True/False` identity
                # checks work regardless of whether lhs/rhs came from numpy.
                "anomaly": bool(is_anomaly(ftype, lhs, rhs)),
            })
    df = pd.DataFrame(rows)
    # Keep 'anomaly' as Python bool (not np.bool_) so downstream identity checks
    # (`is True` / `is False`) work correctly. astype(object) preserves Python
    # bool identity rather than numpy's bool subtype.
    if not df.empty and "anomaly" in df.columns:
        df["anomaly"] = df["anomaly"].astype(object)
    return df


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    logger.info("P2 diff report: loading 2025 join …")
    merged = join_03_and_01_2025()

    both_count = int((merged["_merge"] == "both").sum())
    logger.info("P2 diff report: both-side rows = %d", both_count)

    logger.info("P2 diff report: building diff rows …")
    diff_df = build_diff_rows(merged)
    total_diffs = len(diff_df)
    logger.info("P2 diff report: total diff rows = %d", total_diffs)

    # Anomaly subset
    if total_diffs > 0:
        anomaly_df = diff_df[diff_df["anomaly"] == True].copy()
        # Sort by |差值| descending; NaN last (rows where diff is None / one-side-null)
        anomaly_df = (
            anomaly_df
            .assign(abs_diff=anomaly_df["差值"].abs())
            .sort_values("abs_diff", ascending=False, na_position="last")
            .drop(columns=["abs_diff"])
        )
    else:
        anomaly_df = diff_df.copy()

    anomaly_count = len(anomaly_df)
    anomaly_rate = anomaly_count / total_diffs if total_diffs > 0 else 0.0
    logger.info(
        "P2 diff report: anomaly rows = %d / %d (%.1f%%)",
        anomaly_count, total_diffs, anomaly_rate * 100,
    )

    # Breakdown by field
    if total_diffs > 0:
        field_breakdown = diff_df["字段"].value_counts().to_dict()
        anomaly_breakdown = (
            diff_df[diff_df["anomaly"] == True]["字段"].value_counts().to_dict()
            if anomaly_count > 0 else {}
        )
        logger.info("P2 diff report: diff by field: %s", field_breakdown)
        logger.info("P2 diff report: anomaly by field: %s", anomaly_breakdown)

    # Write outputs
    out_dir = _REPO_ROOT / "data" / "_pipeline" / "P2"
    out_dir.mkdir(parents=True, exist_ok=True)

    cross_path = out_dir / "交叉差异报告_2025.xlsx"
    anomaly_path = out_dir / "异常差异_2025.xlsx"

    diff_df.to_excel(cross_path, index=False, engine="openpyxl")
    logger.info("P2 diff report: wrote %s (%d rows)", cross_path, total_diffs)

    anomaly_df.to_excel(anomaly_path, index=False, engine="openpyxl")
    logger.info("P2 diff report: wrote %s (%d rows)", anomaly_path, anomaly_count)

    logger.info(
        "P2 diff report DONE — both=%d diff=%d anomaly=%d rate=%.1f%%",
        both_count, total_diffs, anomaly_count, anomaly_rate * 100,
    )


if __name__ == "__main__":
    main()
