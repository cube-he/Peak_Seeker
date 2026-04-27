# -*- coding: utf-8 -*-
"""Two-level matching engine for data integration.

Level 1: Exact match on 6 fields (schoolCode + subject + batchNodeId +
         enrollmentType + groupCode + majorCode)
Level 2: Confidence match using full-field comparison within the
         (schoolCode + subject + batchNodeId) candidate set.

Thresholds:
  >= 0.70  →  "confidence" match (auto-merge, flagged)
  0.30-0.70 → "review" (human review needed)
  < 0.30  →  "new" record
"""
from __future__ import annotations
from dataclasses import dataclass, field
from collections import defaultdict

from three_layer.field_comparator import compare_fields


@dataclass
class MatchResult:
    match_type: str           # "exact" | "confidence" | "review" | "new"
    confidence: float         # 0.0 - 1.0
    base_record: dict | None  # the matched base record (or None if new)
    source_record: dict       # the incoming record
    field_diffs: dict = field(default_factory=dict)  # per-field similarity

    THRESHOLD_HIGH = 0.70
    THRESHOLD_LOW = 0.30


class TwoLevelMatcher:
    """Two-level matching engine."""

    def __init__(self):
        self._exact_index: dict[tuple, dict] = {}
        self._candidate_index: dict[tuple, list[dict]] = defaultdict(list)

    def load_base(self, records: list[dict]) -> None:
        """Index base records for matching."""
        self._exact_index.clear()
        self._candidate_index.clear()
        for rec in records:
            exact_key = self._exact_key(rec)
            self._exact_index[exact_key] = rec
            cand_key = self._candidate_key(rec)
            self._candidate_index[cand_key].append(rec)

    def match(self, source: dict) -> MatchResult:
        """Match a source record against the base."""
        # Level 1: exact match
        exact_key = self._exact_key(source)
        if exact_key in self._exact_index:
            return MatchResult(
                match_type="exact",
                confidence=1.0,
                base_record=self._exact_index[exact_key],
                source_record=source,
            )

        # Level 2: confidence match within candidate set
        cand_key = self._candidate_key(source)
        candidates = self._candidate_index.get(cand_key, [])

        if not candidates:
            return MatchResult(
                match_type="new",
                confidence=0.0,
                base_record=None,
                source_record=source,
            )

        best_score = 0.0
        best_record = None
        best_diffs = {}

        for cand in candidates:
            diff = compare_fields(source, cand)
            if diff.score > best_score:
                best_score = diff.score
                best_record = cand
                best_diffs = diff.details

        if best_score >= MatchResult.THRESHOLD_HIGH:
            match_type = "confidence"
        elif best_score >= MatchResult.THRESHOLD_LOW:
            match_type = "review"
        else:
            match_type = "new"
            best_record = None

        return MatchResult(
            match_type=match_type,
            confidence=round(best_score, 4),
            base_record=best_record if match_type != "new" else None,
            source_record=source,
            field_diffs=best_diffs,
        )

    @staticmethod
    def _exact_key(rec: dict) -> tuple:
        return (
            rec.get("_schoolCode", ""),
            rec.get("_subject", ""),
            rec.get("batchNodeId", ""),
            rec.get("enrollmentType", ""),
            rec.get("groupCode", ""),
            rec.get("code", ""),
        )

    @staticmethod
    def _candidate_key(rec: dict) -> tuple:
        return (
            rec.get("_schoolCode", ""),
            rec.get("_subject", ""),
            rec.get("batchNodeId", ""),
        )
