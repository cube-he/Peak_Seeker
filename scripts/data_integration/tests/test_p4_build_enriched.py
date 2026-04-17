# -*- coding: utf-8 -*-
"""Tests for P4.1 build_enriched."""
import pandas as pd

from scripts.data_integration.p4_build_enriched import build_enriched


def _patched(rows):
    return pd.DataFrame(rows, columns=["数据年份", "院校代码", "专业代码", "批次", "科目", "最低分"])


def _field_fill(rows):
    return pd.DataFrame(rows, columns=["数据年份", "院校代码", "专业代码", "批次", "科目",
                                         "最低分_01", "enterLine"])


def _new_rows(rows):
    return pd.DataFrame(rows, columns=["数据年份", "院校代码", "专业代码", "批次", "科目",
                                         "最低分_01"])


def test_build_enriched_base_rows_tagged_03():
    patched = _patched([["2025", "1001", "01", "本科一批", "物理", "600"]])
    ff = _field_fill([])
    nr = _new_rows([])
    out = build_enriched(patched, ff, nr)
    assert len(out) == 1
    assert out.iloc[0]["_lineage_source"] == "03"


def test_build_enriched_backfill_marks_03_01():
    patched = _patched([
        ["2025", "1001", "01", "本科一批", "物理", "600"],
        ["2025", "1002", "01", "本科一批", "物理", "610"],
    ])
    ff = _field_fill([
        ["2025", "1001", "01", "本科一批", "物理", "601", "590"],
    ])
    nr = _new_rows([])
    out = build_enriched(patched, ff, nr)
    assert len(out) == 2
    row0 = out[out["院校代码"] == "1001"].iloc[0]
    row1 = out[out["院校代码"] == "1002"].iloc[0]
    assert row0["_lineage_source"] == "03+01候选"
    assert row0["最低分_01"] == "601"
    assert row1["_lineage_source"] == "03"
    # row1's _01 cols should be NaN
    assert pd.isna(row1["最低分_01"])


def test_build_enriched_appends_new_rows_as_01():
    patched = _patched([["2025", "1001", "01", "本科一批", "物理", "600"]])
    ff = _field_fill([])
    nr = _new_rows([["2025", "2999", "05", "专科批", "历史", "200"]])
    out = build_enriched(patched, ff, nr)
    assert len(out) == 2
    new_row = out[out["院校代码"] == "2999"].iloc[0]
    assert new_row["_lineage_source"] == "01"
    # Original 03 col should be NaN for new row
    assert pd.isna(new_row["最低分"])
    assert new_row["最低分_01"] == "200"
