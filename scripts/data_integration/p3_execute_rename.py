# -*- coding: utf-8 -*-
"""
P3.1 — 执行 13 征集志愿目录/文件的 rename plan（幂等）。

输入:
  docs/superpowers/specs/2026-04-17-rename-plan.csv (类型=文件夹|xlsx)

策略:
  CSV 中 xlsx 的 old 路径指向"旧文件夹/旧 xlsx"，new 路径指向"新文件夹/新 xlsx"。
  如果先改文件夹再改 xlsx, old xlsx 路径已失效; 反之先改 xlsx 去 new 路径其父目录
  还没创建。因此采用两轮策略:

  轮 1 (xlsx stage-1): 在"旧父目录"里把 xlsx 改成 new 路径的 basename
  轮 2 (folder):        把旧文件夹整体 rename 到新文件夹

  幂等:
    - new 已存在、old 不存在 → already_done
    - 两者都在 → error:conflict_both_exist
    - 两者都不在 → error:missing
    - 只 old 在 → 正常 rename
"""
from __future__ import annotations

import argparse
import csv
import os
from datetime import datetime
from pathlib import Path


def execute_rename_plan(plan_rows):
    """Execute rename plan and return (log_rows, failure_rows).

    log_rows: list[dict(ts, type, old, new, status)]
    failure_rows: list[dict(type, old, new, reason)]
    """
    log: list[dict] = []
    failures: list[dict] = []

    folders = [r for r in plan_rows if r["type"] == "文件夹"]
    # xlsx and 补充数据 (supplementary) both sit inside a folder → same strategy.
    xlsxs = [r for r in plan_rows if r["type"] in ("xlsx", "补充数据")]

    # Round 1: rename xlsx in place (keep OLD parent folder, use NEW basename).
    for r in xlsxs:
        old = Path(r["old_abs"])
        new_final = Path(r["new_abs"])
        stage1_new = old.parent / new_final.name
        status = _rename_one(old, stage1_new)
        log.append(
            {
                "ts": _ts(),
                "type": "xlsx_stage1",
                "old": str(old),
                "new": str(stage1_new),
                "status": status,
            }
        )
        if status.startswith("error"):
            failures.append(
                {
                    "type": "xlsx",
                    "old": str(old),
                    "new": str(stage1_new),
                    "reason": status,
                }
            )

    # Round 2: rename folders.
    for r in folders:
        old = Path(r["old_abs"])
        new = Path(r["new_abs"])
        status = _rename_one(old, new)
        log.append(
            {
                "ts": _ts(),
                "type": "folder",
                "old": str(old),
                "new": str(new),
                "status": status,
            }
        )
        if status.startswith("error"):
            failures.append(
                {
                    "type": "文件夹",
                    "old": str(old),
                    "new": str(new),
                    "reason": status,
                }
            )

    return log, failures


def _rename_one(old: Path, new: Path) -> str:
    old_exists = old.exists()
    new_exists = new.exists()

    if new_exists and not old_exists:
        return "already_done"
    if new_exists and old_exists:
        return "error:conflict_both_exist"
    if not old_exists and not new_exists:
        return "error:missing"

    try:
        new.parent.mkdir(parents=True, exist_ok=True)
        os.rename(old, new)
        return "ok"
    except OSError as e:
        return f"error:{e}"


def _ts() -> str:
    return datetime.utcnow().isoformat()


def _read_plan(csv_path: Path) -> list[dict]:
    with csv_path.open("r", encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def _dry_run_preview(plan_rows):
    print(f"Dry-run: {len(plan_rows)} entries")
    counts = {"文件夹": 0, "xlsx": 0}
    for r in plan_rows:
        counts[r["type"]] = counts.get(r["type"], 0) + 1
    print(f"  by type: {counts}")
    for i, r in enumerate(plan_rows[:5]):
        print(f"  [{i}] {r['type']}: {r['old_abs']} -> {r['new_abs']}")
    if len(plan_rows) > 5:
        print(f"  ... (+{len(plan_rows) - 5} more)")


def _write_log_md(log: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# P3.1 Rename Execution Log",
        "",
        f"Generated: {datetime.utcnow().isoformat()}",
        f"Total entries: {len(log)}",
        "",
        "| # | ts | type | status | old → new |",
        "|---|---|---|---|---|",
    ]
    for i, row in enumerate(log, 1):
        lines.append(
            f"| {i} | {row['ts']} | {row['type']} | {row['status']} | "
            f"`{row['old']}` → `{row['new']}` |"
        )
    path.write_text("\n".join(lines), encoding="utf-8")


def _write_failures_csv(failures: list[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["type", "old", "new", "reason"])
        w.writeheader()
        for row in failures:
            w.writerow(row)


def main():
    parser = argparse.ArgumentParser(description="Execute P3.1 rename plan")
    parser.add_argument("--plan", required=True, help="Path to rename-plan.csv")
    parser.add_argument("--out-dir", required=True, help="Output directory for logs")
    parser.add_argument("--dry-run", action="store_true", help="Only print; do not rename")
    args = parser.parse_args()

    plan = _read_plan(Path(args.plan))
    if args.dry_run:
        _dry_run_preview(plan)
        return

    log, failures = execute_rename_plan(plan)

    out_dir = Path(args.out_dir)
    _write_log_md(log, out_dir / "rename_execution_log.md")
    _write_failures_csv(failures, out_dir / "rename_failures.csv")

    ok = sum(1 for r in log if r["status"] == "ok")
    done = sum(1 for r in log if r["status"] == "already_done")
    print(f"Done. ok={ok}, already_done={done}, failures={len(failures)}")
    print(f"Log: {out_dir / 'rename_execution_log.md'}")
    print(f"Failures: {out_dir / 'rename_failures.csv'}")


if __name__ == "__main__":
    main()
