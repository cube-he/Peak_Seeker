# -*- coding: utf-8 -*-
"""Tests for P4.5 smoke_test helpers."""
import pandas as pd

from scripts.data_integration.p4_smoke_test import (
    make_key, stratified_sample, verify_sample,
)


def test_stratified_sample_equal_buckets():
    df = pd.DataFrame({
        "_lineage_source": ["03"] * 50 + ["01"] * 50,
        "数据年份": ["2025"] * 100,
    })
    out = stratified_sample(df, n_total=10, seed=1)
    assert len(out) == 10
    # Each bucket should contribute 5
    counts = out["_lineage_source"].value_counts().to_dict()
    assert counts.get("03", 0) == 5
    assert counts.get("01", 0) == 5


def test_verify_sample_03_in_patched_ok():
    row = pd.Series({
        "数据年份": "2025", "院校代码": "1001", "专业代码": "01", "批次": "本科一批", "科目": "物理",
        "_lineage_source": "03", "最低分_01": None,
    })
    ok, _ = verify_sample(row, {("2025", "1001", "01", "本科一批", "物理")}, set())
    assert ok


def test_verify_sample_03_not_in_patched_fails():
    row = pd.Series({
        "数据年份": "2025", "院校代码": "9999", "专业代码": "01", "批次": "本科一批", "科目": "物理",
        "_lineage_source": "03", "最低分_01": None,
    })
    ok, reason = verify_sample(row, set(), set())
    assert not ok
    assert "not in 03_patched" in reason


def test_verify_sample_03_with_01_values_fails():
    row = pd.Series({
        "数据年份": "2025", "院校代码": "1001", "专业代码": "01", "批次": "本科一批", "科目": "物理",
        "_lineage_source": "03", "最低分_01": "600",
    })
    ok, reason = verify_sample(row, {("2025", "1001", "01", "本科一批", "物理")}, set())
    assert not ok
    assert "has _01 values" in reason


def test_verify_sample_0301_candidate_requires_both():
    key = ("2025", "1001", "01", "本科一批", "物理")
    row = pd.Series({
        "数据年份": "2025", "院校代码": "1001", "专业代码": "01", "批次": "本科一批", "科目": "物理",
        "_lineage_source": "03+01候选", "最低分_01": "600",
    })
    ok, _ = verify_sample(row, {key}, set())
    assert ok

    row2 = pd.Series({**row.to_dict(), "最低分_01": None})
    ok2, reason2 = verify_sample(row2, {key}, set())
    assert not ok2
    assert "no _01" in reason2


def test_make_key_strips_whitespace():
    row = pd.Series({"数据年份": " 2025 ", "院校代码": "1001", "专业代码": "01", "批次": "本科一批", "科目": "物理"})
    assert make_key(row) == ("2025", "1001", "01", "本科一批", "物理")
