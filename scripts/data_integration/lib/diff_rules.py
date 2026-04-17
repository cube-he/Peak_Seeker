"""Field-typed anomaly detection for cross-source diff reports.

Why field-typed: 分数/位次/人数/文本 的"可接受差异"语义完全不同。单一阈值
无法兼顾（分数差 5 分无感，位次差 5 无意义）。按字段类型分派阈值，得到
可解释、可调整的判定规则。

空值策略：只要一侧为空，不算 anomaly —— 那是"补缺候选"，由 p2_enrich
走独立流程处理，不在 diff 报告里噪声化。
"""
from __future__ import annotations
import math

THRESHOLDS = {
    "score": {"abs": 5, "rel": 0.01},
    "rank": {"abs": None, "rel": 0.05},
    "count": {"abs": 2, "rel": 0.10},
}


def _is_null(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    return False


def is_anomaly(field_type: str, lhs, rhs) -> bool:
    """Return True iff (lhs, rhs) differ enough to count as an anomaly for field_type.

    field_type ∈ {"score", "rank", "count", "text"}.
    Raises ValueError for other field types (misuse catcher).
    """
    if _is_null(lhs) or _is_null(rhs):
        return False
    if field_type == "text":
        return str(lhs) != str(rhs)
    if field_type not in THRESHOLDS:
        raise ValueError(f"unknown field_type: {field_type!r}")
    th = THRESHOLDS[field_type]
    diff = abs(float(lhs) - float(rhs))
    base = max(abs(float(lhs)), abs(float(rhs)), 1)
    rel = diff / base
    if th["abs"] is not None and diff > th["abs"]:
        return True
    if th["rel"] is not None and rel > th["rel"]:
        return True
    return False
