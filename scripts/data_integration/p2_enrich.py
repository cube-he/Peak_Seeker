# -*- coding: utf-8 -*-
"""P2 Task 10: enrich joined 03×01 with _01 columns + backfill candidate flags.

ADR-003 rule: 01-only fields become _01-suffixed columns; never overwrite 03;
flag candidates in `_backfill_notes`. The P1 SSoT (03) stays authoritative —
downstream consumers see one canonical value per field plus annotated alternatives.
"""
from __future__ import annotations
from typing import Iterable
import pandas as pd

RENAME_01_ONLY = {
    "征集标志": "征集标志_01",
    "压力线": "压力线_01",
    "办学性质": "办学性质_01",
    "院校分类": "院校分类_01",
}

BACKFILL_FIELD_PAIRS = [
    ("最低位次", "最低位次_01"),
    ("平均位次", "平均位次_01"),
    ("最高位次", "最高位次_01"),
    ("最低分", "最低分_01"),
    ("平均分", "平均分_01"),
    ("最高分", "最高分_01"),
    ("录取人数", "录取人数_01"),
    ("计划人数", "计划人数_01"),
]


def _backfill_notes_for_row(row: pd.Series, pairs: Iterable[tuple[str, str]]) -> str:
    """Return 补缺候选 note listing fields where 03 is null but _01 is not.
    Empty string when no candidates."""
    candidates = []
    for col_03, col_01 in pairs:
        if col_03 not in row or col_01 not in row:
            continue
        lhs, rhs = row[col_03], row[col_01]
        if pd.isna(lhs) and not pd.isna(rhs):
            candidates.append(col_03)
    if not candidates:
        return ""
    return "补缺候选: " + ", ".join(candidates)


def enrich_with_01(joined: pd.DataFrame) -> pd.DataFrame:
    """Add _01 suffix to 01-only columns + flag backfill candidates per row.

    Never mutates 03 values. Preserves all rows (both / left_only / right_only).
    Returns new DataFrame with added `_backfill_notes` column.
    """
    df = joined.copy()
    rename_present = {k: v for k, v in RENAME_01_ONLY.items() if k in df.columns}
    if rename_present:
        df = df.rename(columns=rename_present)
    df["_backfill_notes"] = df.apply(
        lambda r: _backfill_notes_for_row(r, BACKFILL_FIELD_PAIRS), axis=1
    )
    return df
