# -*- coding: utf-8 -*-
"""Tests for P3.6 build_clean."""
import pandas as pd

from scripts.data_integration.p3_build_clean import build_clean


def test_build_clean_keeps_hits_and_legit_miss():
    df = pd.DataFrame({
        "院校代码": ["1001", "1099", "2K"],
        "_in_master": [True, False, False],
        "_miss_kind": ["", "legit_miss", "malformed"],
    })
    out = build_clean(df)
    assert len(out) == 2
    assert "1001" in out["院校代码"].values
    assert "1099" in out["院校代码"].values
    assert "2K" not in out["院校代码"].values


def test_build_clean_drops_malformed_only():
    df = pd.DataFrame({
        "院校代码": ["A", "B"],
        "_in_master": [False, False],
        "_miss_kind": ["malformed", "malformed"],
    })
    out = build_clean(df)
    assert len(out) == 0


def test_build_clean_all_hits():
    df = pd.DataFrame({
        "院校代码": ["1001", "1002"],
        "_in_master": [True, True],
        "_miss_kind": ["", ""],
    })
    out = build_clean(df)
    assert len(out) == 2
