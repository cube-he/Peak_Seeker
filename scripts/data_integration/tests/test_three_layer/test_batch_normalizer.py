# -*- coding: utf-8 -*-
"""Tests for extended batch name normalization across all sources."""
import pytest
from three_layer.batch_normalizer import normalize_batch, BatchNormalizeError


@pytest.mark.parametrize("raw,etype,expected", [
    # 01 API variants
    ("本科B", None, "bkp_b"),               # 01 uses short names
    ("本科A", None, "bkp_a"),
    ("提前", None, "bktqp"),
    ("专科", None, "zkp"),
    ("专科提前", None, "zktqp"),
    # 03/A 李老师 variants
    ("本科提前批A段", "军事类", "bktqp_a_js"),
    ("本科批B段", "普通类本科", "bkp_b_pt"),
    # 03/C 万能版 variants
    ("本科批B段普通类", None, "bkp_b_pt"),
    ("本科提前批B段国家公费师范生", None, "bktqp_b_gjgfsf"),
    # 03/F 曦鸿仕 variants
    ("本科第一批", None, "bkp_b"),            # old gaokao name → new
    ("本科第二批", None, "bkp_b"),
    ("专科批", None, "zkp"),
])
def test_normalize_known_variants(raw, etype, expected):
    result = normalize_batch(raw, etype)
    assert result == expected or result.startswith(expected)


def test_unknown_batch_raises():
    with pytest.raises(BatchNormalizeError):
        normalize_batch("完全不存在的批次", None)
