# -*- coding: utf-8 -*-
import pytest
from three_layer.matcher import TwoLevelMatcher, MatchResult


@pytest.fixture
def base_records():
    return [
        {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
         "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
         "name": "数学类", "duration": 4, "tuition": 5000},
        {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
         "enrollmentType": "普通类本科", "groupCode": "101", "code": "02",
         "name": "物理学类", "duration": 4, "tuition": 5000},
        {"_schoolCode": "0002", "_subject": "物理", "batchNodeId": "bkp_b_pt",
         "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
         "name": "法学", "duration": 4, "tuition": 4500},
    ]


@pytest.fixture
def matcher(base_records):
    m = TwoLevelMatcher()
    m.load_base(base_records)
    return m


def test_exact_match(matcher):
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
              "name": "数学类"}
    result = matcher.match(source)
    assert result.match_type == "exact"
    assert result.base_record["code"] == "01"


def test_confidence_match_code_typo(matcher):
    """Code off by 1 but name matches → confidence match."""
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "03",
              "name": "数学类", "duration": 4, "tuition": 5000}
    result = matcher.match(source)
    assert result.match_type == "confidence"
    assert result.confidence >= 0.7
    assert result.base_record["code"] == "01"


def test_no_match_new_record(matcher):
    """Completely different record → new."""
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "102", "code": "99",
              "name": "人工智能", "duration": 4, "tuition": 8000}
    result = matcher.match(source)
    assert result.match_type == "new"
    assert result.confidence < 0.3


def test_ambiguous_match(matcher):
    """Name partially similar, code differs enough to avoid exact match → confidence or review."""
    # code "05" is not in base (base has "01", "02"), so level-1 misses.
    # Within the candidate set the best match is "数学类" (code "01") but
    # name "应用数学" is only partially similar and tuition differs → mid-range score.
    source = {"_schoolCode": "0001", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "05",
              "name": "应用数学", "duration": 4, "tuition": 6000}
    result = matcher.match(source)
    assert result.match_type in ("confidence", "review")


def test_different_school_no_cross_match(matcher):
    """Records from different schools should not cross-match."""
    source = {"_schoolCode": "9999", "_subject": "物理", "batchNodeId": "bkp_b_pt",
              "enrollmentType": "普通类本科", "groupCode": "101", "code": "01",
              "name": "数学类"}
    result = matcher.match(source)
    assert result.match_type == "new"
