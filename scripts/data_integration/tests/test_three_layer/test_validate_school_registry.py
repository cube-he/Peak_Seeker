# -*- coding: utf-8 -*-
"""Tests for school registry cross-validation."""
import pytest
from three_layer.validate_school_registry import (
    load_02_school_map, cross_validate, ValidationReport,
)


def test_load_02_school_map():
    """Should load 02/院校库 into a dict keyed by 国标代码."""
    schools = load_02_school_map()
    assert len(schools) > 2000
    # National code 10003 is Tsinghua — must be present
    assert "10003" in schools


def test_cross_validate_produces_report():
    """Cross-validation should return a report with non-negative stats."""
    report = cross_validate()
    assert isinstance(report, ValidationReport)
    assert report.matched >= 0
    assert report.unmatched_in_registry >= 0
    assert report.unmatched_in_02 >= 0
    assert len(report.field_diffs) >= 0
