# -*- coding: utf-8 -*-
"""Unit tests for code_mapper module."""
from pathlib import Path
import pytest
from scripts.data_integration.lib.code_mapper import CodeMapper

FIXTURE = Path(__file__).parent / "fixtures" / "mini_code_map.csv"


def test_load_fixture():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.size() == 3


def test_enroll_to_national():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.enroll_to_national("0001") == "10001"
    assert cm.enroll_to_national("1234") == "10487"


def test_national_to_enroll():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.national_to_enroll("10003") == "0002"


def test_missing_enroll_returns_none():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.enroll_to_national("9999") is None


def test_name_by_enroll():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.name_by_enroll("0001") == "北京大学"


def test_add_patch_increments_size():
    cm = CodeMapper.from_csv(FIXTURE)
    cm.add_patch(enroll="7777", national="99999", name="立方试验学院")
    assert cm.size() == 4
    assert cm.enroll_to_national("7777") == "99999"


def test_enroll_code_preserves_leading_zero():
    """四川招生代码保留前导零（字符串类型）。"""
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.enroll_to_national(1) == "10001"
    assert cm.enroll_to_national("1") == "10001"
