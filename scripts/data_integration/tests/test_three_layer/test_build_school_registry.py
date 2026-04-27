# -*- coding: utf-8 -*-
"""Tests for school registry builder."""
import json
import pytest
from pathlib import Path
from three_layer.build_school_registry import build_registry, transform_row

OUTPUT = Path(__file__).resolve().parents[2] / "three_layer_output" / "school_registry.json"


def test_transform_row_basic():
    """A minimal row should produce correct structure."""
    # Simulate a row tuple (90 cols) with key fields set
    row = [None] * 90
    row[0] = "0001"           # 院校代码
    row[1] = "北京大学"        # 院校名称
    row[2] = "北京"           # 院校省份
    row[3] = "海淀区"         # 院校城市
    row[5] = "综合"           # 院校类型
    row[6] = "公办"           # 办学性质
    row[12] = "是"            # 是否双一流
    row[14] = 2               # 院校排名
    row[41] = 1898            # 建校年份
    row[69] = 4.6             # 综合满意度
    row[70] = 1890            # 综合评价人数
    row[71] = 83; row[72] = 23; row[73] = 65; row[74] = 178; row[75] = 1541

    code, school = transform_row(row)
    assert code == "0001"
    assert school["name"] == "北京大学"
    assert school["location"]["province"] == "北京"
    assert school["basic"]["type"] == "综合"
    assert school["tags"]["isDoubleFirstClass"] is True
    assert school["rankings"]["composite"] == 2
    assert school["basic"]["founded"] == 1898
    assert school["satisfaction"]["overall"]["score"] == 4.6
    assert school["satisfaction"]["overall"]["stars"] == [83, 23, 65, 178, 1541]


def test_transform_row_null_handling():
    """Null/empty values should become None, not crash."""
    row = [None] * 90
    row[0] = "9999"
    row[1] = "测试大学"
    code, school = transform_row(row)
    assert code == "9999"
    assert school["rankings"]["composite"] is None
    assert school["basic"]["founded"] is None


def test_transform_row_percentage_parsing():
    """保研率 '58.6%' should become 58.6."""
    row = [None] * 90
    row[0] = "0001"; row[1] = "Test"
    row[21] = "58.6%"
    _, school = transform_row(row)
    assert school["academics"]["postgraduateRate"] == 58.6


def test_build_registry_structure():
    """Full build should produce valid meta + schools dict."""
    registry = build_registry()
    assert registry["meta"]["year"] == 2025
    assert registry["meta"]["count"] == len(registry["schools"])
    assert registry["meta"]["count"] > 2000
    # Spot check
    assert "0001" in registry["schools"]
    assert registry["schools"]["0001"]["name"] == "北京大学"


def test_output_file_has_all_groups():
    """Every school should have all 10 groups."""
    registry = build_registry()
    groups = {"name", "location", "basic", "tags", "history", "ids",
              "rankings", "academics", "admissionRules", "links", "satisfaction"}
    for code, school in list(registry["schools"].items())[:10]:
        missing = groups - set(school.keys())
        assert not missing, f"School {code} missing groups: {missing}"
