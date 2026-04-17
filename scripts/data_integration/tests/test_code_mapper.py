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


def test_from_csv_collects_conflicts_when_national_code_duplicated(tmp_path):
    """同一 national_code 出现多次：记录到 conflicts 列表，保留首个值。"""
    csv = tmp_path / "dup.csv"
    csv.write_text(
        "招生代码,国标代码,院校\n"
        "1001,100001,A大学\n"
        "1002,100001,A大学（分部）\n",
        encoding="utf-8-sig",
    )
    m = CodeMapper.from_csv(csv)
    assert len(m.conflicts) == 1
    conflict = m.conflicts[0]
    assert conflict["national_code"] == "100001"
    assert conflict["existing_enroll"] == "1001"  # first wins
    assert conflict["new_enroll"] == "1002"
    # first mapping preserved
    assert m.national_to_enroll("100001") == "1001"


def test_add_patch_rejects_overwrite_by_default():
    """add_patch 默认不覆盖已有映射；需要 overwrite=True 显式允许。"""
    m = CodeMapper()
    m.add_patch(enroll="0001", national="100001", name="A大学")
    with pytest.raises(ValueError) as exc:
        m.add_patch(enroll="0001", national="999999", name="冲突")
    assert "已有映射" in str(exc.value) or "exists" in str(exc.value).lower()
    # overwrite=True 允许
    m.add_patch(enroll="0001", national="999999", name="覆盖", overwrite=True)
    assert m.enroll_to_national("0001") == "999999"
