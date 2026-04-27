# -*- coding: utf-8 -*-
"""Structural validation for the three-layer data model.

Checks:
  1. batch_tree_2025.json — schema, leaf count (37), unique IDs
  2. BATCH_MAPPING vs tree — every mapped batchNodeId exists in the tree
  3. (--data) BATCH_MAPPING vs xlsx — every (录取批次, 招生类型) in the sheet is covered

Usage:
  python -m three_layer.validate_structure
  python -m three_layer.validate_structure --data
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import jsonschema

from three_layer.batch_mapping import BATCH_MAPPING
from three_layer.batch_tree import OUTPUT_DIR
from three_layer.schemas import BATCH_TREE_SCHEMA

# Project root is two levels above scripts/data_integration/
_PROJECT_ROOT = Path(__file__).resolve().parents[3]
_XLSX_PATH = _PROJECT_ROOT / "data" / "03_专家版主表" / "output" / "专业招生主表.xlsx"
_TREE_PATH = OUTPUT_DIR / "batch_tree_2025.json"

EXPECTED_LEAF_COUNT = 37


# ---------------------------------------------------------------------------
# Tree traversal helpers (operate on a list of nodes)
# ---------------------------------------------------------------------------

def _collect_leaves(nodes: list[dict]) -> list[dict]:
    """Return all leaf nodes (nodes without children) recursively."""
    leaves: list[dict] = []
    for node in nodes:
        if "children" in node:
            leaves.extend(_collect_leaves(node["children"]))
        else:
            leaves.append(node)
    return leaves


def _collect_all_ids(nodes: list[dict]) -> list[str]:
    """Return IDs of every node (internal and leaf) recursively."""
    ids: list[str] = []
    for node in nodes:
        ids.append(node["id"])
        if "children" in node:
            ids.extend(_collect_all_ids(node["children"]))
    return ids


# ---------------------------------------------------------------------------
# Check 1: batch_tree_2025.json integrity
# ---------------------------------------------------------------------------

def check_tree() -> list[str]:
    """Validate batch_tree_2025.json structure and leaf count.

    Returns a list of error strings (empty means PASS).
    """
    errors: list[str] = []

    if not _TREE_PATH.exists():
        return [f"FILE_MISSING: {_TREE_PATH}"]

    with open(_TREE_PATH, encoding="utf-8") as f:
        data = json.load(f)

    # Schema validation
    try:
        jsonschema.validate(data, BATCH_TREE_SCHEMA)
    except jsonschema.ValidationError as exc:
        errors.append(f"SCHEMA: {exc.message}")
        return errors  # further checks would be unreliable

    nodes = data.get("tree", [])
    leaves = _collect_leaves(nodes)
    all_ids = _collect_all_ids(nodes)

    # Leaf count
    if len(leaves) != EXPECTED_LEAF_COUNT:
        errors.append(
            f"LEAF_COUNT: expected {EXPECTED_LEAF_COUNT}, got {len(leaves)}"
        )

    # Unique IDs
    seen: set[str] = set()
    for node_id in all_ids:
        if node_id in seen:
            errors.append(f"DUPLICATE_ID: {node_id}")
        seen.add(node_id)

    return errors


# ---------------------------------------------------------------------------
# Check 2: BATCH_MAPPING values exist in tree
# ---------------------------------------------------------------------------

def check_mapping_vs_tree() -> list[str]:
    """Ensure every batchNodeId in BATCH_MAPPING resolves to a tree node."""
    errors: list[str] = []

    if not _TREE_PATH.exists():
        return [f"FILE_MISSING: {_TREE_PATH}"]

    with open(_TREE_PATH, encoding="utf-8") as f:
        data = json.load(f)

    tree_ids: set[str] = set(_collect_all_ids(data.get("tree", [])))

    for key, node_id in BATCH_MAPPING.items():
        if node_id not in tree_ids:
            errors.append(f"ORPHAN: {key} → {node_id} not in tree")

    return errors


# ---------------------------------------------------------------------------
# Check 3: xlsx (录取批次, 招生类型) pairs covered by BATCH_MAPPING
# ---------------------------------------------------------------------------

def check_mapping_vs_data() -> list[str]:
    """Ensure every (录取批次, 招生类型) pair in the xlsx is in BATCH_MAPPING."""
    errors: list[str] = []

    try:
        import openpyxl
    except ImportError:
        return ["IMPORT_ERROR: openpyxl not installed"]

    if not _XLSX_PATH.exists():
        return [f"FILE_MISSING: {_XLSX_PATH}"]

    wb = openpyxl.load_workbook(_XLSX_PATH, read_only=True)
    ws = wb.active

    # Skip header row; col index 5 = 录取批次 (0-based), col index 9 = 招生类型
    BATCH_COL = 5
    ETYPE_COL = 9

    seen_pairs: set[tuple[str, str]] = set()
    for row in ws.iter_rows(min_row=2, values_only=True):
        batch = row[BATCH_COL]
        etype = row[ETYPE_COL]
        if batch is None or etype is None:
            continue
        seen_pairs.add((str(batch), str(etype)))

    wb.close()

    for pair in sorted(seen_pairs):
        if pair not in BATCH_MAPPING:
            errors.append(f"UNMAPPED: {pair}")

    return errors


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Validate three-layer data model structure."
    )
    parser.add_argument(
        "--data",
        action="store_true",
        help="Also verify BATCH_MAPPING covers all pairs in 专业招生主表.xlsx",
    )
    args = parser.parse_args()

    all_errors: list[str] = []

    # Check 1
    print("Checking batch_tree_2025.json...")
    errs = check_tree()
    if errs:
        print(f"  FAIL ({len(errs)} error{'s' if len(errs) != 1 else ''})")
        all_errors.extend(errs)
    else:
        print("  PASS")

    # Check 2
    print("Checking BATCH_MAPPING vs tree...")
    errs = check_mapping_vs_tree()
    if errs:
        print(f"  FAIL ({len(errs)} error{'s' if len(errs) != 1 else ''})")
        all_errors.extend(errs)
    else:
        print("  PASS")

    # Check 3 (optional)
    if args.data:
        print("Checking BATCH_MAPPING vs 专业招生主表...")
        errs = check_mapping_vs_data()
        if errs:
            print(f"  FAIL ({len(errs)} error{'s' if len(errs) != 1 else ''})")
            all_errors.extend(errs)
        else:
            print("  PASS")

    if all_errors:
        print(f"\n{len(all_errors)} error(s):")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("\nAll checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()
