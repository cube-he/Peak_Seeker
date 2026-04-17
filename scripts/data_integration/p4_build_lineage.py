# -*- coding: utf-8 -*-
"""
P4.2 — 构建血缘文件 lineage.json

策略:
  - 每个 (数据年份, 院校代码, 专业代码, 批次, 科目) + 列 = 一个单元
  - 列级血缘分类:
    * _01 后缀列 → '01'
    * 行 _lineage_source == '01' (01 独有行) → 所有非空列 '01'
    * 行 _lineage_source == '03+01候选' → 03 列 '03', _01 列 '01'
    * 行 _lineage_source == '03' → 所有非空列 '03'
    * P1 patch_log 记录的 (行,列) → 'patched'

输出:
  - lineage.json: 只存 column-level summary + 特例行 (patched 行)
    {
      "column_source_summary": {"col1": {"03": N, "01": M, ...}, ...},
      "patched_rows": [{"key": "...", "col": "...", "from": "", "to": ""}]
    }
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


ENRICHED_PATH = Path("data/_pipeline/P4/03_enriched_2025.xlsx")
PATCH_LOG_PATH = Path("data/_pipeline/P1/patch_log.csv")

KEY_COLS = ("数据年份", "院校代码", "专业代码", "批次", "科目")


def classify_col_source(col: str, row_lineage: str) -> str:
    """Return source tag for a (col, row_lineage) combination."""
    if col.endswith("_01"):
        return "01"
    if col in ("_lineage_source",):
        return "meta"
    if row_lineage == "01":
        return "01"
    if row_lineage in ("03", "03+01候选"):
        return "03"
    return "unknown"


def build_lineage(enriched: pd.DataFrame, patch_log: pd.DataFrame | None = None) -> dict:
    """Return {column_source_summary, patched_rows, totals}."""
    col_summary: dict[str, dict[str, int]] = {}
    for col in enriched.columns:
        if col in ("_lineage_source",):
            continue
        col_summary[col] = {"03": 0, "01": 0, "patched": 0, "null": 0}

    for _, row in enriched.iterrows():
        lineage = row["_lineage_source"]
        for col in enriched.columns:
            if col == "_lineage_source":
                continue
            val = row[col]
            if pd.isna(val) or val == "":
                col_summary[col]["null"] += 1
                continue
            src = classify_col_source(col, lineage)
            if src in col_summary[col]:
                col_summary[col][src] += 1
            else:
                col_summary[col][src] = 1

    patched_rows: list[dict] = []
    if patch_log is not None:
        for _, row in patch_log.iterrows():
            patched_rows.append({
                "key": str(row.get("row_key", "")),
                "col": str(row.get("col", "")),
                "from": str(row.get("from_value", "")),
                "to": str(row.get("to_value", "")),
                "reason": str(row.get("reason", "")),
            })

    totals = {
        "rows": len(enriched),
        "cols": len(col_summary),
        "patched_count": len(patched_rows),
    }
    return {
        "totals": totals,
        "column_source_summary": col_summary,
        "patched_rows": patched_rows,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--enriched", default=str(ENRICHED_PATH))
    parser.add_argument("--patch-log", default=str(PATCH_LOG_PATH))
    parser.add_argument("--out-dir", default="data/_pipeline/P4")
    args = parser.parse_args()

    enriched = pd.read_excel(args.enriched, dtype=str)
    print(f"Loaded enriched: {len(enriched)} rows")

    patch_log = None
    plp = Path(args.patch_log)
    if plp.exists():
        patch_log = pd.read_csv(plp, dtype=str)
        print(f"Loaded patch_log: {len(patch_log)} rows")

    lineage = build_lineage(enriched, patch_log)

    out_path = Path(args.out_dir) / "lineage.json"
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(lineage, f, ensure_ascii=False, indent=2)

    print(f"\nlineage.json: {lineage['totals']}")
    print(f"→ {out_path}")

    # Print top columns by 01 contribution
    top_01 = sorted(
        lineage["column_source_summary"].items(),
        key=lambda x: x[1].get("01", 0), reverse=True
    )[:10]
    print(f"\nTop 10 cols by 01 contribution:")
    for col, d in top_01:
        print(f"  {col}: {d}")


if __name__ == "__main__":
    main()
