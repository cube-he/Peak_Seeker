# -*- coding: utf-8 -*-
"""
P3.2 — 对 rename 后的 2023/2024 征集志愿 xlsx 做结构 pilot。
仅做粗粒度结构检查（行数、列名、空行比），不做字段级修复。
"""
from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path

import openpyxl


DATA_ROOT = Path("data/13_征集志愿/普通高考")


def scan_xlsx(xlsx_path: Path) -> dict:
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"n_rows": 0, "cols": [], "empty_ratio": 0.0, "status": "fail"}
    header = rows[0]
    data = rows[1:]
    n = len(data)
    if n == 0:
        return {"n_rows": 0, "cols": [str(c) for c in header], "empty_ratio": 0.0, "status": "fail"}
    empty = sum(1 for r in data if all(v in (None, "") for v in r))
    empty_ratio = empty / n
    status = "ok" if empty_ratio < 0.3 else "warn"
    return {
        "n_rows": n,
        "cols": [str(c) for c in header],
        "empty_ratio": empty_ratio,
        "status": status,
    }


def run_pilot(year_filter=("2023", "2024")) -> list[dict]:
    results = []
    for xlsx in sorted(DATA_ROOT.rglob("*.xlsx")):
        name = xlsx.stem
        if not any(y in name for y in year_filter):
            continue
        try:
            info = scan_xlsx(xlsx)
        except Exception as e:  # corrupted workbook
            info = {"n_rows": 0, "cols": [], "empty_ratio": 0.0, "status": f"error:{e}"}
        info["file"] = str(xlsx.relative_to(DATA_ROOT))
        results.append(info)
    return results


def write_md(results: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    n_total = len(results)
    n_ok = sum(1 for r in results if r["status"] == "ok")
    n_warn = sum(1 for r in results if r["status"] == "warn")
    n_fail = sum(1 for r in results if r["status"] not in ("ok", "warn"))

    # Distinct column signature counts
    sigs: dict[tuple, int] = {}
    for r in results:
        sig = tuple(r["cols"])
        sigs[sig] = sigs.get(sig, 0) + 1

    lines = [
        "# P3.2 Pilot Scan · 2023/2024 征集志愿",
        "",
        f"Generated: {datetime.utcnow().isoformat()}",
        f"Files scanned: {n_total} (ok={n_ok}, warn={n_warn}, fail={n_fail})",
        f"Distinct column signatures: {len(sigs)}",
        "",
        "## Per-file summary",
        "",
        "| # | file | n_rows | empty_ratio | status | cols (first 5) |",
        "|---|---|---:|---:|---|---|",
    ]
    for i, r in enumerate(results, 1):
        cols_preview = ", ".join(r["cols"][:5])
        lines.append(
            f"| {i} | `{r['file']}` | {r['n_rows']} | {r['empty_ratio']:.2%} | "
            f"{r['status']} | {cols_preview} |"
        )

    lines.extend(["", "## Column signature distribution", ""])
    for sig, cnt in sorted(sigs.items(), key=lambda x: -x[1]):
        lines.append(f"- ({cnt} files) columns: `{list(sig)}`")

    path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="P3.2 pilot scan")
    parser.add_argument("--out", default="data/_pipeline/P3/pilot_2023_2024.md")
    args = parser.parse_args()

    results = run_pilot()
    write_md(results, Path(args.out))
    print(f"Scanned {len(results)} files → {args.out}")


if __name__ == "__main__":
    main()
