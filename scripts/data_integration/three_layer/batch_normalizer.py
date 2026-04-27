# -*- coding: utf-8 -*-
"""Extended batch name normalization across all data sources.

Handles batch name variants from:
- 01_核心录取数据 API (short names: 本科B, 提前, 专科)
- 03 vendor tables (various naming conventions)
- Old gaokao names (本科第一批, 本科第二批)

Uses batch_mapping.BATCH_MAPPING for exact matches first,
then falls back to pattern-based normalization.
"""
from __future__ import annotations
import re
from three_layer.batch_mapping import BATCH_MAPPING, resolve_batch_node_id, BatchMappingError


class BatchNormalizeError(ValueError):
    """Cannot normalize batch name to any known node."""
    pass


# Pattern → node ID (or parent node ID if enrollmentType needed to disambiguate)
# Order matters: more specific patterns first
_PATTERNS: list[tuple[str, str]] = [
    # 01 API short names (exact)
    (r"^本科B$", "bkp_b"),
    (r"^本科A$", "bkp_a"),
    (r"^提前$", "bktqp"),
    (r"^专科提前$", "zktqp"),
    (r"^专科$", "zkp"),
    # 万能版 compound names (batch+type merged) — specific first
    (r"本科提前批B段国家公费师范生", "bktqp_b_gjgfsf"),
    (r"本科提前批B段国家优师", "bktqp_b_gjyszx"),
    (r"本科提前批B段农村订单", "bktqp_b_ncddyx"),
    (r"本科提前批B段省级公费师范", "bktqp_b_sjgfsf"),
    (r"本科提前批B段地方优师", "bktqp_b_dfyszx"),
    (r"本科提前批B段乡村振兴", "bktqp_b_xczx"),
    (r"本科批B段普通类", "bkp_b_pt"),
    # Old gaokao names → new equivalents
    (r"本科第一批", "bkp_b"),
    (r"本科第二批", "bkp_b"),
    (r"本科一批", "bkp_b"),
    (r"本科二批", "bkp_b"),
    (r"高职\(专科\)提前批$", "zktqp"),
    (r"高职\(专科\)批$", "zkp"),
    (r"专科批$", "zkp"),
    # Partial segment matches — specific before general
    (r"本科提前.*国家专项", "bktqp_gjzx"),
    (r"本科提前.*高校专项", "bktqp_gxzx"),
    (r"本科提前.*A段", "bktqp_a"),
    (r"本科提前.*B段", "bktqp_b"),
    (r"本科批.*高校专项", "bkp_gxzx"),
    (r"本科批.*A段", "bkp_a"),
    (r"本科批.*B段", "bkp_b"),
    (r"本科批.*区域", "bkp_qyjh"),
    (r"本科批.*少数民族预科", "bkp_sxyk"),
    (r"少数民族语言", "bkp_smzyy"),
    (r"加授.*民族语文", "bkp_jsmzyw"),
]

_COMPILED = [(re.compile(p), nid) for p, nid in _PATTERNS]


def normalize_batch(raw_batch: str, enrollment_type: str | None = None) -> str:
    """Normalize a raw batch name to a batch tree node ID.

    First tries exact match via BATCH_MAPPING (if enrollment_type provided).
    Then falls back to pattern matching.

    Returns the most specific node ID possible. May return a parent node
    (e.g. "bkp_b") when enrollment_type is needed to reach the leaf.
    """
    if not raw_batch:
        raise BatchNormalizeError("Empty batch name")

    raw = raw_batch.strip()

    # Try exact match first (requires both raw batch name and enrollment_type)
    if enrollment_type:
        try:
            return resolve_batch_node_id(raw, enrollment_type.strip())
        except BatchMappingError:
            pass

    # Pattern fallback
    for pattern, node_id in _COMPILED:
        if pattern.search(raw):
            return node_id

    raise BatchNormalizeError(f"Cannot normalize: batch={raw!r}, type={enrollment_type!r}")
