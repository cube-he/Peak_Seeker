# -*- coding: utf-8 -*-
"""Field-level comparison for confidence matching.

Compares two records field-by-field, returning a weighted similarity score.
Used by the two-level matcher when exact match fails.
"""
from __future__ import annotations
from dataclasses import dataclass, field


@dataclass
class FieldDiff:
    """Result of comparing two records."""
    score: float                          # 0.0 - 1.0 overall similarity
    details: dict[str, float] = field(default_factory=dict)  # per-field scores


# Field classification for auto-dispatch
_STRING_FIELDS = {
    "name", "fullName", "category", "discipline", "majorNote",
    "note", "subjectReq", "oldBatch",
}
_NUMERIC_FIELDS = {
    "duration", "tuition", "plan", "enrolled",
    "min", "minRank", "avg", "avgRank", "max", "maxRank",
}
_CODE_FIELDS = {"code", "groupCode"}

# Weights (higher = more important for matching identity)
_WEIGHTS = {
    "code": 15, "name": 25, "fullName": 10,
    "category": 8, "discipline": 5, "majorNote": 5,
    "duration": 5, "tuition": 5,
    "plan": 5, "enrolled": 3, "min": 5, "minRank": 4,
    "subjectReq": 5,
}
_DEFAULT_WEIGHT = 3


def compare_string(a: str | None, b: str | None) -> float:
    """Compare two strings using character-level similarity."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    a, b = str(a).strip(), str(b).strip()
    if a == b:
        return 1.0
    if not a or not b:
        return 0.0
    # Simple ratio based on longest common subsequence length
    try:
        from rapidfuzz import fuzz
        return fuzz.ratio(a, b) / 100.0
    except ImportError:
        # Fallback: character overlap
        common = set(a) & set(b)
        return len(common) / max(len(set(a)), len(set(b)))


def compare_numeric(a: int | float | None, b: int | float | None) -> float:
    """Compare two numeric values by closeness."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    try:
        a, b = float(a), float(b)
    except (ValueError, TypeError):
        return 0.0
    if a == b:
        return 1.0
    diff = abs(a - b)
    max_val = max(abs(a), abs(b), 1)
    # Multiply by 3 so a ~27% relative difference scores near 0 (< 0.3),
    # while a tiny difference (< 1%) stays near 1.0.
    return max(0.0, 1.0 - 3.0 * diff / max_val)


def compare_code(a: str | None, b: str | None) -> float:
    """Compare code fields (exact or near-match)."""
    if a is None and b is None:
        return 1.0
    if a is None or b is None:
        return 0.0
    a, b = str(a).strip(), str(b).strip()
    if a == b:
        return 1.0
    # Numeric codes: off-by-one or off-by-two
    try:
        diff = abs(int(a) - int(b))
        if diff <= 1:
            return 0.7
        if diff <= 2:
            return 0.4
    except ValueError:
        pass
    return 0.0


def compare_fields(record_a: dict, record_b: dict) -> FieldDiff:
    """Compare all shared fields between two records.

    Returns a weighted average similarity score and per-field details.
    """
    all_keys = set(record_a.keys()) | set(record_b.keys())
    # Exclude internal keys
    all_keys = {k for k in all_keys if not k.startswith("_")}

    details = {}
    total_weight = 0.0
    total_score = 0.0

    for key in all_keys:
        va = record_a.get(key)
        vb = record_b.get(key)
        weight = _WEIGHTS.get(key, _DEFAULT_WEIGHT)

        if key in _CODE_FIELDS:
            sim = compare_code(va, vb)
        elif key in _NUMERIC_FIELDS:
            sim = compare_numeric(va, vb)
        else:
            sim = compare_string(va, vb)

        details[key] = sim
        total_weight += weight
        total_score += sim * weight

    overall = total_score / total_weight if total_weight > 0 else 0.0
    return FieldDiff(score=round(overall, 4), details=details)
