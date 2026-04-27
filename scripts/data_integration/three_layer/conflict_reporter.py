# -*- coding: utf-8 -*-
"""Conflict report generator for human review.

Outputs a CSV file sorted by severity, with one row per field conflict.
"""
from __future__ import annotations
import csv
from collections import Counter
from dataclasses import dataclass
from pathlib import Path


@dataclass
class ConflictRecord:
    school_code: str
    school_name: str
    subject: str
    batch: str
    major_code: str
    major_name: str
    field_name: str
    current_value: str
    new_value: str
    source: str
    match_type: str        # "exact" | "confidence" | "review"
    confidence: float
    diff_type: str         # "numeric_small" | "numeric_large" | "text_minor" | "text_major" | "one_side_missing"


_SEVERITY_ORDER = {
    "text_major": 0,
    "numeric_large": 1,
    "one_side_missing": 2,
    "text_minor": 3,
    "numeric_small": 4,
}

_CSV_COLUMNS = [
    "school_code", "school_name", "subject", "batch",
    "major_code", "major_name", "field_name",
    "current_value", "new_value", "source",
    "match_type", "confidence", "diff_type",
]


class ConflictReporter:
    def __init__(self, output_dir: Path | None = None):
        self._records: list[ConflictRecord] = []
        self._output_dir = output_dir or Path("three_layer_output")

    @property
    def count(self) -> int:
        return len(self._records)

    def add_conflict(self, record: ConflictRecord) -> None:
        self._records.append(record)

    def write(self, filename: str = "conflict_report.csv") -> Path:
        """Write conflict report CSV sorted by severity (text_major first, numeric_small last)."""
        self._output_dir.mkdir(parents=True, exist_ok=True)
        path = self._output_dir / filename

        sorted_records = sorted(
            self._records,
            key=lambda r: _SEVERITY_ORDER.get(r.diff_type, 99),
        )

        with open(path, "w", encoding="utf-8-sig", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=_CSV_COLUMNS)
            writer.writeheader()
            for rec in sorted_records:
                writer.writerow({k: getattr(rec, k) for k in _CSV_COLUMNS})

        return path

    def summary(self) -> dict:
        """Return summary statistics grouped by diff_type, source, and match_type."""
        by_type = Counter(r.diff_type for r in self._records)
        by_source = Counter(r.source for r in self._records)
        by_match = Counter(r.match_type for r in self._records)
        return {
            "total": len(self._records),
            "by_diff_type": dict(by_type),
            "by_source": dict(by_source),
            "by_match_type": dict(by_match),
        }
