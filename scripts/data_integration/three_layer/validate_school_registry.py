# -*- coding: utf-8 -*-
"""Cross-validate school_registry.json against 02/院校库_全国.

Matches schools by 国标代码 (ids.nationalCode ↔ 02 Col11).
Reports field-level discrepancies as a conflict report CSV.

Note: 02/院校库_全国.xlsx has garbled headers due to encoding issues.
We use column positions from column_maps.SOURCE_02_SCHOOL_MAP instead.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
import openpyxl

from three_layer.conflict_reporter import ConflictReporter, ConflictRecord

DATA_DIR = Path(__file__).resolve().parents[3] / "data"
OUTPUT_DIR = Path(__file__).resolve().parents[1] / "three_layer_output"

# Column positions in 02/院校库_全国.xlsx (0-indexed), from column_maps.SOURCE_02_SCHOOL_MAP
_COL = {
    "postgraduateRate": 0,   # Col00
    "schoolIdentifier": 10,  # Col10
    "nationalCode": 11,      # Col11
    "name": 12,              # Col12
    "type": 18,              # Col18  — stored as "['综合']" list-string
    "nature": 40,            # Col40
    "authority": 17,         # Col17
    "qs": 28,                # Col28
    "usNews": 29,            # Col29
    "arwu": 26,              # Col26
    "alumni": 27,            # Col27
    "masterPrograms": 6,     # Col06 — stored as JSON list of dicts
    "doctoralPrograms": 7,   # Col07 — stored as JSON list of dicts
}

# Fields to compare: (registry_dot_path, 02_field_key)
_COMPARE_FIELDS = [
    ("basic.type",                "type"),
    ("basic.nature",              "nature"),
    ("basic.authority",           "authority"),
    ("rankings.qs",               "qs"),
    ("rankings.usNews",           "usNews"),
    ("rankings.arwu",             "arwu"),
    ("rankings.alumni",           "alumni"),
    ("academics.masterPrograms",  "masterPrograms"),
    ("academics.doctoralPrograms","doctoralPrograms"),
    ("academics.postgraduateRate","postgraduateRate"),
]


@dataclass
class ValidationReport:
    matched: int = 0
    unmatched_in_registry: int = 0
    unmatched_in_02: int = 0
    field_diffs: list = field(default_factory=list)


def _parse_02_type(raw) -> str | None:
    """Extract first element from list-string "['综合']" → '综合'."""
    if raw is None:
        return None
    s = str(raw).strip()
    m = re.search(r"'([^']+)'", s)
    return m.group(1) if m else s


def _parse_02_program_count(raw) -> int | None:
    """Sum 'number' values from JSON-list-string of program dicts."""
    if raw is None:
        return None
    s = str(raw).strip()
    if not s.startswith("["):
        try:
            return int(float(s))
        except (ValueError, TypeError):
            return None
    total = 0
    for m in re.finditer(r"'number':\s*(\d+)", s):
        total += int(m.group(1))
    return total if total > 0 else None


def _parse_02_rate(raw) -> float | None:
    """Parse postgraduate rate: '76' → 76.0."""
    if raw is None:
        return None
    try:
        return round(float(str(raw).strip().rstrip("%")), 2)
    except (ValueError, TypeError):
        return None


def _normalize_02(field_key: str, raw):
    """Normalize a 02-source value for comparison."""
    if field_key == "type":
        return _parse_02_type(raw)
    if field_key in ("masterPrograms", "doctoralPrograms"):
        return _parse_02_program_count(raw)
    if field_key == "postgraduateRate":
        return _parse_02_rate(raw)
    if raw is None:
        return None
    s = str(raw).strip()
    # Numeric fields stored as int/float in 02 — convert to int when 0 means "no rank"
    if field_key in ("qs", "usNews", "arwu", "alumni"):
        try:
            v = int(float(s))
            return v if v > 0 else None
        except (ValueError, TypeError):
            return None
    return s if s else None


def _get_nested(obj: dict, path: str):
    """Get a nested value by dot path: 'rankings.qs' → obj['rankings']['qs']."""
    for part in path.split("."):
        if isinstance(obj, dict):
            obj = obj.get(part)
        else:
            return None
    return obj


def _diff_type(val_reg, val_02) -> str:
    """Classify the difference between two values."""
    str_reg = str(val_reg) if val_reg is not None else ""
    str_02 = str(val_02) if val_02 is not None else ""

    if not str_reg or not str_02:
        return "one_side_missing"

    try:
        diff = abs(float(str_reg) - float(str_02))
        return "numeric_small" if diff <= 3 else "numeric_large"
    except (ValueError, TypeError):
        return "text_minor" if str_reg[:3] == str_02[:3] else "text_major"


def load_02_school_map() -> dict[str, dict]:
    """Load 02/院校库_全国 into a dict keyed by 国标代码 (string).

    When multiple rows share the same nationalCode (e.g., a main campus
    and its affiliated schools), we keep the first row that has qs/arwu
    ranking data, falling back to the first row seen.
    """
    path = DATA_DIR / "02_全国基础库" / "院校库_全国.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active

    schools: dict[str, dict] = {}
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue  # skip header row
        national_code = str(row[_COL["nationalCode"]]).strip() if row[_COL["nationalCode"]] else ""
        if not national_code or national_code == "None":
            continue

        record = {key: row[col] for key, col in _COL.items()}
        record["name_raw"] = row[_COL["name"]]

        if national_code not in schools:
            schools[national_code] = record
        else:
            # Prefer the row that has ranking data (qs > 0)
            existing_qs = schools[national_code].get("qs") or 0
            this_qs = record.get("qs") or 0
            if this_qs > 0 and existing_qs == 0:
                schools[national_code] = record

    wb.close()
    return schools


def cross_validate() -> ValidationReport:
    """Cross-validate school_registry.json vs 02/院校库."""
    reg_path = OUTPUT_DIR / "school_registry.json"
    with open(reg_path, "r", encoding="utf-8") as f:
        registry = json.load(f)

    schools_02 = load_02_school_map()
    reporter = ConflictReporter(output_dir=OUTPUT_DIR)
    report = ValidationReport()

    for code, school in registry["schools"].items():
        national_code = (school.get("ids") or {}).get("nationalCode")
        if not national_code or national_code not in schools_02:
            report.unmatched_in_registry += 1
            continue

        report.matched += 1
        s02 = schools_02[national_code]

        for reg_path_str, field_key in _COMPARE_FIELDS:
            val_reg = _get_nested(school, reg_path_str)
            val_02_raw = s02.get(field_key)
            val_02 = _normalize_02(field_key, val_02_raw)

            # Skip if both are empty/None
            if val_reg is None and val_02 is None:
                continue

            # Normalize registry value for numeric comparison
            str_reg = str(val_reg).strip() if val_reg is not None else ""
            str_02 = str(val_02).strip() if val_02 is not None else ""

            if str_reg == str_02:
                continue
            if not str_reg and not str_02:
                continue

            dtype = _diff_type(val_reg, val_02)
            reporter.add_conflict(ConflictRecord(
                school_code=code,
                school_name=school.get("name", ""),
                subject="—",
                batch="—",
                major_code="—",
                major_name="—",
                field_name=reg_path_str,
                current_value=str_reg,
                new_value=str_02,
                source="02_院校库",
                match_type="exact",
                confidence=1.0,
                diff_type=dtype,
            ))
            report.field_diffs.append((code, reg_path_str))

    report.unmatched_in_02 = len(schools_02) - report.matched

    if reporter.count > 0:
        csv_path = reporter.write("school_registry_conflicts.csv")
        print(f"Conflicts: {reporter.count} → {csv_path}")
        summary = reporter.summary()
        print(f"  By type: {summary['by_diff_type']}")
    else:
        print("No conflicts found.")

    print(
        f"Matched: {report.matched}, "
        f"Unmatched in registry: {report.unmatched_in_registry}, "
        f"Unmatched in 02: {report.unmatched_in_02}"
    )
    return report


if __name__ == "__main__":
    cross_validate()
