# -*- coding: utf-8 -*-
"""
P4.1b — 将 13_clean 按年份切分:
  - 2025: 作为征集志愿关联表进入 P4 统一数据集 (独立表，不合入主表)
  - 2023/2024: historical holdback，等待 Task 7b 的 01×03 历史年份反哺后再参与统一
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


INPUT_PATH = Path("data/_pipeline/P3/13_clean.xlsx")


def split_by_year(df: pd.DataFrame, current_year: str = "2025") -> tuple[pd.DataFrame, pd.DataFrame]:
    year_col = "_meta_year"
    current = df[df[year_col] == current_year].copy()
    historical = df[df[year_col] != current_year].copy()
    return current, historical


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="data/_pipeline/P4")
    parser.add_argument("--current-year", default="2025")
    args = parser.parse_args()

    clean = pd.read_excel(INPUT_PATH, dtype=str)
    print(f"Loaded 13_clean: {len(clean)} rows")

    current, historical = split_by_year(clean, args.current_year)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    cur_path = out_dir / f"13_relation_{args.current_year}.xlsx"
    hist_path = out_dir / "13_historical.xlsx"

    current.to_excel(cur_path, index=False)
    historical.to_excel(hist_path, index=False)

    print(f"  current ({args.current_year}): {len(current)} rows → {cur_path}")
    print(f"  historical (!= {args.current_year}): {len(historical)} rows → {hist_path}")
    print(f"  year breakdown (historical):")
    print(historical["_meta_year"].value_counts().sort_index().to_dict())


if __name__ == "__main__":
    main()
