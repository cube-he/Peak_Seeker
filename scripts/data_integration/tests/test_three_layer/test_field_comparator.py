# -*- coding: utf-8 -*-
import pytest
from three_layer.field_comparator import (
    compare_string, compare_numeric, compare_code,
    compare_fields, FieldDiff,
)


def test_string_exact_match():
    assert compare_string("计算机科学与技术", "计算机科学与技术") == 1.0


def test_string_similar():
    score = compare_string("计算机科学与技术", "计算机类")
    assert 0.3 < score < 0.8


def test_string_different():
    score = compare_string("计算机科学与技术", "法学")
    assert score < 0.3


def test_string_none_handling():
    assert compare_string(None, None) == 1.0
    assert compare_string("abc", None) == 0.0


def test_numeric_exact():
    assert compare_numeric(690, 690) == 1.0


def test_numeric_close():
    score = compare_numeric(690, 692)
    assert score > 0.8


def test_numeric_far():
    score = compare_numeric(690, 500)
    assert score < 0.3


def test_numeric_none():
    assert compare_numeric(None, None) == 1.0
    assert compare_numeric(690, None) == 0.0


def test_code_exact():
    assert compare_code("01", "01") == 1.0


def test_code_off_by_one():
    score = compare_code("05", "06")
    assert 0.5 < score < 1.0


def test_code_different():
    assert compare_code("01", "99") == 0.0


def test_compare_fields_returns_diff():
    result = compare_fields(
        {"name": "计算机", "min": 690, "code": "01"},
        {"name": "计算机科学", "min": 692, "code": "01"},
    )
    assert isinstance(result, FieldDiff)
    assert 0.0 <= result.score <= 1.0
    assert len(result.details) > 0
