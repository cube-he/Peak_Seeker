# -*- coding: utf-8 -*-
"""Unit tests for batch_dict module."""
import pytest
from scripts.data_integration.lib.batch_dict import load_batch_dict, normalize_batch_name


def test_load_2025_physics_returns_list_of_dicts():
    """加载 2025 物理批次字典，验证返回结构。"""
    entries = load_batch_dict("2025", "物理")
    assert isinstance(entries, list)
    assert len(entries) > 0
    sample = entries[0]
    assert "batch_name" in sample
    assert "category" in sample


def test_normalize_batch_name_canonical_passthrough():
    """规范名称应原样返回。"""
    assert normalize_batch_name("本科批B", year=2025, course="物理") == "本科批B"


def test_normalize_batch_name_alias_mapping():
    """01 的 '本科B' 应映射到 03 的 '本科批B段'。"""
    result = normalize_batch_name("本科B", year=2025, course="物理")
    assert result == "本科批B段"


def test_normalize_unknown_raises():
    """未知批次抛异常，避免静默错误。"""
    with pytest.raises(ValueError, match="未知批次"):
        normalize_batch_name("火星批次", year=2025, course="物理")
