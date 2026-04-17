# -*- coding: utf-8 -*-
"""Tests for p2_join.join_03_and_01_2025."""
from pathlib import Path

import pandas as pd
import pytest

from scripts.data_integration.lib.code_mapper import CodeMapper
from scripts.data_integration.p2_join import join_03_and_01_2025

FIXTURES = Path(__file__).parent / "fixtures"
FIXTURE_03 = FIXTURES / "mini_03_for_join.xlsx"
FIXTURE_01 = FIXTURES / "mini_01_for_join.json"


def _make_test_mapper() -> CodeMapper:
    """Build an in-memory CodeMapper with fixture-specific mappings.

    Using a test-specific mapper keeps tests hermetic — independent of the
    real 编码映射表_招生代码_国标代码.csv file on disk.

    Mapping:
      0001 → 100011 (北大)   — matches Row 0 of 03 fixture to Row 0 of 01 fixture
      0002 → 100021 (清华)   — no match in 01 fixture (right_only test)
    """
    mapper = CodeMapper()
    mapper.add_patch(enroll="0001", national="100011", name="北京大学")
    mapper.add_patch(enroll="0002", national="100021", name="清华大学")
    return mapper


class TestJoinIndicatorColumn:
    def test_merge_indicator_present(self):
        """Output must have a '_merge' column."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        assert "_merge" in df.columns, "'_merge' indicator column must be present"

    def test_merge_indicator_has_both(self):
        """At least one row should be 'both' — Row 0 of 03 matches Row 0 of 01."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        counts = df["_merge"].value_counts()
        assert counts.get("both", 0) >= 1, (
            f"Expected ≥1 'both' row but got: {counts.to_dict()}"
        )

    def test_merge_indicator_has_left_only(self):
        """Row 1 of 03 (清华, 42, 本科批A段_国家专项) has no counterpart in 01 → left_only."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        counts = df["_merge"].value_counts()
        assert counts.get("left_only", 0) >= 1, (
            f"Expected ≥1 'left_only' row but got: {counts.to_dict()}"
        )

    def test_merge_indicator_has_right_only(self):
        """Row 1 of 01 (999999, 99, 本科B) has no counterpart in 03 → right_only."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        counts = df["_merge"].value_counts()
        assert counts.get("right_only", 0) >= 1, (
            f"Expected ≥1 'right_only' row but got: {counts.to_dict()}"
        )

    def test_merge_total_rows(self):
        """Total rows = both(1) + left_only(1) + right_only(1) = 3."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        assert len(df) == 3, (
            f"Expected 3 total rows (1 both + 1 left_only + 1 right_only), got {len(df)}"
        )


class TestJoinBridging:
    def test_bridges_via_mapper(self):
        """The matched row must prove that 03's 四川招生码 was bridged to 国标 correctly.

        03 Row 0: 院校代码=0001 → bridge → 院校代码_国标=100011
        01 Row 0: 院校代码_国标=100011, 专业代码=41, 批次=本科B→本科批B段, 科目=物理
        They should produce a 'both' row with 院校代码_国标='100011'.
        """
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        both_rows = df[df["_merge"] == "both"]
        assert len(both_rows) == 1
        row = both_rows.iloc[0]
        assert row["院校代码_国标"] == "100011", (
            f"Expected 院校代码_国标='100011', got '{row['院校代码_国标']}'"
        )
        assert row["专业代码"] == "41"

    def test_03_original_enroll_code_preserved(self):
        """03's original 院校代码 (四川招生码) should still be in the output."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        assert "院校代码" in df.columns, "Original 院校代码 from 03 should be preserved"
        both_rows = df[df["_merge"] == "both"]
        assert both_rows.iloc[0]["院校代码"] == "0001"

    def test_01_batch_normalized_before_join(self):
        """01's '本科B' should be normalized to '本科批B段' so it matches 03.

        If normalization fails, the row would appear as right_only instead of both.
        This test confirms the join key alignment worked.
        """
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        both_rows = df[df["_merge"] == "both"]
        # After outer join, join key columns retain canonical value
        assert both_rows.iloc[0]["批次"] == "本科批B段", (
            "批次 in joined row should be canonical '本科批B段'"
        )


class TestJoinUnmappableRows:
    def test_unmappable_03_row_is_left_only(self):
        """A 03 row whose 院校代码 has no bridge must appear as left_only, not silently dropped.

        Uses a mapper that only knows 0001 → omits 0002, so Row 1 of 03 (清华, 0002)
        has no bridge → NaN 院校代码_国标 → left_only.
        """
        # Mapper with only 北大 mapping; 清华 (0002) has no entry
        mapper_partial = CodeMapper()
        mapper_partial.add_patch(enroll="0001", national="100011", name="北京大学")
        # 0002 deliberately omitted

        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=mapper_partial,
        )
        counts = df["_merge"].value_counts()
        # With partial mapper: 北大 row matches → both; 清华 row has NaN bridge → left_only;
        # 01 row 999999 has no bridge → right_only
        assert counts.get("both", 0) == 1
        assert counts.get("left_only", 0) == 1  # 清华 unmapped
        assert counts.get("right_only", 0) == 1

    def test_unmappable_03_row_has_nan_national_code(self):
        """The unmappable row must have NaN (not 'None' or 'nan' string) for 院校代码_国标."""
        mapper_partial = CodeMapper()
        mapper_partial.add_patch(enroll="0001", national="100011", name="北京大学")
        # 0002 not mapped

        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=mapper_partial,
        )
        import pandas as pd
        lo = df[df["_merge"] == "left_only"]
        unmapped = lo[lo["院校代码_国标"].isna()]
        assert len(unmapped) == 1, "One row should have NaN 院校代码_国标 (unmappable bridge)"
        # Confirm it's truly NaN, not a stringified placeholder
        val = unmapped.iloc[0]["院校代码_国标"]
        assert pd.isna(val), f"Expected NaN, got {val!r}"


class TestJoinColumnConflicts:
    def test_score_columns_keep_03_as_primary(self):
        """03's 最低分 stays as '最低分', 01's becomes '最低分_01' per suffix=('', '_01')."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        both_rows = df[df["_merge"] == "both"]
        row = both_rows.iloc[0]
        # 03 side (SSoT per ADR-001) — bare name
        assert "最低分" in df.columns
        assert row["最低分"] == 690  # from 03 fixture
        # 01 side — suffixed
        if "最低分_01" in df.columns:
            assert row["最低分_01"] == 690  # 01 fixture also has 690 for this row

    def test_join_year_is_2025(self):
        """All rows must have 数据年份=2025."""
        df = join_03_and_01_2025(
            path_03=FIXTURE_03,
            path_01=FIXTURE_01,
            mapper=_make_test_mapper(),
        )
        assert (df["数据年份"] == 2025).all()
