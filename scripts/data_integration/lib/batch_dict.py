# -*- coding: utf-8 -*-
"""Batch dictionary loader and name normalizer.

Loads authoritative batch dictionaries (from docs/superpowers/specs/)
and provides canonical-name lookup for cross-source integration.

Two layers of data:
1. load_batch_dict() — parses the markdown table for raw structured metadata
   (投档顺序, 录取批次, 招生项目, 志愿设置 etc.)
2. normalize_batch_name() — maps any alias / short-form to the canonical
   project-internal batch name (defined in CANONICAL_NAMES below).

Why a separate canonical set rather than relying on table values?
The PDF tables use verbose names like "普通类 本科批次", but the project
needs concise, stable identifiers like "本科批B" / "本科批B段" that
survive year-over-year renaming. The canonical set is the source of truth
for cross-year alignment; table values are source provenance metadata.
"""
from __future__ import annotations

import re
from pathlib import Path

SPECS_DIR = Path(__file__).resolve().parents[3] / "docs" / "superpowers" / "specs"

DICT_FILES = {
    ("2024", "理科"): SPECS_DIR / "2026-04-17-batch-dict-2024-science.md",
    ("2025", "物理"): SPECS_DIR / "2026-04-17-batch-dict-2025-physics.md",
}

# --- Canonical name registry --------------------------------------------------
# These are the project-internal stable identifiers.  Any data source name
# should ultimately map to one of these.  Organised per (year, course).
_CANONICAL_NAMES: dict[tuple[str, str], set[str]] = {
    ("2025", "物理"): {
        # 本科提前批次
        "本科提前批次强基计划",
        "本科提前批次国家专项",
        "本科提前批次A段",
        "本科提前批次高校专项",
        "本科提前批次B段",
        # 本科批次
        "本科批A段_国家专项",
        "本科批A段_地方专项",
        "本科批A段_高校专项",
        "本科批A段_高水平运动队",
        "本科批B",          # short canonical for B段主体 (used internally)
        "本科批B段",        # full canonical name
        "本科批区域均衡",
        "本科批省属预科",
        # 特殊批次
        "艺术类本科提前批次",
        "体育类本科提前批次",
        "艺术体育类本科批次",
        "对口本科批",
        "原民族语言授课本科批次",
        "原加授少数民族语文本科批次",
        # 专科
        "专科提前批次",
        "专科批次",
        "艺术体育类专科批次",
        "对口专科批",
        "原加授少数民族语文专科批次",
        "涉藏州县1+2批次",
    },
    ("2024", "理科"): {
        "本科提前批",
        "本科一批",
        "本科一批预科",
        "本科二批",
        "本科二批预科",
        "二类模式本科批",
        "一类模式本科一批",
        "一类模式本科二批",
        "一类模式专科批",
        "专科提前批",
        "专科批",
    },
}

# --- Alias mappings -----------------------------------------------------------
# Maps raw source names (from data files or older naming conventions)
# to canonical project-internal names.
# Key: (year, course) → {alias: canonical_name}
_ALIASES: dict[tuple[str, str], dict[str, str]] = {
    ("2025", "物理"): {
        # 来源 01 口径（旧系统短名）→ 03 口径
        "本科B": "本科批B段",
        "本科A": "本科批A段_国家专项",  # 通常指国家专项，最常见的 A 段
        "本科A(国家专项)": "本科批A段_国家专项",
        "本科A(地方专项)": "本科批A段_地方专项",
        "本科(高校专项)": "本科批A段_高校专项",
        "本科(高水平运动队)": "本科批A段_高水平运动队",
        "本科(区域均衡专项)": "本科批区域均衡",
        # 常见模糊写法
        "本科批次B段": "本科批B段",
        "本科批次A段": "本科批A段_国家专项",
        "本科提前批次A段": "本科提前批次A段",
        "本科提前批次B段": "本科提前批次B段",
        # 旧文件夹命名口径
        "本科批": "本科批B段",          # 无段别时默认为 B 段（主体最大）
        "本科批次": "本科批B段",
        "普通类 本科批次": "本科批B段",
    },
    ("2024", "理科"): {
        "本一": "本科一批",
        "本二": "本科二批",
        "专科": "专科批",
        "本科一批主体": "本科一批",
        "本科二批主体": "本科二批",
    },
}


def load_batch_dict(year: str, course: str) -> list[dict]:
    """Load batch dictionary for a given year+course from the spec markdown.

    Returns a list of dicts, each representing one table row.
    All rows are guaranteed to have at least:
      - batch_name: str  (from 录取批次 column, or first column)
      - category: str    (from 招生项目 / 类别 column, or 一级分类)
    """
    key = (year, course)
    if key not in DICT_FILES:
        raise ValueError(f"无字典: year={year} course={course}")
    path = DICT_FILES[key]
    if not path.exists():
        raise FileNotFoundError(path)
    return _parse_markdown_table(path.read_text(encoding="utf-8"))


def _parse_markdown_table(md: str) -> list[dict]:
    """Parse the first markdown table found in the md text.

    Handles separator rows (|---|---|) and maps known Chinese column names
    to standardised keys (batch_name, category).
    """
    lines = [line.rstrip() for line in md.splitlines() if line.lstrip().startswith("|")]
    if len(lines) < 2:
        return []

    # Take the first table only (stop at first blank-line gap, but since we
    # already filtered to "|"-starting lines, just use them contiguously).
    headers = [h.strip() for h in lines[0].strip("|").split("|")]
    # Skip separator row(s)
    data_lines = [
        line for line in lines[1:]
        if not re.match(r"^\|[-:\s|]+\|$", line.strip())
    ]

    # Column name mappings for batch_name and category
    _BATCH_NAME_COLS = {"录取批次", "批次/子类型", "批次", "名称"}
    _CATEGORY_COLS = {"招生项目", "一级分类", "类别", "分类"}

    out: list[dict] = []
    for line in data_lines:
        cells = [c.strip() for c in line.strip("|").split("|")]
        if len(cells) != len(headers):
            continue
        row = dict(zip(headers, cells))

        # Normalise to standard keys
        if "batch_name" not in row:
            for col in _BATCH_NAME_COLS:
                if col in row and row[col]:
                    row["batch_name"] = row[col]
                    break
            else:
                row["batch_name"] = cells[0]  # fallback: first column

        if "category" not in row:
            for col in _CATEGORY_COLS:
                if col in row and row[col]:
                    row["category"] = row[col]
                    break
            else:
                row["category"] = "普通类"  # fallback

        out.append(row)
    return out


def normalize_batch_name(name: str, year: int | str, course: str) -> str:
    """Normalize a batch name from any source to the canonical project form.

    Lookup order:
      1. Direct match in CANONICAL_NAMES → return as-is.
      2. Alias mapping → return canonical target.
      3. Not found → raise ValueError (no silent swallowing of bad data).

    Args:
        name: Raw batch name from a data source.
        year: Four-digit year as int or str.
        course: Course category string, e.g. "物理" or "理科".

    Returns:
        Canonical batch name string.

    Raises:
        ValueError: If name cannot be resolved.
    """
    key = (str(year), course)
    canonical_set = _CANONICAL_NAMES.get(key, set())
    aliases = _ALIASES.get(key, {})

    if name in canonical_set:
        return name
    if name in aliases:
        return aliases[name]
    raise ValueError(f"未知批次: {name!r} (year={year}, course={course})")
