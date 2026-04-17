# -*- coding: utf-8 -*-
import pandas as pd
import pytest
from scripts.data_integration.p2_enrich import enrich_with_01


PK = {"数据年份": 2025, "院校代码_国标": "100001",
      "专业代码": "01", "批次": "本科批B段", "科目": "物理"}


def test_enrich_preserves_03_values_and_keeps_01_columns():
    """03 最低位次 非空 → 不改；01 最低位次_01 保留。"""
    joined = pd.DataFrame([{**PK, "_merge": "both",
                            "最低位次": 500, "最低位次_01": 505}])
    out = enrich_with_01(joined)
    assert out.iloc[0]["最低位次"] == 500
    assert out.iloc[0]["最低位次_01"] == 505


def test_enrich_flags_backfill_candidate_when_03_null():
    """03 最低位次 空，01 非空 → _backfill_notes 含 '最低位次'。"""
    joined = pd.DataFrame([{**PK, "_merge": "both",
                            "最低位次": None, "最低位次_01": 505}])
    out = enrich_with_01(joined)
    assert pd.isna(out.iloc[0]["最低位次"])  # 03 unchanged
    notes = out.iloc[0]["_backfill_notes"]
    assert "最低位次" in notes
    assert notes.startswith("补缺候选")


def test_enrich_backfill_notes_empty_when_no_candidates():
    """两侧都有值 → 不是补缺候选，notes 为空字符串。"""
    joined = pd.DataFrame([{**PK, "_merge": "both",
                            "最低位次": 500, "最低位次_01": 505}])
    out = enrich_with_01(joined)
    assert out.iloc[0]["_backfill_notes"] == ""


def test_enrich_backfill_notes_empty_when_both_null():
    joined = pd.DataFrame([{**PK, "_merge": "both",
                            "最低位次": None, "最低位次_01": None}])
    out = enrich_with_01(joined)
    assert out.iloc[0]["_backfill_notes"] == ""


def test_enrich_backfill_notes_lists_multiple_fields():
    joined = pd.DataFrame([{**PK, "_merge": "both",
                            "最低位次": None, "最低位次_01": 505,
                            "最低分": None, "最低分_01": 620}])
    out = enrich_with_01(joined)
    notes = out.iloc[0]["_backfill_notes"]
    assert "最低位次" in notes
    assert "最低分" in notes


def test_enrich_renames_group_c_to_01_suffix():
    """征集标志 / 压力线 / 办学性质 / 院校分类 → 加 _01 后缀。"""
    joined = pd.DataFrame([{**PK, "_merge": "both",
                            "征集标志": "征集",
                            "压力线": 553,
                            "办学性质": "公办",
                            "院校分类": "综合"}])
    out = enrich_with_01(joined)
    assert "征集标志" not in out.columns
    assert "征集标志_01" in out.columns
    assert "压力线_01" in out.columns
    assert "办学性质_01" in out.columns
    assert "院校分类_01" in out.columns
    assert out.iloc[0]["征集标志_01"] == "征集"


def test_enrich_keeps_left_only_and_right_only_rows():
    joined = pd.DataFrame([
        {**PK, "_merge": "both", "最低位次": 500, "最低位次_01": 505},
        {**PK, "院校代码_国标": "100002", "_merge": "left_only",
         "最低位次": 400, "最低位次_01": None},
        {**PK, "院校代码_国标": "100003", "_merge": "right_only",
         "最低位次": None, "最低位次_01": 700},
    ])
    out = enrich_with_01(joined)
    assert len(out) == 3
    # right_only row also flagged since 03 is null and _01 has data
    right = out[out["_merge"] == "right_only"].iloc[0]
    assert "最低位次" in right["_backfill_notes"]
    # left_only: 01 side null → no candidates
    left = out[out["_merge"] == "left_only"].iloc[0]
    assert left["_backfill_notes"] == ""
