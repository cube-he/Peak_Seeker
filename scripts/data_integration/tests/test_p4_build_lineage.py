# -*- coding: utf-8 -*-
"""Tests for P4.2 lineage."""
import pandas as pd

from scripts.data_integration.p4_build_lineage import build_lineage, classify_col_source


def test_classify_col_source_01_suffix():
    assert classify_col_source("最低分_01", "03") == "01"
    assert classify_col_source("最低分_01", "01") == "01"


def test_classify_col_source_respects_row_lineage():
    assert classify_col_source("最低分", "03") == "03"
    assert classify_col_source("最低分", "01") == "01"
    assert classify_col_source("最低分", "03+01候选") == "03"


def test_build_lineage_counts_correctly():
    df = pd.DataFrame({
        "院校代码": ["1001", "2999"],
        "最低分": ["600", None],
        "最低分_01": ["601", "200"],
        "_lineage_source": ["03+01候选", "01"],
    })
    out = build_lineage(df)
    # 院校代码: 03 row and 01 row both non-null
    summary = out["column_source_summary"]["院校代码"]
    assert summary["03"] == 1  # from 03+01候选 row
    assert summary["01"] == 1  # from 01 row
    # 最低分: only 03 row has value
    assert out["column_source_summary"]["最低分"]["03"] == 1
    assert out["column_source_summary"]["最低分"]["null"] == 1
    # 最低分_01: both rows have value, both tagged 01
    assert out["column_source_summary"]["最低分_01"]["01"] == 2


def test_build_lineage_totals():
    df = pd.DataFrame({
        "院校代码": ["1001"],
        "_lineage_source": ["03"],
    })
    out = build_lineage(df)
    assert out["totals"]["rows"] == 1
    assert out["totals"]["cols"] == 1  # _lineage_source is excluded
