# -*- coding: utf-8 -*-
"""Tests for P3.5 alignment to 03 master."""
import pandas as pd

from scripts.data_integration.p3_align_to_master import align_to_master, classify_miss


def _make_master():
    return pd.DataFrame({
        "数据年份": ["2025", "2025", "2024"],
        "院校代码": ["1001", "1002", "1001"],
        "专业代码": ["01", "02", "01"],
    })


def test_align_hit_marks_in_master():
    master = _make_master()
    candidate = pd.DataFrame({
        "_meta_year": ["2025"],
        "院校代码": ["1001"],
        "专业代码": ["01"],
    })
    aligned, not_in_m, needs_rev = align_to_master(candidate, master)
    assert aligned.iloc[0]["_in_master"] == True
    assert len(not_in_m) == 0
    assert len(needs_rev) == 0


def test_align_miss_legit_code_goes_to_not_in_master():
    master = _make_master()
    candidate = pd.DataFrame({
        "_meta_year": ["2025"],
        "院校代码": ["1099"],  # legit 4-digit but master doesn't have
        "专业代码": ["01"],
    })
    aligned, not_in_m, needs_rev = align_to_master(candidate, master)
    assert aligned.iloc[0]["_in_master"] == False
    assert len(not_in_m) == 1
    assert len(needs_rev) == 0


def test_align_miss_malformed_goes_to_needs_review():
    master = _make_master()
    candidate = pd.DataFrame({
        "_meta_year": ["2025"],
        "院校代码": ["2K"],  # short alphanum, likely OCR or legit special
        "专业代码": ["@@"],  # non-alphanumeric
    })
    aligned, not_in_m, needs_rev = align_to_master(candidate, master)
    assert len(needs_rev) == 1
    assert aligned.iloc[0]["_in_master"] == False


def test_classify_miss_malformed_college():
    assert classify_miss("2K", "01") == "malformed"
    assert classify_miss("ABC", "01") == "malformed"
    assert classify_miss("12345", "01") == "malformed"  # too long


def test_classify_miss_malformed_major():
    assert classify_miss("1001", "@@") == "malformed"
    assert classify_miss("1001", "") == "malformed"


def test_classify_miss_legit_miss():
    assert classify_miss("1099", "05") == "legit_miss"
    assert classify_miss("9999", "C9") == "legit_miss"
