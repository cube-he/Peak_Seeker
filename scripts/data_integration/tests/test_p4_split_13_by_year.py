# -*- coding: utf-8 -*-
"""Tests for P4.1b split_by_year."""
import pandas as pd

from scripts.data_integration.p4_split_13_by_year import split_by_year


def test_split_by_year_basic():
    df = pd.DataFrame({
        "_meta_year": ["2023", "2024", "2025", "2025"],
        "院校代码": ["a", "b", "c", "d"],
    })
    cur, hist = split_by_year(df, current_year="2025")
    assert len(cur) == 2
    assert len(hist) == 2
    assert set(cur["院校代码"]) == {"c", "d"}
    assert set(hist["_meta_year"]) == {"2023", "2024"}


def test_split_by_year_empty_current():
    df = pd.DataFrame({"_meta_year": ["2023"], "x": ["a"]})
    cur, hist = split_by_year(df, current_year="2025")
    assert len(cur) == 0
    assert len(hist) == 1
