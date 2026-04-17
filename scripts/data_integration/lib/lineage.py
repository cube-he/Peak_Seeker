# -*- coding: utf-8 -*-
"""Lineage tracking: which source each (row, column) value came from.

Stored as a sidecar JSON to avoid bloating the main dataframe.
Keys are stringified tuples for JSON compatibility.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Tuple

VALID_SOURCES = {"03", "01", "13", "manual", "patched"}

RowKey = Tuple[str, str, str, str, str, str]  # (年份, 院校代码, 专业组, 专业代码, 批次, 科目)


def _key_to_str(k: RowKey) -> str:
    return "\x1f".join(k)


def _str_to_key(s: str) -> RowKey:
    parts = s.split("\x1f")
    return tuple(parts)  # type: ignore[return-value]


class Lineage:
    def __init__(self) -> None:
        self._data: dict[str, dict[str, str]] = {}

    def mark(self, key: RowKey, column: str, source: str) -> None:
        if source not in VALID_SOURCES:
            raise ValueError(f"非法 source: {source}，必须在 {VALID_SOURCES}")
        k = _key_to_str(key)
        self._data.setdefault(k, {})[column] = source

    def get(self, key: RowKey, column: str) -> str | None:
        k = _key_to_str(key)
        return self._data.get(k, {}).get(column)

    def save(self, path: Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "Lineage":
        ln = cls()
        if Path(path).exists():
            ln._data = json.loads(Path(path).read_text(encoding="utf-8"))
        return ln
