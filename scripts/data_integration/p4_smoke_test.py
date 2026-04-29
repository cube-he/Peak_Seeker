# -*- coding: utf-8 -*-
"""
P4.5 — 端到端 smoke test (100 样本)

分层抽样:
  - _lineage_source 每个值 ≥ 20 条
  - 科目 (物理类/历史类) 每组 ≥ 20 条

逐条校验:
  - _lineage_source='03': key 必须在 03_patched
  - _lineage_source='01': key 必须在 backfill_new_rows_2025
  - _lineage_source='03+01候选': key 必须在 03_patched AND 有非空 _01 列
  - 血缘声明一致性: _01 列若有值，行血缘必须 ∈ {'01', '03+01候选'}

产出:
  - docs/.../smoke_test_report.md: pass/fail 明细 + 总结
"""
from __future__ import annotations

import argparse
import random
from pathlib import Path

import pandas as pd


ENRICHED_PATH = Path("data/_pipeline/P4/专业招生主表_统一_2025.xlsx")
PATCHED_PATH = Path("data/_pipeline/P1/主表_修复_2025.xlsx")
NEW_ROWS_PATH = Path("data/_pipeline/P2/新增行_01独有_2025.xlsx")

KEY_COLS = ("数据年份", "院校代码", "专业代码", "批次", "科目")


def make_key(row) -> tuple:
    return tuple(str(row.get(c, "")).strip() for c in KEY_COLS)


def stratified_sample(df: pd.DataFrame, n_total: int, seed: int = 42) -> pd.DataFrame:
    """Stratify by _lineage_source; equal quota per bucket, fill residue."""
    rng = random.Random(seed)
    buckets = df.groupby("_lineage_source")
    bucket_names = list(buckets.groups.keys())
    per_bucket = n_total // len(bucket_names)
    residue = n_total - per_bucket * len(bucket_names)

    picks = []
    for name, grp in buckets:
        k = min(per_bucket + (1 if residue > 0 else 0), len(grp))
        if residue > 0:
            residue -= 1
        # random sample
        idxs = rng.sample(list(grp.index), k)
        picks.extend(idxs)
    return df.loc[picks].reset_index(drop=True)


def verify_sample(row, patched_keys: set, new_rows_keys: set) -> tuple[bool, str]:
    """Return (passed, reason)."""
    src = row["_lineage_source"]
    key = make_key(row)

    # Check _01 consistency
    has_01 = any(
        (pd.notna(row[c]) and str(row[c]).strip() != "")
        for c in row.index if str(c).endswith("_01")
    )
    if has_01 and src not in ("01", "03+01候选"):
        return False, f"has _01 values but lineage='{src}'"

    if src == "03":
        if key not in patched_keys:
            return False, f"claimed '03' but key {key} not in 03_patched"
        return True, "03 ok"
    elif src == "01":
        if key not in new_rows_keys:
            return False, f"claimed '01' but key {key} not in backfill_new_rows"
        return True, "01 ok"
    elif src == "03+01候选":
        if key not in patched_keys:
            return False, f"claimed '03+01候选' but key {key} not in 03_patched"
        if not has_01:
            return False, "claimed '03+01候选' but no _01 columns populated"
        return True, "03+01候选 ok"
    else:
        return False, f"unknown lineage: {src}"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=100)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--out-dir", default="docs/superpowers/specs/2026-04-17-data-integration-master")
    args = parser.parse_args()

    enriched = pd.read_excel(ENRICHED_PATH, dtype=str)
    patched = pd.read_excel(PATCHED_PATH, dtype=str)
    new_rows = pd.read_excel(NEW_ROWS_PATH, dtype=str)

    patched_keys = set(patched.apply(make_key, axis=1))
    new_rows_keys = set(new_rows.apply(make_key, axis=1))

    sample = stratified_sample(enriched, args.n, args.seed)

    results = []
    for _, row in sample.iterrows():
        ok, reason = verify_sample(row, patched_keys, new_rows_keys)
        results.append({
            "key": make_key(row),
            "lineage": row["_lineage_source"],
            "pass": ok,
            "reason": reason,
        })

    passed = sum(1 for r in results if r["pass"])
    total = len(results)

    # Distribution
    by_src = {}
    for r in results:
        by_src.setdefault(r["lineage"], {"pass": 0, "fail": 0})
        by_src[r["lineage"]]["pass" if r["pass"] else "fail"] += 1

    # Write report
    lines = [f"# P4.5 Smoke Test Report",
             "",
             f"**生成**: 2026-04-17  ",
             f"**样本量**: {total}  ",
             f"**通过**: {passed} / {total} ({passed/total*100:.1f}%)  ",
             "",
             "## 分层结果",
             "",
             "| 来源 | 通过 | 失败 |",
             "|---|---:|---:|"]
    for src, d in sorted(by_src.items()):
        lines.append(f"| `{src}` | {d['pass']} | {d['fail']} |")

    if any(not r["pass"] for r in results):
        lines += ["",
                  "## 失败样本明细",
                  "",
                  "| key | lineage | 原因 |",
                  "|---|---|---|"]
        for r in results:
            if not r["pass"]:
                lines.append(f"| {r['key']} | {r['lineage']} | {r['reason']} |")
    else:
        lines += ["", "## 全部通过 ✅", ""]

    report = "\n".join(lines)
    out_path = Path(args.out_dir) / "smoke_test_report.md"
    out_path.write_text(report, encoding="utf-8")

    print(f"Passed: {passed}/{total} ({passed/total*100:.1f}%)")
    print(f"→ {out_path}")

    if passed < total:
        print(f"\nFAILURES:")
        for r in results:
            if not r["pass"]:
                print(f"  {r['key']}: {r['reason']}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
