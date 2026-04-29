# -*- coding: utf-8 -*-
"""
P4.1 — 以主表_修复 为基表，左联 01 候选列(_01 后缀)，并追加 01 独有新行。

输入:
  - data/_pipeline/P1/主表_修复_2025.xlsx            (48131 行, 03 + P1 修复)
  - data/_pipeline/P2/字段补缺候选_2025.xlsx         (291 行, 03 有对应但 01 也提供候选)
  - data/_pipeline/P2/新增行_01独有_2025.xlsx        (7362 行, 01 独有)

产出:
  - data/_pipeline/P4/专业招生主表_统一_2025.xlsx  (48131+7362 = 55493 行)
    - 所有原 03 列保留
    - 追加 _01 后缀列 (仅 291 行有值)
    - 新增 _lineage_source 列: '03' / '03+01候选' / '01'
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


PATCHED_PATH = Path("data/_pipeline/P1/主表_修复_2025.xlsx")
FIELD_FILL_PATH = Path("data/_pipeline/P2/字段补缺候选_2025.xlsx")
NEW_ROWS_PATH = Path("data/_pipeline/P2/新增行_01独有_2025.xlsx")

# Join key: (数据年份, 院校代码, 专业代码, 批次, 科目)
JOIN_KEYS = ("数据年份", "院校代码", "专业代码", "批次", "科目")


def build_enriched(
    patched: pd.DataFrame,
    field_fill: pd.DataFrame,
    new_rows: pd.DataFrame,
) -> pd.DataFrame:
    """Build 专业招生主表_统一_2025.

    Strategy:
      1. Start with patched (all 48131 rows, all original 03 cols)
      2. Identify _01 cols from field_fill; left-merge only those cols keyed on JOIN_KEYS
      3. Mark lineage: '03+01候选' for rows that got _01 fill, else '03'
      4. Append new_rows (01 独有), lineage = '01'
    """
    base = patched.copy()
    base["_lineage_source"] = "03"

    # Keep only keys + _01 cols from field_fill
    _01_cols = [c for c in field_fill.columns if c.endswith("_01") or c in
                ("id", "dataType", "professionNum", "provinceCode", "year",
                 "cost", "learnYear", "collegeEnrollCode", "collegeSourceName",
                 "uChooseSubjectRule", "uChooseSubjectText", "eduLevel",
                 "uRemark", "schoolplanid", "uZjTextExplain", "enterLine",
                 "text", "remark", "majorCode", "chooseSubject",
                 "chooseSubject2", "chooseSubjectText", "chooseSubjectRule",
                 "zjText", "zjTextExplain", "natureType", "categories",
                 "features", "artFeatures")]
    ff_slim = field_fill[list(JOIN_KEYS) + _01_cols].drop_duplicates(subset=JOIN_KEYS)

    merged = base.merge(ff_slim, on=list(JOIN_KEYS), how="left", indicator="_ff_merge")
    merged.loc[merged["_ff_merge"] == "both", "_lineage_source"] = "03+01候选"
    merged = merged.drop(columns=["_ff_merge"])

    # Append new_rows
    nr = new_rows.copy()
    # Align columns — fill missing with NaN
    for col in merged.columns:
        if col not in nr.columns:
            nr[col] = pd.NA
    nr = nr[merged.columns.tolist()]  # reorder
    nr["_lineage_source"] = "01"

    enriched = pd.concat([merged, nr], axis=0, ignore_index=True)
    return enriched


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="data/_pipeline/P4")
    args = parser.parse_args()

    print("Loading P1 主表_修复...")
    patched = pd.read_excel(PATCHED_PATH, dtype=str)
    print(f"  {len(patched)} rows, {len(patched.columns)} cols")

    print("Loading P2 字段补缺候选...")
    field_fill = pd.read_excel(FIELD_FILL_PATH, dtype=str)
    print(f"  {len(field_fill)} rows")

    print("Loading P2 新增行_01独有...")
    new_rows = pd.read_excel(NEW_ROWS_PATH, dtype=str)
    print(f"  {len(new_rows)} rows")

    enriched = build_enriched(patched, field_fill, new_rows)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "专业招生主表_统一_2025.xlsx"
    enriched.to_excel(out_path, index=False)

    print(f"\n专业招生主表_统一_2025: {len(enriched)} rows, {len(enriched.columns)} cols")
    print(f"  lineage distribution:")
    print(enriched["_lineage_source"].value_counts().to_dict())
    print(f"→ {out_path}")


if __name__ == "__main__":
    main()
