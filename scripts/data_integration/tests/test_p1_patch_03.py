# -*- coding: utf-8 -*-
"""Tests for p1_patch_03 module."""
from pathlib import Path
import pytest
import pandas as pd
from scripts.data_integration.p1_patch_03 import (
    load_master,
    find_duplicates,
    select_most_complete,
    find_score_anomalies,
    PRIMARY_KEY,
)

FIXTURE = Path(__file__).parent / "fixtures" / "mini_03.xlsx"


def test_load_master_returns_df():
    df = load_master(FIXTURE)
    assert len(df) == 5
    assert "院校代码" in df.columns


def test_find_duplicates_detects_one_group():
    df = load_master(FIXTURE)
    groups = find_duplicates(df, PRIMARY_KEY)
    assert len(groups) == 1
    assert len(groups[0]) == 2


def test_select_most_complete_keeps_one():
    df = load_master(FIXTURE)
    groups = find_duplicates(df, PRIMARY_KEY)
    kept_idx, dropped_idx = select_most_complete(df, groups[0])
    assert kept_idx in groups[0]
    assert len(dropped_idx) == 1
    assert kept_idx not in dropped_idx


def test_find_score_anomalies_flags_mean_gt_max():
    df = load_master(FIXTURE)
    anomalies = find_score_anomalies(df)
    mask = (
        (anomalies["院校代码"] == 2)
        & (anomalies["anomaly_type"] == "24_mean_gt_max")
    )
    assert mask.any()


def test_find_score_anomalies_flags_min_gt_max():
    df = load_master(FIXTURE)
    anomalies = find_score_anomalies(df)
    mask = (
        (anomalies["院校代码"] == 3)
        & (anomalies["anomaly_type"] == "23_min_gt_max")
    )
    assert mask.any()


def test_find_score_anomalies_flags_missing_major_code():
    df = load_master(FIXTURE)
    anomalies = find_score_anomalies(df)
    assert len(anomalies) >= 2
