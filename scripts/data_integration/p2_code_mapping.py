# -*- coding: utf-8 -*-
"""Probe coverage of 编码映射表 against 01 collegeCode universe.

Dumps missing codes to csv for subagent to manually patch.
Does not mutate the source mapping CSV.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import pandas as pd

from scripts.data_integration.lib.code_mapper import CodeMapper
from scripts.data_integration.lib.source_01 import load_01_major_scores

MAPPING_CSV = Path("data/08_数据治理记录/编码映射表_招生代码_国标代码.csv")
OUT_DIR = Path("data/_pipeline/P2")


def probe_coverage(years: list[int]) -> dict:
    mapper = CodeMapper.from_csv(MAPPING_CSV)
    result = {
        "mapper_size": mapper.size(),
        "mapper_conflicts": len(mapper.conflicts),
        "per_year": {},
        "missing_codes": [],  # list of dict rows
    }
    # Aggregate unique (national_code, name) seen in 01 专业分数线 across years
    seen: dict[str, set[str]] = {}  # national_code → set of names observed
    for year in years:
        src = Path(f"data/01_核心录取数据/专业分数线_四川_{year}.json")
        if not src.exists():
            result["per_year"][year] = {"loaded": False}
            continue
        df = load_01_major_scores(src, year=year)
        unique_codes = df[["院校代码_国标", "院校名称_01"]].drop_duplicates()
        matched = 0
        missing = 0
        for _, row in unique_codes.iterrows():
            code = row["院校代码_国标"]
            name = row["院校名称_01"]
            seen.setdefault(code, set()).add(str(name))
            if mapper.national_to_enroll(code):
                matched += 1
            else:
                missing += 1
        result["per_year"][year] = {
            "loaded": True,
            "unique_codes": len(unique_codes),
            "matched": matched,
            "missing": missing,
        }
    # Build final missing list (dedup across years)
    all_seen = set(seen.keys())
    missing_codes = [c for c in all_seen if mapper.national_to_enroll(c) is None]
    result["missing_codes"] = sorted(
        [
            {
                "national_code": code,
                "college_name": " / ".join(sorted(seen[code])),
            }
            for code in missing_codes
        ],
        key=lambda r: r["national_code"],
    )
    result["total_unique_codes"] = len(all_seen)
    result["total_missing"] = len(missing_codes)
    result["coverage_pct"] = (
        100 * (len(all_seen) - len(missing_codes)) / max(1, len(all_seen))
    )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", nargs="+", type=int, default=[2022, 2023, 2024, 2025])
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    result = probe_coverage(args.years)

    # Save missing codes csv
    missing_df = pd.DataFrame(result["missing_codes"])
    out = OUT_DIR / "missing_college_codes.csv"
    missing_df.to_csv(out, index=False, encoding="utf-8-sig")

    # Print summary
    print(f"=== 01 collegeCode coverage probe ===")
    print(f"Mapping CSV size: {result['mapper_size']}")
    print(f"Mapping CSV internal conflicts: {result['mapper_conflicts']}")
    print(f"Per-year stats:")
    for year, stats in result["per_year"].items():
        print(f"  {year}: {stats}")
    print(f"Total unique codes across years: {result['total_unique_codes']}")
    print(f"Missing: {result['total_missing']}")
    print(f"Coverage: {result['coverage_pct']:.2f}%")
    print(f"Output: {out}")


if __name__ == "__main__":
    main()
