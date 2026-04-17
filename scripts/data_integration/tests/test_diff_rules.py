from scripts.data_integration.lib.diff_rules import is_anomaly


def test_score_diff_absolute_threshold():
    assert is_anomaly("score", lhs=600, rhs=606) is True   # diff 6 > 5
    assert is_anomaly("score", lhs=600, rhs=604) is False  # diff 4 ≤ 5, rel 0.67% ≤ 1%


def test_score_diff_relative_threshold():
    # 低分段：绝对差小但相对差 >1%
    assert is_anomaly("score", lhs=300, rhs=304) is True   # diff 4 ≤5 BUT rel 1.33%>1%


def test_rank_diff_uses_relative_only():
    assert is_anomaly("rank", lhs=100, rhs=104) is False   # 4%≤5%
    assert is_anomaly("rank", lhs=100, rhs=106) is True    # 6%>5%


def test_plan_count_diff_relative():
    # absolute > 2 OR relative > 10%. diff=2 not >2, but rel=20%>10% → True
    assert is_anomaly("count", lhs=10, rhs=12) is True


def test_plan_count_diff_absolute():
    assert is_anomaly("count", lhs=100, rhs=105) is True   # diff=5 > 2 → True


def test_text_diff_exact_match():
    assert is_anomaly("text", lhs="哲学类", rhs="哲学类") is False
    assert is_anomaly("text", lhs="哲学类", rhs="哲学类(国际)") is True


def test_diff_returns_false_when_either_side_null():
    """空对非空属于"补缺候选"，不算 anomaly（由另一流程处理）。"""
    assert is_anomaly("score", lhs=None, rhs=600) is False
    assert is_anomaly("score", lhs=600, rhs=float("nan")) is False


def test_unknown_field_type_raises():
    import pytest
    with pytest.raises(ValueError):
        is_anomaly("mystery", lhs=1, rhs=2)
