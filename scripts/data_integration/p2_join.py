# -*- coding: utf-8 -*-
"""P2 Task 7: Outer-join 03 (2025 slice) × 01 (2025) via CodeMapper bridge.

Why an outer join: we need to surface three populations:
  both       — rows in both 03 and 01, ready for cross-source diff
  left_only  — rows in 03 only (possibly missing from 01 intake)
  right_only — rows in 01 only (possibly new entries not yet in 03)

Bridge (04-direction): 03 stores 四川招生码 (enroll_code), 01 stores 国标代码
(national_code). CodeMapper.enroll_to_national converts the key so both sides
join on 院校代码_国标.

Primary key: [数据年份, 院校代码_国标, 专业代码, 批次, 科目]

Note on 批次 normalization: 03 already uses canonical 2025 names ("本科批B段" etc.),
while 01 uses short aliases ("本科B" etc.). We normalize 01's batch via
batch_dict.normalize_batch_name(name, year=2025, course=course) so both sides
carry canonical names before the merge.

ISSUE-013 context: 03 主表 is wide-format (year-prefixed columns) — load_master_2025
handles the extraction and column-rename so this module receives long format.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional

import pandas as pd

from scripts.data_integration.lib.batch_dict import normalize_batch_name
from scripts.data_integration.lib.code_mapper import CodeMapper
from scripts.data_integration.lib.source_01 import load_01_major_scores
from scripts.data_integration.lib.source_03 import load_master_2025

logger = logging.getLogger(__name__)

# Default data paths (relative to repo root, resolved at runtime)
_REPO_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_03_PATH = _REPO_ROOT / "data" / "03_专家版主表" / "output" / "专业招生主表.xlsx"
_DEFAULT_01_PATH = _REPO_ROOT / "data" / "01_核心录取数据" / "专业分数线_四川_2025.json"
_DEFAULT_MAPPING_CSV = _REPO_ROOT / "data" / "08_数据治理记录" / "编码映射表_招生代码_国标代码.csv"

# Join key columns (must be present on both sides before merge)
_JOIN_KEYS = ["数据年份", "院校代码_国标", "专业代码", "批次", "科目"]


def _bridge_enroll_to_national(df: pd.DataFrame, mapper: CodeMapper) -> pd.DataFrame:
    """Add '院校代码_国标' column to df_03 by mapping '院校代码' (四川招生码).

    Rows where bridge returns None keep NaN for 院校代码_国标 — they will
    naturally appear as left_only in the outer join since 01 side won't match NaN.
    We log the count as an observation rather than silently dropping.
    """
    df = df.copy()
    df["院校代码_国标"] = df["院校代码"].map(mapper.enroll_to_national)
    unmapped = df["院校代码_国标"].isna().sum()
    if unmapped:
        logger.info(
            "p2_join: %d 03 rows have unmappable 院校代码 (no national code bridge); "
            "they will appear as left_only in the merge",
            unmapped,
        )
    return df


def _normalize_01_batch(df: pd.DataFrame, strict: bool) -> pd.DataFrame:
    """Normalize 01's 批次 column to canonical 2025 form in-place.

    Rows where normalization fails (unknown batch) are kept with original value
    and logged as warnings — they'll be key-mismatched in the outer join and
    appear as right_only rather than silently disappearing.
    """
    df = df.copy()
    normalized = []
    for _, row in df.iterrows():
        batch = row.get("批次", "")
        course = row.get("科目", "")
        try:
            normalized.append(normalize_batch_name(batch, year=2025, course=course, strict=strict))
        except Exception as exc:
            logger.warning(
                "p2_join: 01 batch normalization failed for batch=%r course=%r: %s",
                batch, course, exc,
            )
            normalized.append(batch)  # keep original on failure → key mismatch → right_only
    df["批次"] = normalized
    return df


def join_03_and_01_2025(
    path_03: Optional[Path] = None,
    path_01: Optional[Path] = None,
    mapper: Optional[CodeMapper] = None,
    strict_batch: bool = False,
) -> pd.DataFrame:
    """Outer-join 03 (2025 slice, long) with 01 2025 (long) by primary key.

    Bridge: 03 '院校代码' (int 四川招生) → CodeMapper → '院校代码_国标' (str) ↔ 01 '院校代码_国标'
    Primary key: [数据年份, 院校代码_国标, 专业代码, 批次, 科目]

    Args:
        path_03: Path to 03 主表 xlsx. Defaults to the repo output file.
        path_01: Path to 01 专业分数线 json for 2025. Defaults to the repo data file.
        mapper: Optional CodeMapper instance (for tests / alternative mappings).
                Defaults to loading from 编码映射表_招生代码_国标代码.csv.
        strict_batch: If True, reject ambiguous batch aliases. Default False.

    Returns:
        Merged DataFrame with '_merge' indicator column
        (categorical: 'both', 'left_only', 'right_only').

        Column conflicts: 03 columns keep bare names (SSoT per ADR-001),
        01-only columns get suffix '_01' where they duplicate 03 names.
    """
    path_03 = Path(path_03) if path_03 else _DEFAULT_03_PATH
    path_01 = Path(path_01) if path_01 else _DEFAULT_01_PATH

    # --- Load and prepare 03 (left side) ---
    df_03 = load_master_2025(path_03)
    if mapper is None:
        mapper = CodeMapper.from_csv(_DEFAULT_MAPPING_CSV)
    df_03 = _bridge_enroll_to_national(df_03, mapper)

    # --- Load and prepare 01 (right side) ---
    df_01 = load_01_major_scores(path_01, year=2025)

    # Normalize 01 批次 to 2025 canonical form so it matches 03 side
    # 01 科目 is already 物理/历史 in 2025, matches 03 — no translation needed
    df_01 = _normalize_01_batch(df_01, strict=strict_batch)

    # Ensure 数据年份 exists on both sides
    df_03["数据年份"] = 2025
    df_01["数据年份"] = 2025

    # Ensure 专业代码 is str on both sides for key alignment
    df_03["专业代码"] = df_03["专业代码"].astype(str).str.strip()
    df_01["专业代码"] = df_01["专业代码"].astype(str).str.strip()

    # 院校代码_国标 must be str on both sides.
    # 注意: 直接 astype(str) 会把 None/NaN 转成字符串 "None"/"nan"，
    # 导致无法桥接的 03 行被误判为"有桥接但无 01 匹配"。
    # 用 where(notna) 保留 NaN，再对非 NaN 值做字符串化。
    df_01["院校代码_国标"] = df_01["院校代码_国标"].astype(str).str.strip()
    df_03["院校代码_国标"] = df_03["院校代码_国标"].where(
        df_03["院校代码_国标"].isna(),
        df_03["院校代码_国标"].astype(str),
    )

    logger.info(
        "p2_join: merging 03 (%d rows, after bridge) × 01 (%d rows) on keys %s",
        len(df_03), len(df_01), _JOIN_KEYS,
    )

    # --- Outer merge ---
    merged = pd.merge(
        df_03,
        df_01,
        on=_JOIN_KEYS,
        how="outer",
        indicator=True,
        suffixes=("", "_01"),
    )

    dist = merged["_merge"].value_counts().to_dict()
    logger.info("p2_join: merge distribution: %s", dist)

    return merged
