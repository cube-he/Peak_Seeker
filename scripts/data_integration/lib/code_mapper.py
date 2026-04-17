# -*- coding: utf-8 -*-
"""College code mapper: 四川招生代码 <-> 国标代码 bi-directional lookup.

Primary source: data/08_数据治理记录/编码映射表_招生代码_国标代码.csv
Patches can be added at runtime via add_patch() for the 0.63% unmapped tail.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _normalize_enroll(code: str | int) -> str:
    """四川招生代码统一为 4 位字符串（保留前导零）。"""
    s = str(code).strip()
    if not s:
        return ""
    if s.isdigit():
        return s.zfill(4)
    return s


@dataclass
class CodeMapper:
    enroll_to_nat: dict[str, str] = field(default_factory=dict)
    nat_to_enroll: dict[str, str] = field(default_factory=dict)
    enroll_to_name: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_csv(cls, path: Path) -> "CodeMapper":
        cm = cls()
        # utf-8-sig strips BOM from real 治理记录 CSV
        with open(path, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                enroll = _normalize_enroll(
                    row.get("招生代码") or row.get("enroll_code") or ""
                )
                national = (
                    row.get("国标代码") or row.get("national_code") or ""
                ).strip()
                # Real file: 院校 ; Fixture / alt: 院校名称 / name
                name = (
                    row.get("院校名称")
                    or row.get("院校")
                    or row.get("name")
                    or ""
                ).strip()
                if not enroll or not national:
                    continue
                cm.enroll_to_nat[enroll] = national
                cm.nat_to_enroll[national] = enroll
                if name:
                    cm.enroll_to_name[enroll] = name
        return cm

    def size(self) -> int:
        return len(self.enroll_to_nat)

    def enroll_to_national(self, code: str | int) -> Optional[str]:
        return self.enroll_to_nat.get(_normalize_enroll(code))

    def national_to_enroll(self, code: str) -> Optional[str]:
        return self.nat_to_enroll.get(str(code).strip())

    def name_by_enroll(self, code: str | int) -> Optional[str]:
        return self.enroll_to_name.get(_normalize_enroll(code))

    def add_patch(self, *, enroll: str, national: str, name: Optional[str] = None) -> None:
        enroll_n = _normalize_enroll(enroll)
        self.enroll_to_nat[enroll_n] = national
        self.nat_to_enroll[national] = enroll_n
        if name:
            self.enroll_to_name[enroll_n] = name
