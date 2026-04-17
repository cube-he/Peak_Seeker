# -*- coding: utf-8 -*-
"""
P3.5 — 13_normalized 与 03 主表对齐校验。

对 13 每行 (year, 院校代码, 专业代码) 在 03 主表做存在性检查:
  - 命中          → _in_master=True
  - 未命中 + 畸形 → needs_human_review.csv
  - 未命中 + 合法 → not_in_master.csv (征集对未完成计划的补充，合理)
"""
from __future__ import annotations

import argparse
from pathlib import Path

import pandas as pd


MASTER_PATH = Path("data/03_专家版主表/output/专业招生主表.xlsx")
INPUT_PATH = Path("data/_pipeline/P3/13_normalized.xlsx")


def classify_miss(college_code, major_code) -> str:
    """Return 'malformed' or 'legit_miss'."""
    cc = str(college_code or "").strip()
    mc = str(major_code or "").strip()

    # College code must be 4 digits
    if not cc or not cc.isdigit() or len(cc) != 4:
        return "malformed"

    # Major code must be non-empty alphanumeric
    if not mc or not mc.replace(" ", "").isalnum():
        return "malformed"

    return "legit_miss"


def align_to_master(candidate: pd.DataFrame, master: pd.DataFrame):
    """Return (aligned, not_in_master, needs_human_review).

    aligned: candidate with added '_in_master' column
    not_in_master: candidate rows where code is legit but master doesn't have it
    needs_human_review: candidate rows where code looks malformed
    """
    master_str = master.copy()
    for c in ("数据年份", "院校代码", "专业代码"):
        master_str[c] = master_str[c].astype(str).str.strip()

    master_keys = set(
        zip(master_str["数据年份"], master_str["院校代码"], master_str["专业代码"])
    )

    aligned = candidate.copy()
    in_master_flags = []
    miss_kind = []
    for _, row in candidate.iterrows():
        yr = str(row.get("_meta_year", "")).strip()
        cc = str(row.get("院校代码", "") or "").strip()
        mc = str(row.get("专业代码", "") or "").strip()
        key = (yr, cc, mc)
        hit = key in master_keys
        in_master_flags.append(hit)
        if hit:
            miss_kind.append("")
        else:
            miss_kind.append(classify_miss(cc, mc))

    aligned["_in_master"] = in_master_flags
    aligned["_miss_kind"] = miss_kind

    not_in_m = aligned[(aligned["_in_master"] == False) & (aligned["_miss_kind"] == "legit_miss")].copy()
    needs_rev = aligned[(aligned["_in_master"] == False) & (aligned["_miss_kind"] == "malformed")].copy()
    return aligned, not_in_m, needs_rev


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--master", default=str(MASTER_PATH))
    parser.add_argument("--input", default=str(INPUT_PATH))
    parser.add_argument("--out-dir", default="data/_pipeline/P3")
    args = parser.parse_args()

    print("Loading master table...")
    master = pd.read_excel(args.master, dtype=str)
    print(f"  master: {len(master)} rows")

    print("Loading 13_normalized...")
    candidate = pd.read_excel(args.input, dtype=str)
    print(f"  candidate: {len(candidate)} rows")

    aligned, not_in_m, needs_rev = align_to_master(candidate, master)

    n_hit = int(aligned["_in_master"].sum())
    n_miss = len(aligned) - n_hit

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    aligned_path = out_dir / "13_aligned.xlsx"
    not_in_m_path = out_dir / "not_in_master.csv"
    needs_rev_path = out_dir / "needs_human_review.csv"

    aligned.to_excel(aligned_path, index=False)
    not_in_m.to_csv(not_in_m_path, index=False, encoding="utf-8")
    needs_rev.to_csv(needs_rev_path, index=False, encoding="utf-8")

    print(f"Alignment result:")
    print(f"  _in_master=True : {n_hit} ({n_hit/len(aligned)*100:.1f}%)")
    print(f"  _in_master=False: {n_miss} ({n_miss/len(aligned)*100:.1f}%)")
    print(f"    - legit_miss  : {len(not_in_m)}")
    print(f"    - malformed   : {len(needs_rev)}")
    print(f"→ {aligned_path}")
    print(f"→ {not_in_m_path}")
    print(f"→ {needs_rev_path}")


if __name__ == "__main__":
    main()
