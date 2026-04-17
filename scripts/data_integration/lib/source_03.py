# -*- coding: utf-8 -*-
"""03 专家版主表 读取器 — 2025 年切片提取。

Why a dedicated module: 03 主表是宽格式，每行包含 2022-2025 四年历史（用年份前缀列），
与 01 口径（逐行一年）不同，需要先提取 2025 切片并统一列名，才能 outer join。

历史年份 (2022-2024) 的合并在 Task 7b 中实现，需要额外处理批次/科目翻译。
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

logger = logging.getLogger(__name__)

# --- Year-prefixed column rename: 25xxx → canonical name ---
# 只重命名能与 01 口径直接对齐的核心字段；
# 25专业组* 等专有字段保留原名（无对应 01 字段）。
_RENAME_25 = {
    "25最低分": "最低分",
    "25最低位次": "最低位次",
    "25平均分": "平均分",
    "25平均位次": "平均位次",
    "25最高分": "最高分",
    "25最高位次": "最高位次",
    "25录取人数": "录取人数",
}

# 历史年份前缀，用于识别并丢弃历史列
_HIST_PREFIXES = ("24", "23", "22")


def load_master_2025(path: Path) -> pd.DataFrame:
    """Load 03 主表 and extract only the 2025 year slice.

    Returns a long-format DataFrame with canonical column names (no year prefix):
      数据年份=2025, 院校代码 (str 四川招生码), 专业组代码, 专业代码, 批次, 科目,
      最低分 (from 25最低分), 最低位次 (from 25最低位次),
      录取人数 (from 25录取人数), 平均分 (from 25平均分), 平均位次 (from 25平均位次),
      最高分 (from 25最高分), 最高位次 (from 25最高位次),
      plus 2025-specific columns retained as-is: 25投档最低分, 25投档最低位次,
        25专业组录取人数, 25专业组最低分, 25专业组最低位次, 25专业组计划.
      plus passthrough cols: 院校名称, 专业, 专业类别 (if present), 计划人数.

    Filters out rows where 25最低分 is null/NaN (no 2025 enrollment data for that row).
    Drops all historical year-prefixed columns (24*, 23*, 22*) from the output.
    """
    path = Path(path)
    df = pd.read_excel(path, engine="openpyxl")

    # --- Filter: keep only rows that have 2025 enrollment data ---
    if "25最低分" in df.columns:
        before = len(df)
        df = df[df["25最低分"].notna()].copy()
        dropped = before - len(df)
        if dropped:
            logger.info(
                "source_03: filtered %d rows with null 25最低分 from %s", dropped, path.name
            )
    else:
        logger.warning("source_03: column '25最低分' not found in %s", path.name)

    # --- Rename 25-prefixed columns to canonical names ---
    actual_rename = {k: v for k, v in _RENAME_25.items() if k in df.columns}
    df = df.rename(columns=actual_rename)

    # --- Drop historical year columns (24*, 23*, 22*) ---
    hist_cols = [
        c for c in df.columns
        if isinstance(c, str) and c[:2] in _HIST_PREFIXES
    ]
    df = df.drop(columns=hist_cols)

    # --- Set 数据年份 = 2025 (overwrite if present, set if absent) ---
    df["数据年份"] = 2025

    # --- Normalize 院校代码 to 4-char string preserving leading zeros ---
    if "院校代码" in df.columns:
        df["院校代码"] = df["院校代码"].astype(str).str.strip().str.zfill(4)

    # --- Normalize key identifier types ---
    if "专业代码" in df.columns:
        df["专业代码"] = df["专业代码"].astype(str).str.strip()
    if "专业组代码" in df.columns:
        df["专业组代码"] = df["专业组代码"].astype(str).str.strip()

    return df.reset_index(drop=True)
