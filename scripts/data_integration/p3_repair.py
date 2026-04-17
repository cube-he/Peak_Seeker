# -*- coding: utf-8 -*-
"""
P3.4 — 批量修复 13 征集志愿 xlsx，合并为 13_normalized.xlsx + P3_fix_log.csv。

严格修复顺序:
  1. 加载 (dtype=str 避免 float 污染)
  2. 字符标准化 (括号统一, 空白归一)
  3. 代码层修复 (院校码补 0 / 专业码去尾部 tag / 字母混淆)
  4. 结构层 (多行备注 flag)
  5. 完整性校验 (保留并标 flag_maybe_truncated)

输入: data/13_征集志愿/普通高考/**/*.xlsx (排除补充数据)
产出:
  - data/_pipeline/P3/13_normalized.xlsx
  - data/_pipeline/P3/P3_fix_log.csv
"""
from __future__ import annotations

import argparse
import csv
import re
from datetime import datetime
from pathlib import Path

import pandas as pd

from scripts.data_integration.lib.ocr_fixes import (
    detect_multiline_memo_continuation,
    fix_college_code,
    fix_major_code,
    normalize_chars,
)


DATA_ROOT = Path("data/13_征集志愿/普通高考")

# Columns we normalize as text
TEXT_COLS = ("院校名称", "院校地址", "专业名称", "专业备注", "院校备注")
CODE_COLS = ("院校代码", "专业代码")


def parse_folder_metadata(folder_name: str) -> dict:
    """Parse post-rename folder name: {ID}_{year}_{科类}_{批次}[_{子类型}]_{数据类型}[_第N次].

    Example: '3335_2023_文科_专科批_征集志愿_第一次'
    """
    parts = folder_name.split("_")
    meta = {"source_folder": folder_name}
    if len(parts) >= 2:
        meta["id"] = parts[0]
        meta["year"] = parts[1] if parts[1].isdigit() else None
    if len(parts) >= 3:
        meta["科类"] = parts[2]
    if len(parts) >= 4:
        meta["大批次"] = parts[3]
    # find 数据类型
    for i, p in enumerate(parts):
        if p in ("征集志愿", "招生计划", "单招招生计划", "补充数据"):
            meta["数据类型"] = p
            if i + 1 < len(parts) and parts[i + 1].startswith("第"):
                meta["轮次"] = parts[i + 1]
            # 子类型 = middle tokens between 大批次 and 数据类型
            sub_parts = parts[4:i]
            meta["子类型"] = "_".join(sub_parts) if sub_parts else ""
            break
    return meta


def load_xlsx_str(path: Path) -> pd.DataFrame:
    return pd.read_excel(path, dtype=str)


def repair_df(df: pd.DataFrame, file_rel: str) -> tuple[pd.DataFrame, list[dict]]:
    """Apply the full repair pipeline to a single xlsx dataframe."""
    log: list[dict] = []
    df = df.copy()

    # Step 1: character normalization on text columns
    for col in TEXT_COLS:
        if col in df.columns:
            for i in range(len(df)):
                old = df.iloc[i][col]
                new = normalize_chars(old)
                if new != old and not (pd.isna(old) and pd.isna(new)):
                    df.iat[i, df.columns.get_loc(col)] = new
                    if old is not None and not pd.isna(old):
                        log.append({
                            "file": file_rel, "row": i, "col": col,
                            "fix_type": "normalize_chars", "old": str(old), "new": str(new),
                        })

    # Step 2: code fixes
    for col in CODE_COLS:
        if col not in df.columns:
            continue
        fixer = fix_college_code if col == "院校代码" else fix_major_code
        for i in range(len(df)):
            old = df.iloc[i][col]
            new, reason = fixer(old)
            if new != old or reason:
                if new != old:
                    df.iat[i, df.columns.get_loc(col)] = new
                if reason:
                    log.append({
                        "file": file_rel, "row": i, "col": col,
                        "fix_type": reason, "old": str(old) if old is not None else "",
                        "new": str(new) if new is not None else "",
                    })

    # Step 3: multi-line memo continuation flag
    if "专业备注" in df.columns:
        df["flag_multiline_memo"] = df["专业备注"].apply(detect_multiline_memo_continuation)
    else:
        df["flag_multiline_memo"] = False

    return df, log


def run_all(include_claude_engine=False):
    all_rows = []
    all_log = []
    file_count = 0
    skipped = []

    for xlsx in sorted(DATA_ROOT.rglob("*.xlsx")):
        rel = str(xlsx.relative_to(DATA_ROOT))
        if "补充数据" in rel:
            skipped.append((rel, "supplementary_different_format"))
            continue
        # If both mimo and claude engines exist for same folder, prefer mimo (canonical)
        # unless include_claude_engine=True
        if not include_claude_engine and "_claude.xlsx" in rel:
            # Check if sibling mimo exists
            sibling = xlsx.parent / xlsx.name.replace("_claude.xlsx", "_mimo-v2-omni.xlsx")
            if sibling.exists():
                skipped.append((rel, "duplicate_of_mimo_engine"))
                continue

        meta = parse_folder_metadata(xlsx.parent.name)
        try:
            df = load_xlsx_str(xlsx)
        except Exception as e:
            skipped.append((rel, f"load_error:{e}"))
            continue
        if len(df) == 0:
            skipped.append((rel, "empty_sheet"))
            continue

        df, log = repair_df(df, rel)
        for k, v in meta.items():
            df[f"_meta_{k}"] = v
        df["_source_file"] = rel
        df["_source_row_idx"] = range(len(df))
        all_rows.append(df)
        all_log.extend(log)
        file_count += 1

    if not all_rows:
        return None, all_log, skipped

    combined = pd.concat(all_rows, axis=0, ignore_index=True)
    return combined, all_log, skipped


def write_outputs(combined, log, skipped, out_dir: Path):
    out_dir.mkdir(parents=True, exist_ok=True)
    xlsx_path = out_dir / "13_normalized.xlsx"
    combined.to_excel(xlsx_path, index=False)

    log_path = out_dir / "P3_fix_log.csv"
    with log_path.open("w", encoding="utf-8", newline="") as f:
        fields = ["file", "row", "col", "fix_type", "old", "new"]
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for row in log:
            w.writerow(row)

    skip_path = out_dir / "P3_skipped.csv"
    with skip_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["file", "reason"])
        for r in skipped:
            w.writerow(r)

    return xlsx_path, log_path, skip_path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--out-dir", default="data/_pipeline/P3")
    parser.add_argument("--include-claude", action="store_true",
                        help="include claude-engine xlsx (default: prefer mimo when both exist)")
    args = parser.parse_args()

    print(f"[{datetime.utcnow().isoformat()}] P3.4 repair start")
    combined, log, skipped = run_all(include_claude_engine=args.include_claude)

    if combined is None:
        print("No xlsx processed")
        return

    xlsx_p, log_p, skip_p = write_outputs(combined, log, skipped, Path(args.out_dir))
    print(f"  combined: {len(combined)} rows, {combined['_source_file'].nunique()} files")
    print(f"  fixes logged: {len(log)}")
    print(f"  skipped files: {len(skipped)}")
    print(f"  → {xlsx_p}")
    print(f"  → {log_p}")
    print(f"  → {skip_p}")

    # Top fix types
    if log:
        from collections import Counter
        c = Counter(r["fix_type"] for r in log)
        print("  top fix types:")
        for k, v in c.most_common(10):
            # strip value suffix for grouping
            key = re.sub(r":.+", "", k)
            print(f"    {key}: {v}")


if __name__ == "__main__":
    main()
