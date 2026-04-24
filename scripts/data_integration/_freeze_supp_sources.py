# -*- coding: utf-8 -*-
"""扫描 data/13_征集志愿/普通高考/ 下所有 _已校验.xlsx, 计算 sha256, 输出冻结清单.

用于征集合并前固定源数据基线: 后续任何数据质量问题都可通过 sha256 追溯到当时的源.
"""
from __future__ import annotations

import hashlib
import json
from datetime import datetime
from pathlib import Path

SUPP_ROOT = Path("data/13_征集志愿/普通高考")
OUT = Path("scripts/data_integration/_p5_out/征集源冻结清单.json")


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    files = sorted(SUPP_ROOT.rglob("*_已校验.xlsx"))
    if len(files) != 78:
        print(f"WARN: 预期 78 个文件, 实际 {len(files)} 个")
    manifest = {
        "frozen_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(files),
        "files": [
            {
                "path": str(f).replace("\\", "/"),
                "size": f.stat().st_size,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds"),
                "sha256": sha256(f),
            }
            for f in files
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: 冻结 {len(files)} 个文件 -> {OUT}")


if __name__ == "__main__":
    main()
