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


def _forward_fill_college(df: pd.DataFrame, file_rel: str, log: list[dict]) -> pd.DataFrame:
    """Forward-fill 院校代码 / 院校名称 / 院校地址 downward for multi-major rows.

    Typical OCR pattern: 院校 only printed on first major line, subsequent majors leave blank.
    We forward-fill ONLY when: 专业代码 has a value (i.e., this is a continuation row).
    """
    college_cols = [c for c in ("院校代码", "院校名称", "院校地址") if c in df.columns]
    if not college_cols or "专业代码" not in df.columns:
        return df

    for col in college_cols:
        last = None
        for i in range(len(df)):
            v = df.iloc[i][col]
            major = df.iloc[i].get("专业代码")
            if pd.isna(v) or (isinstance(v, str) and v.strip() == ""):
                if last is not None and major is not None and str(major).strip() != "":
                    df.iat[i, df.columns.get_loc(col)] = last
                    log.append({
                        "file": file_rel, "row": i, "col": col,
                        "fix_type": "forward_fill_college",
                        "old": "", "new": str(last),
                    })
            else:
                last = v
    return df


def repair_df(df: pd.DataFrame, file_rel: str) -> tuple[pd.DataFrame, list[dict]]:
    """Apply the full repair pipeline to a single xlsx dataframe."""
    log: list[dict] = []
    df = df.copy()

    # Step 0: forward-fill 院校 columns for continuation rows (before code fixes)
    df = _forward_fill_college(df, file_rel, log)

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


_ENGINE_SUFFIXES = ("_mimo-v2-omni.xlsx", "_claude.xlsx", "_多引擎.xlsx")
# Preference order: mimo > claude > 多引擎
# Rationale:
#   - mimo-v2-omni is the canonical engine
#   - claude has standard header format
#   - 多引擎 has an extra metadata row that breaks column parsing
_ENGINE_PRIORITY = {suffix: i for i, suffix in enumerate(_ENGINE_SUFFIXES)}


def _engine_suffix(name: str) -> str | None:
    for s in _ENGINE_SUFFIXES:
        if name.endswith(s):
            return s
    return None


def _select_preferred_engine(xlsx_files: list[Path]) -> dict[Path, str]:
    """Group xlsx files by (folder, base_name) and pick highest-priority engine.

    Returns {path: keep_or_skip_reason}. 'keep' means process; else the skip reason.
    """
    # Group by (parent, base_name_without_engine_suffix)
    groups: dict[tuple, list[Path]] = {}
    ungrouped: list[Path] = []
    for p in xlsx_files:
        suf = _engine_suffix(p.name)
        if suf is None:
            ungrouped.append(p)
            continue
        base = p.name[: -len(suf)]
        groups.setdefault((p.parent, base), []).append(p)

    result: dict[Path, str] = {p: "keep" for p in ungrouped}
    for _, members in groups.items():
        # Sort by engine priority (lower index wins)
        members_sorted = sorted(members, key=lambda m: _ENGINE_PRIORITY[_engine_suffix(m.name)])
        winner = members_sorted[0]
        result[winner] = "keep"
        winner_suf = _engine_suffix(winner.name)
        for loser in members_sorted[1:]:
            loser_suf = _engine_suffix(loser.name)
            result[loser] = f"duplicate_engine (kept {winner_suf}, dropped {loser_suf})"
    return result


def run_all(include_all_engines=False):
    all_rows = []
    all_log = []
    file_count = 0
    skipped = []

    all_xlsx = sorted(DATA_ROOT.rglob("*.xlsx"))
    # First filter: exclude 补充数据 (different format)
    candidates = []
    for xlsx in all_xlsx:
        rel = str(xlsx.relative_to(DATA_ROOT))
        if "补充数据" in rel:
            skipped.append((rel, "supplementary_different_format"))
            continue
        candidates.append(xlsx)

    # Second filter: engine preference
    if include_all_engines:
        decisions = {p: "keep" for p in candidates}
    else:
        decisions = _select_preferred_engine(candidates)

    for xlsx in candidates:
        rel = str(xlsx.relative_to(DATA_ROOT))
        status = decisions.get(xlsx, "keep")
        if status != "keep":
            skipped.append((rel, status))
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
    parser.add_argument("--include-all-engines", action="store_true",
                        help="keep all engine variants (default: prefer mimo > claude > 多引擎)")
    args = parser.parse_args()

    print(f"[{datetime.utcnow().isoformat()}] P3.4 repair start")
    combined, log, skipped = run_all(include_all_engines=args.include_all_engines)

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
