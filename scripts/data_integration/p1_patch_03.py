# -*- coding: utf-8 -*-
"""P1.2-P1.4 03 主表自洽修复：去重 + 分数逻辑 + 专业代码补齐.

Usage:
    python -m scripts.data_integration.p1_patch_03

Outputs:
    data/_pipeline/P1/03_patched.xlsx
    data/_pipeline/P1/patch_log.csv
    data/_pipeline/P1/unresolvable.csv (if any)
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Tuple

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "data" / "03_专家版主表" / "output" / "专业招生主表.xlsx"
OUT_DIR = REPO_ROOT / "data" / "_pipeline" / "P1"
OUT_XLSX = OUT_DIR / "03_patched.xlsx"
OUT_LOG = OUT_DIR / "patch_log.csv"
OUT_UNRES = OUT_DIR / "unresolvable.csv"

PRIMARY_KEY = ["数据年份", "院校代码", "专业组代码", "专业代码", "批次", "科目"]


def load_master(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, dtype={"院校代码": "Int64"})
    return df


def find_duplicates(df: pd.DataFrame, key_cols: List[str]) -> List[List[int]]:
    """Return list of duplicate groups; each group is a list of row indices."""
    groups: List[List[int]] = []
    for _, grp in df.groupby(key_cols, dropna=False):
        if len(grp) > 1:
            groups.append(list(grp.index))
    return groups


def select_most_complete(df: pd.DataFrame, group_indices: List[int]) -> Tuple[int, List[int]]:
    """Given rows with same PK, keep the one with fewest NaN; drop others."""
    sub = df.loc[group_indices]
    non_null_counts = sub.notna().sum(axis=1)
    kept = int(non_null_counts.idxmax())
    dropped = [i for i in group_indices if i != kept]
    return kept, dropped


def find_score_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    """Return DataFrame of rows violating score logic."""
    records: List[dict] = []

    def _report(idx, anomaly_type, detail):
        records.append({
            "row_index": idx,
            "院校代码": df.at[idx, "院校代码"],
            "专业代码": df.at[idx, "专业代码"],
            "anomaly_type": anomaly_type,
            "detail": detail,
        })

    # 24 平均 > 最高
    if {"24平均分", "24最高分"}.issubset(df.columns):
        mask = df["24平均分"].fillna(-1) > df["24最高分"].fillna(9999)
        mask = mask & df["24平均分"].notna() & df["24最高分"].notna()
        for idx in df.index[mask]:
            _report(idx, "24_mean_gt_max",
                    f"avg={df.at[idx, '24平均分']} max={df.at[idx, '24最高分']}")

    # 24 最低 > 最高
    if {"24最低分", "24最高分"}.issubset(df.columns):
        mask = df["24最低分"].fillna(-1) > df["24最高分"].fillna(9999)
        mask = mask & df["24最低分"].notna() & df["24最高分"].notna()
        for idx in df.index[mask]:
            _report(idx, "24_min_gt_max",
                    f"min={df.at[idx, '24最低分']} max={df.at[idx, '24最高分']}")

    # 23 最低 > 最高
    if {"23最低分", "23最高分"}.issubset(df.columns):
        mask = df["23最低分"].fillna(-1) > df["23最高分"].fillna(9999)
        mask = mask & df["23最低分"].notna() & df["23最高分"].notna()
        for idx in df.index[mask]:
            _report(idx, "23_min_gt_max",
                    f"min={df.at[idx, '23最低分']} max={df.at[idx, '23最高分']}")

    # 分数范围 150-750
    for year_col in ["25投档最低分", "24最低分", "23最低分", "22最低分"]:
        if year_col in df.columns:
            mask = (df[year_col] < 150) | (df[year_col] > 750)
            mask = mask & df[year_col].notna()
            for idx in df.index[mask]:
                _report(idx, f"{year_col}_out_of_range",
                        f"score={df.at[idx, year_col]}")

    return pd.DataFrame(records)


def find_missing_major_code(df: pd.DataFrame) -> pd.DataFrame:
    """专业代码缺失记录。"""
    mask = df["专业代码"].isna()
    sub = df[mask].copy()
    return sub


def apply_deduplication(df: pd.DataFrame, log: List[dict]) -> pd.DataFrame:
    """去重，保留最完整行；log 追加 drop 记录。"""
    groups = find_duplicates(df, PRIMARY_KEY)
    to_drop: List[int] = []
    for grp in groups:
        kept, dropped = select_most_complete(df, grp)
        for d in dropped:
            log.append({
                "action": "drop_duplicate",
                "row_index": d,
                "kept_row_index": kept,
                "key": str(df.loc[d, PRIMARY_KEY].to_dict()),
                "detail": f"重复组大小={len(grp)}",
            })
            to_drop.append(d)
    return df.drop(index=to_drop).reset_index(drop=True)


def apply_score_flags(df: pd.DataFrame, log: List[dict]) -> pd.DataFrame:
    """标记分数异常：加 _quality_flag 列；不改动数值（等待 P2 用 01 修复）。"""
    anomalies = find_score_anomalies(df)
    if "_quality_flag" not in df.columns:
        df["_quality_flag"] = ""
    for _, a in anomalies.iterrows():
        idx = a["row_index"]
        existing = df.at[idx, "_quality_flag"] or ""
        tag = a["anomaly_type"]
        df.at[idx, "_quality_flag"] = (existing + "," + tag).strip(",") if existing else tag
        log.append({
            "action": "flag_score_anomaly",
            "row_index": int(idx),
            "kept_row_index": int(idx),
            "key": str(df.loc[idx, PRIMARY_KEY].to_dict()),
            "detail": a["detail"] + " | type=" + a["anomaly_type"],
        })
    return df


def apply_missing_major_code(df: pd.DataFrame, log: List[dict],
                             unresolvable: List[dict]) -> pd.DataFrame:
    """专业代码缺失：本阶段只标记 + 记 unresolvable，反查在 P2."""
    if "_quality_flag" not in df.columns:
        df["_quality_flag"] = ""
    missing = find_missing_major_code(df)
    for idx in missing.index:
        existing = df.at[idx, "_quality_flag"] or ""
        tag = "missing_major_code"
        df.at[idx, "_quality_flag"] = (existing + "," + tag).strip(",") if existing else tag
        log.append({
            "action": "flag_missing_major_code",
            "row_index": int(idx),
            "kept_row_index": int(idx),
            "key": str(df.loc[idx, PRIMARY_KEY].to_dict()),
            "detail": "专业代码缺失，待 P2 用 01 反查",
        })
        unresolvable.append({
            "type": "missing_major_code",
            "row_index": int(idx),
            "院校代码": df.at[idx, "院校代码"],
            "专业": df.at[idx, "专业"] if "专业" in df.columns else None,
            "批次": df.at[idx, "批次"],
            "科目": df.at[idx, "科目"],
        })
    return df


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Loading: {SRC}")
    df = load_master(SRC)
    print(f"Loaded {len(df)} rows, {len(df.columns)} cols")

    log: List[dict] = []
    unresolvable: List[dict] = []

    df = apply_deduplication(df, log)
    print(f"After dedup: {len(df)} rows")

    df = apply_score_flags(df, log)
    df = apply_missing_major_code(df, log, unresolvable)

    df.to_excel(OUT_XLSX, index=False)
    print(f"Wrote: {OUT_XLSX}")

    pd.DataFrame(log).to_csv(OUT_LOG, index=False, encoding="utf-8-sig")
    print(f"Wrote: {OUT_LOG}  ({len(log)} entries)")

    if unresolvable:
        pd.DataFrame(unresolvable).to_csv(OUT_UNRES, index=False, encoding="utf-8-sig")
        print(f"Wrote: {OUT_UNRES}  ({len(unresolvable)} entries)")

    actions = pd.DataFrame(log)["action"].value_counts() if log else pd.Series(dtype=int)
    print("\n=== P1 修复汇总 ===")
    print(actions.to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
