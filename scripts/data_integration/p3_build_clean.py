# -*- coding: utf-8 -*-
"""
P3.6 — 汇总 征集志愿_已对齐 为最终 征集志愿_已清洗.xlsx。

规则:
  - 保留 _in_master=True 的行 (与 03 主表命中)
  - 保留 _in_master=False 且 _miss_kind='legit_miss' 的行 (征集补充未完成计划，合理)
  - 排除 _miss_kind='malformed' 的行 (单独转交人工审核)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


INPUT_PATH = Path("data/_pipeline/P3/征集志愿_已对齐.xlsx")
REVIEW_PATH = Path("data/_pipeline/P3/待人工复核.csv")


def build_clean(aligned: pd.DataFrame) -> pd.DataFrame:
    mask = aligned["_in_master"] | (aligned["_miss_kind"] == "legit_miss")
    return aligned[mask].copy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default=str(INPUT_PATH))
    parser.add_argument("--out-dir", default="data/_pipeline/P3")
    args = parser.parse_args()

    aligned = pd.read_excel(args.input, dtype=str)
    # _in_master round-trips as str "True"/"False" — normalize
    aligned["_in_master"] = aligned["_in_master"].astype(str).str.lower() == "true"

    clean = build_clean(aligned)

    out_dir = Path(args.out_dir)
    clean_path = out_dir / "征集志愿_已清洗.xlsx"
    clean.to_excel(clean_path, index=False)

    total = len(aligned)
    kept = len(clean)
    dropped = total - kept
    hit = int(clean["_in_master"].sum())
    supp = kept - hit

    print(f"P3.6 build clean:")
    print(f"  total aligned rows   : {total}")
    print(f"  kept (clean)         : {kept}")
    print(f"    - in-master hits   : {hit}")
    print(f"    - legit supplements: {supp}")
    print(f"  dropped (malformed)  : {dropped}")
    print(f"→ {clean_path}")


if __name__ == "__main__":
    main()
