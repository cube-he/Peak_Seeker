# -*- coding: utf-8 -*-
"""Generate P1_report.md from patch_log + unresolvable.

Usage:
    python -m scripts.data_integration.p1_report
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parents[2]
LOG = REPO_ROOT / "data" / "_pipeline" / "P1" / "patch_log.csv"
UNRES = REPO_ROOT / "data" / "_pipeline" / "P1" / "unresolvable.csv"
OUT_XLSX = REPO_ROOT / "data" / "_pipeline" / "P1" / "03_patched.xlsx"
REPORT = (
    REPO_ROOT / "docs" / "superpowers" / "specs"
    / "2026-04-17-data-integration-master" / "P1_report.md"
)


def main() -> int:
    log = pd.read_csv(LOG) if LOG.exists() else pd.DataFrame()
    unres = pd.read_csv(UNRES) if UNRES.exists() else pd.DataFrame()

    try:
        patched_rows = len(pd.read_excel(OUT_XLSX))
    except Exception:
        patched_rows = None

    lines = []
    lines.append("# P1 报告：基线与 03 主表自洽")
    lines.append("")
    lines.append(f"- **生成时间**：{datetime.now(tz=timezone.utc).isoformat()}")
    lines.append(f"- **产物**：`data/_pipeline/P1/03_patched.xlsx` (rows={patched_rows})")
    lines.append(f"- **日志**：`data/_pipeline/P1/patch_log.csv` (entries={len(log)})")
    if not unres.empty:
        lines.append(f"- **未解决**：`data/_pipeline/P1/unresolvable.csv` (entries={len(unres)})")
    lines.append("")

    lines.append("## 修复动作汇总")
    lines.append("")
    if not log.empty:
        vc = log["action"].value_counts()
        lines.append("| Action | Count |")
        lines.append("|---|---|")
        for a, c in vc.items():
            lines.append(f"| `{a}` | {c} |")
    else:
        lines.append("_无修改_")
    lines.append("")

    lines.append("## 抽样检查（供用户验收）")
    lines.append("")
    if not log.empty:
        sample = log.sample(min(20, len(log)), random_state=42).sort_values("action")
        lines.append("| Action | RowIdx | Kept | Detail |")
        lines.append("|---|---|---|---|")
        for _, r in sample.iterrows():
            detail = str(r.get("detail", ""))[:80]
            lines.append(
                f"| {r['action']} | {r.get('row_index','')} | "
                f"{r.get('kept_row_index','')} | {detail} |"
            )
    lines.append("")

    lines.append("## 待处置事项")
    lines.append("")
    if not unres.empty:
        lines.append(f"- {len(unres)} 条未解决（类型分布见 `unresolvable.csv`），将在 P2 阶段用 01 反查修复")
    else:
        lines.append("_无_")
    lines.append("")

    lines.append("## 验收 Checklist")
    lines.append("")
    lines.append("- [ ] 重复记录去除数量与审计报告一致（34 条）")
    lines.append("- [ ] 分数异常标记数量与审计报告一致（约 161+71=232 条）")
    lines.append("- [ ] 抽样 20 条修正记录，人工核对合理")
    lines.append("- [ ] `03_patched.xlsx` 行数 = 48131 - 去重数")
    lines.append("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written: {REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
