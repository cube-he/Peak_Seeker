# -*- coding: utf-8 -*-
"""Unit tests for p2_diff_report.build_diff_rows."""
import pandas as pd
import pytest

from scripts.data_integration.p2_diff_report import build_diff_rows, PRIMARY_KEY, OVERLAP_FIELDS


def _row(**extra):
    """Helper: build a joined-row dict with required PK + _merge, overlay extras."""
    base = {
        "数据年份": 2025, "院校代码_国标": "100001",
        "专业代码": "01", "批次": "本科批B段", "科目": "物理",
        "_merge": "both",
    }
    base.update(extra)
    return base


def test_build_diff_rows_skips_matching_values():
    joined = pd.DataFrame([_row(最低分=600, **{"最低分_01": 600})])
    out = build_diff_rows(joined)
    assert len(out) == 0


def test_build_diff_rows_emits_score_diff():
    joined = pd.DataFrame([_row(最低分=600, **{"最低分_01": 610})])
    out = build_diff_rows(joined)
    out_score = out[out["字段"] == "最低分"]
    assert len(out_score) == 1
    r = out_score.iloc[0]
    assert r["03值"] == 600
    assert r["01值"] == 610
    assert r["差值"] == 10.0
    assert r["anomaly"] is True  # 10 > 5 threshold


def test_build_diff_rows_skips_left_only_and_right_only():
    joined = pd.DataFrame([
        _row(最低分=600, **{"最低分_01": 650}, _merge="left_only"),
        _row(最低分=600, **{"最低分_01": 650}, _merge="right_only"),
    ])
    out = build_diff_rows(joined)
    assert len(out) == 0  # only 'both' rows considered


def test_build_diff_rows_skips_both_null():
    joined = pd.DataFrame([_row(最低分=float("nan"), **{"最低分_01": float("nan")})])
    out = build_diff_rows(joined)
    assert len(out) == 0


def test_build_diff_rows_emits_null_mismatch_but_not_anomaly():
    """一侧空一侧有值应入 cross_diff 表（补缺候选），但 anomaly=False。"""
    joined = pd.DataFrame([_row(最低分=600, **{"最低分_01": float("nan")})])
    out = build_diff_rows(joined)
    r = out[out["字段"] == "最低分"].iloc[0]
    assert r["anomaly"] is False


def test_build_diff_rows_text_diff():
    joined = pd.DataFrame([_row(专业="软件工程", **{"专业名称_01": "软件工程(实验班)"})])
    out = build_diff_rows(joined)
    r = out[out["字段"] == "专业名称"].iloc[0]
    assert r["类型"] == "text"
    assert r["anomaly"] is True
