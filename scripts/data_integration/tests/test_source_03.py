# -*- coding: utf-8 -*-
"""Tests for source_03.load_master_2025 — RED/GREEN per TDD sequence."""
from pathlib import Path

import pandas as pd
import pytest

from scripts.data_integration.lib.source_03 import load_master_2025

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE_PATH = FIXTURES / "mini_03_for_join.xlsx"


def test_load_master_2025_returns_only_2025_rows():
    """Rows where 25最低分 is NaN must be filtered out.

    Fixture has 3 rows: 2 have 25最低分 filled, 1 has NaN → output must have 2 rows.
    """
    df = load_master_2025(FIXTURE_PATH)
    assert len(df) == 2, f"Expected 2 rows after NaN filter, got {len(df)}"


def test_load_master_2025_renames_year_prefixed_columns():
    """25最低分 → 最低分, 25录取人数 → 录取人数, etc."""
    df = load_master_2025(FIXTURE_PATH)
    assert "最低分" in df.columns, "25最低分 should be renamed to 最低分"
    assert "最低位次" in df.columns, "25最低位次 should be renamed to 最低位次"
    assert "平均分" in df.columns, "25平均分 should be renamed to 平均分"
    assert "平均位次" in df.columns, "25平均位次 should be renamed to 平均位次"
    assert "最高分" in df.columns, "25最高分 should be renamed to 最高分"
    assert "最高位次" in df.columns, "25最高位次 should be renamed to 最高位次"
    assert "录取人数" in df.columns, "25录取人数 should be renamed to 录取人数"
    # Original year-prefixed names must be gone after rename
    assert "25最低分" not in df.columns, "25最低分 should not exist after rename"
    assert "25录取人数" not in df.columns, "25录取人数 should not exist after rename"


def test_load_master_2025_drops_historical_year_columns():
    """24*, 23*, 22* columns must all be dropped from output."""
    df = load_master_2025(FIXTURE_PATH)
    hist_cols = [c for c in df.columns if isinstance(c, str) and c[:2] in ("24", "23", "22")]
    assert len(hist_cols) == 0, f"Historical columns still present: {hist_cols}"


def test_load_master_2025_sets_数据年份_to_2025():
    """All rows in output must have 数据年份 == 2025."""
    df = load_master_2025(FIXTURE_PATH)
    assert (df["数据年份"] == 2025).all(), "All rows must have 数据年份=2025"


def test_load_master_2025_preserves_2025_specific_columns():
    """25投档最低分, 25专业组计划 etc. are kept as-is (not renamed, not dropped)."""
    df = load_master_2025(FIXTURE_PATH)
    # These 25-specific cols have no canonical counterpart — must survive
    for col in ("25投档最低分", "25专业组计划", "25专业组录取人数"):
        if col in pd.read_excel(FIXTURE_PATH).columns:
            assert col in df.columns, f"2025-specific column '{col}' should be preserved"


def test_load_master_2025_normalizes_院校代码_to_4_digit_str():
    """院校代码 must be a 4-char string with leading zeros (e.g., 1 → '0001')."""
    df = load_master_2025(FIXTURE_PATH)
    for code in df["院校代码"]:
        assert isinstance(code, str), f"院校代码 should be str, got {type(code)}"
        assert len(code) == 4, f"院校代码 should be 4 chars, got '{code}'"
        assert code.isdigit(), f"院校代码 should be digit string, got '{code}'"


def test_load_master_2025_correct_score_values():
    """Spot check: first row should have 最低分=690 matching fixture Row 0."""
    df = load_master_2025(FIXTURE_PATH)
    row0 = df[df["专业代码"] == "41"].iloc[0]
    assert row0["最低分"] == 690
    assert row0["最低位次"] == 400
    assert row0["录取人数"] == 5


def test_load_master_2025_专业代码_is_str():
    """专业代码 should be normalized to str (not int)."""
    df = load_master_2025(FIXTURE_PATH)
    for val in df["专业代码"]:
        assert isinstance(val, str), f"专业代码 should be str, got {type(val)}: {val}"
