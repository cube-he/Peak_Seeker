# -*- coding: utf-8 -*-
"""
P3.3a — 调查"页码全为 1" 红旗。
对 99 个 xlsx 遍历其 "页码" 列，统计分布。
"""
from __future__ import annotations

from collections import Counter
from pathlib import Path

import pandas as pd

DATA_ROOT = Path("data/13_征集志愿/普通高考")


def scan_page_column():
    per_file_dist: dict[str, Counter] = {}
    global_dist: Counter = Counter()
    files_all_one: list[str] = []
    files_multi_page: list[str] = []
    files_no_page_col: list[str] = []

    for xlsx in sorted(DATA_ROOT.rglob("*.xlsx")):
        rel = str(xlsx.relative_to(DATA_ROOT))
        if "补充数据" in rel:
            # 补充数据 has metadata header — skip
            continue
        try:
            df = pd.read_excel(xlsx)
        except Exception as e:
            per_file_dist[rel] = Counter({f"error:{e}": 1})
            continue
        page_col = next((c for c in df.columns if "页" in str(c)), None)
        if page_col is None:
            files_no_page_col.append(rel)
            continue
        vals = df[page_col].dropna().astype(str).str.strip()
        cnt = Counter(vals)
        per_file_dist[rel] = cnt
        for k, v in cnt.items():
            global_dist[k] += v
        unique_nonempty = [k for k in cnt if k not in ("", "nan")]
        if unique_nonempty == ["1"]:
            files_all_one.append(rel)
        elif len(unique_nonempty) > 1:
            files_multi_page.append(rel)

    return {
        "per_file": per_file_dist,
        "global": global_dist,
        "files_all_one": files_all_one,
        "files_multi_page": files_multi_page,
        "files_no_page_col": files_no_page_col,
    }


def write_report(result: dict, out: Path):
    out.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# P3.3a · 页码字段调查",
        "",
        f"Generated from {len(result['per_file'])} xlsx (excluding 补充数据).",
        "",
        "## Global page-value distribution (top 20)",
        "",
        "| value | count |",
        "|---|---:|",
    ]
    for v, c in result["global"].most_common(20):
        lines.append(f"| `{v}` | {c} |")

    lines.extend([
        "",
        f"## 文件分类统计",
        "",
        f"- **all_one**: 页码列仅含 `1` 的文件数 = {len(result['files_all_one'])}",
        f"- **multi_page**: 页码列含多个值的文件数 = {len(result['files_multi_page'])}",
        f"- **no_page_col**: 未发现含'页'字列名的文件数 = {len(result['files_no_page_col'])}",
        "",
        "## multi_page 样例（前 20 个）",
        "",
    ])
    for f in result["files_multi_page"][:20]:
        cnt = result["per_file"][f]
        top = ", ".join(f"{k}:{v}" for k, v in cnt.most_common(5))
        lines.append(f"- `{f}` → {top}")

    lines.extend([
        "",
        "## all_one 样例（前 20 个）",
        "",
    ])
    for f in result["files_all_one"][:20]:
        cnt = result["per_file"][f]
        lines.append(f"- `{f}` → total={sum(cnt.values())} 行全是页码=1")

    lines.extend([
        "",
        "## 根因结论",
        "",
        "根据上方统计：",
        "- 如果 **all_one** 占绝大多数 → OCR pipeline 在合并多页时遗失页码，归一化为 1",
        "- 如果 **multi_page** 也很多 → 不同 xlsx 的 OCR 归一化策略不一致",
        "",
        "## 处置决策",
        "",
        "见下方根据数据得出的建议，会写入 DECISIONS.md。",
    ])
    out.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    r = scan_page_column()
    out = Path("data/_pipeline/P3/page_one_investigation.md")
    write_report(r, out)
    print(f"Wrote {out}")
    print(f"all_one: {len(r['files_all_one'])}, multi_page: {len(r['files_multi_page'])}, "
          f"no_page_col: {len(r['files_no_page_col'])}")
