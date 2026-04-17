# -*- coding: utf-8 -*-
"""Tests for p2_backfill.split_backfill_candidates (P2 Task 11)."""
import pandas as pd
import pytest

from scripts.data_integration.p2_backfill import split_backfill_candidates


PK = {
    "数据年份": 2025,
    "院校代码_国标": "100001",
    "专业代码": "01",
    "批次": "本科批B段",
    "科目": "物理",
}


def test_right_only_rows_go_to_new_rows_bucket():
    enriched = pd.DataFrame([
        {**PK, "_merge": "right_only",
         "最低位次_01": 500, "_backfill_notes": "补缺候选: 最低位次"},
    ])
    b = split_backfill_candidates(enriched)
    assert len(b["new_rows"]) == 1
    assert len(b["field_fill"]) == 0
    assert len(b["no_action"]) == 0
    assert (b["new_rows"]["_lineage_source"] == "01").all()


def test_both_with_backfill_notes_goes_to_field_fill():
    enriched = pd.DataFrame([
        {**PK, "_merge": "both", "_backfill_notes": "补缺候选: 最低位次"},
    ])
    b = split_backfill_candidates(enriched)
    assert len(b["new_rows"]) == 0
    assert len(b["field_fill"]) == 1
    assert (b["field_fill"]["_lineage_source"] == "03+01候选").all()


def test_both_without_backfill_notes_goes_to_no_action():
    enriched = pd.DataFrame([
        {**PK, "_merge": "both", "_backfill_notes": ""},
    ])
    b = split_backfill_candidates(enriched)
    assert len(b["no_action"]) == 1
    assert (b["no_action"]["_lineage_source"] == "03").all()


def test_left_only_goes_to_no_action():
    enriched = pd.DataFrame([
        {**PK, "_merge": "left_only", "_backfill_notes": ""},
    ])
    b = split_backfill_candidates(enriched)
    assert len(b["no_action"]) == 1
    assert (b["no_action"]["_lineage_source"] == "03").all()


def test_total_rows_preserved():
    """三个桶行数之和 == 输入行数。"""
    enriched = pd.DataFrame([
        {**PK, "_merge": "both", "_backfill_notes": "补缺候选: 最低位次"},
        {**PK, "_merge": "both", "_backfill_notes": ""},
        {**PK, "_merge": "right_only", "_backfill_notes": "补缺候选: 最低分"},
        {**PK, "_merge": "left_only", "_backfill_notes": ""},
    ])
    b = split_backfill_candidates(enriched)
    total = len(b["new_rows"]) + len(b["field_fill"]) + len(b["no_action"])
    assert total == len(enriched)


def test_nan_backfill_notes_treated_as_empty_goes_to_no_action():
    """NaN in _backfill_notes should be treated as empty — goes to no_action."""
    enriched = pd.DataFrame([
        {**PK, "_merge": "both", "_backfill_notes": float("nan")},
    ])
    b = split_backfill_candidates(enriched)
    assert len(b["no_action"]) == 1
    assert (b["no_action"]["_lineage_source"] == "03").all()


def test_dict_has_all_three_keys():
    """Return dict must always contain new_rows, field_fill, no_action."""
    enriched = pd.DataFrame([
        {**PK, "_merge": "both", "_backfill_notes": ""},
    ])
    b = split_backfill_candidates(enriched)
    assert set(b.keys()) == {"new_rows", "field_fill", "no_action"}


def test_lineage_source_added_does_not_overwrite_other_columns():
    """Existing columns should be untouched; only _lineage_source is new."""
    enriched = pd.DataFrame([
        {**PK, "_merge": "right_only", "_backfill_notes": "补缺候选: 最低位次",
         "最低位次_01": 1234},
    ])
    b = split_backfill_candidates(enriched)
    row = b["new_rows"].iloc[0]
    assert row["最低位次_01"] == 1234
    assert row["_lineage_source"] == "01"
