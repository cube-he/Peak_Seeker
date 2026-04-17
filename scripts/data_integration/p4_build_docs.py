# -*- coding: utf-8 -*-
"""
P4.3 + P4.4 — 自动生成数据字典与质量仪表板

读取 03_enriched_2025.xlsx + lineage.json:
  - data_dictionary.md: 逐列 (name / type / source / missing% / example)
  - data_quality_dashboard.md: 总览 / 按血缘分布 / 年份-批次-科目覆盖 / open issues
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd


ENRICHED_PATH = Path("data/_pipeline/P4/03_enriched_2025.xlsx")
LINEAGE_PATH = Path("data/_pipeline/P4/lineage.json")
RELATION_13_PATH = Path("data/_pipeline/P4/13_relation_2025.xlsx")


# 关键字段元信息 (name → description)
FIELD_DESCRIPTIONS = {
    "数据年份": "招生/录取数据年份",
    "院校代码": "四川招生代码 (4位)",
    "院校名称": "院校名称",
    "专业组代码": "专业组代码 (2025 新高考)",
    "专业代码": "专业代码",
    "批次": "录取批次",
    "科目": "物理类/历史类 (2025); 文科/理科 (2024 及以前)",
    "老批次": "历史批次命名",
    "招生类型": "普通/国家专项/地方专项 等",
    "投档顺序": "投档次序",
    "志愿设置": "平行志愿/顺序志愿",
    "专业": "专业简称",
    "专业全称": "专业全称",
    "专业备注": "专业备注 (办学校区/语种等)",
    "院校备注": "院校备注",
    "是否新增": "2025 新增专业标记",
    "选科要求": "新高考选科要求",
    "25专业组计划": "2025 专业组计划人数",
    "计划人数": "本专业计划人数",
    "学制": "学制",
    "学费": "学费 (元/学年)",
    "最低分": "投档最低分",
    "最高分": "投档最高分",
    "平均分": "平均分",
    "最低位次": "对应最低分的位次",
    "最高位次": "对应最高分的位次",
    "平均位次": "平均位次",
    "_lineage_source": "血缘: 03 / 03+01候选 / 01",
}


def guess_type(series: pd.Series) -> str:
    """Heuristic type."""
    s = series.dropna()
    if len(s) == 0:
        return "str (all null)"
    if s.astype(str).str.match(r"^-?\d+\.?\d*$").all():
        return "numeric (as str)"
    return "str"


def build_data_dictionary(enriched: pd.DataFrame, lineage: dict) -> str:
    lines = ["# 数据字典 — admission_master (03_enriched_2025 + 13_relation_2025)",
             "",
             f"**生成**: 2026-04-17  ",
             f"**主表行数**: {len(enriched):,}  ",
             f"**字段数**: {len(enriched.columns)}  ",
             "",
             "## 主表字段 (03_enriched_2025)",
             "",
             "| 字段 | 类型 | 来源(非空数) | 缺失率 | 说明 | 示例 |",
             "|---|---|---|---:|---|---|"]

    summary = lineage.get("column_source_summary", {})
    total_rows = len(enriched)

    for col in enriched.columns:
        if col == "_lineage_source":
            continue
        tp = guess_type(enriched[col])
        src = summary.get(col, {})
        nn03 = src.get("03", 0)
        nn01 = src.get("01", 0)
        nnp = src.get("patched", 0)
        null_n = src.get("null", 0)
        miss_rate = null_n / total_rows * 100 if total_rows else 0
        src_desc = []
        if nn03: src_desc.append(f"03:{nn03}")
        if nn01: src_desc.append(f"01:{nn01}")
        if nnp: src_desc.append(f"patched:{nnp}")
        src_str = " / ".join(src_desc) or "—"
        desc = FIELD_DESCRIPTIONS.get(col, "")
        example = ""
        non_null = enriched[col].dropna()
        if len(non_null):
            ex = str(non_null.iloc[0])[:30]
            example = ex.replace("|", "\\|").replace("\n", " ")
        col_safe = col.replace("|", "\\|")
        lines.append(f"| `{col_safe}` | {tp} | {src_str} | {miss_rate:.1f}% | {desc} | {example} |")

    lines.append("")
    lines.append("## 关联表 (13_relation_2025)")
    lines.append("")
    lines.append("`13_relation_2025.xlsx` 存储 2025 年征集志愿事件 (12,277 行)，以 (数据年份, 院校代码, 专业代码) 关联主表，附加 `_meta_轮次` 区分第一次/第二次征集。不合入主表因其具有时序维度。")
    lines.append("")
    lines.append("## Holdback")
    lines.append("")
    lines.append("`13_historical.xlsx` (2023/2024, 10,732 行) 暂不纳入 P4 统一数据集，等待 Task 7b 完成 01×03 历史年份反哺后再合入。")

    return "\n".join(lines)


def build_quality_dashboard(enriched: pd.DataFrame, lineage: dict, rel13_rows: int) -> str:
    total = len(enriched)
    ls = enriched["_lineage_source"].value_counts().to_dict()

    summary = lineage.get("column_source_summary", {})
    col_count = len(summary)
    total_cells = total * col_count
    total_03 = sum(d.get("03", 0) for d in summary.values())
    total_01 = sum(d.get("01", 0) for d in summary.values())
    total_patched = sum(d.get("patched", 0) for d in summary.values())
    total_null = sum(d.get("null", 0) for d in summary.values())

    # Per-col missing distribution
    high_miss = []
    for col, d in summary.items():
        miss = d.get("null", 0) / total if total else 0
        if miss > 0.5:
            high_miss.append((col, miss))
    high_miss.sort(key=lambda x: -x[1])

    # 批次覆盖
    batch_counts = enriched["批次"].value_counts().to_dict() if "批次" in enriched.columns else {}
    course_counts = enriched["科目"].value_counts().to_dict() if "科目" in enriched.columns else {}

    lines = ["# 数据质量仪表板 — admission_master (2025)",
             "",
             f"**生成**: 2026-04-17",
             "",
             "## 1. 总览",
             "",
             f"- 主表行数: **{total:,}**",
             f"- 主表列数: **{col_count}**",
             f"- 13 关联表行数 (2025): **{rel13_rows:,}**",
             f"- 总单元格: {total_cells:,}",
             "",
             "## 2. 行级血缘分布",
             "",
             "| 来源 | 行数 | 占比 |",
             "|---|---:|---:|"]

    for src, n in sorted(ls.items(), key=lambda x: -x[1]):
        lines.append(f"| `{src}` | {n:,} | {n/total*100:.1f}% |")

    lines += ["",
              "## 3. 单元格级血缘分布",
              "",
              "| 来源 | 单元格数 | 占比 |",
              "|---|---:|---:|",
              f"| 03 (主源) | {total_03:,} | {total_03/total_cells*100:.1f}% |",
              f"| 01 (补缺) | {total_01:,} | {total_01/total_cells*100:.1f}% |",
              f"| patched (P1 修复) | {total_patched:,} | {total_patched/total_cells*100:.3f}% |",
              f"| null | {total_null:,} | {total_null/total_cells*100:.1f}% |",
              ""]

    lines += ["## 4. 批次覆盖",
              "",
              "| 批次 | 行数 |",
              "|---|---:|"]
    for b, n in sorted(batch_counts.items(), key=lambda x: -x[1])[:20]:
        lines.append(f"| {b} | {n:,} |")

    lines += ["",
              "## 5. 科目覆盖",
              "",
              "| 科目 | 行数 |",
              "|---|---:|"]
    for c, n in sorted(course_counts.items(), key=lambda x: -x[1]):
        lines.append(f"| {c} | {n:,} |")

    lines += ["",
              "## 6. 高缺失字段 (missing > 50%)",
              "",
              "| 字段 | 缺失率 |",
              "|---|---:|"]
    for col, m in high_miss[:30]:
        lines.append(f"| `{col}` | {m*100:.1f}% |")

    lines += ["",
              "## 7. 未解决问题",
              "",
              "- **5 条 OCR malformed** (`data/_pipeline/P3/needs_human_review.csv`): 对口/艺术类特殊代码，需人工复核 OCR 图像",
              "- **118 条无法桥接的四川招生码** (P2 遗留): 未入 01 配对，保留于 03 中仅占 03 独有一侧",
              "- **22 条 missing_college_codes** (`data/_pipeline/P2/missing_college_codes.csv`): 01 国标码无对应四川招生码",
              "- **2023/2024 历史数据** (`13_historical.xlsx` 10,732 行): 等 Task 7b 01×03 反哺后合入",
              "- **补充数据 (9 文件)**: 另属 P3 工单之外的独立数据源，单独解析",
              ""]

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--enriched", default=str(ENRICHED_PATH))
    parser.add_argument("--lineage", default=str(LINEAGE_PATH))
    parser.add_argument("--rel13", default=str(RELATION_13_PATH))
    parser.add_argument("--out-dir", default="docs/superpowers/specs/2026-04-17-data-integration-master")
    args = parser.parse_args()

    enriched = pd.read_excel(args.enriched, dtype=str)
    with open(args.lineage, encoding="utf-8") as f:
        lineage = json.load(f)

    rel13_rows = 0
    rp = Path(args.rel13)
    if rp.exists():
        rel13 = pd.read_excel(rp, dtype=str)
        rel13_rows = len(rel13)

    dict_md = build_data_dictionary(enriched, lineage)
    dash_md = build_quality_dashboard(enriched, lineage, rel13_rows)

    out_dir = Path(args.out_dir)
    dict_path = out_dir / "data_dictionary.md"
    dash_path = out_dir / "data_quality_dashboard.md"
    dict_path.write_text(dict_md, encoding="utf-8")
    dash_path.write_text(dash_md, encoding="utf-8")

    print(f"→ {dict_path}")
    print(f"→ {dash_path}")


if __name__ == "__main__":
    main()
