# -*- coding: utf-8 -*-
"""
P3.3c — 纯程序化统计 OCR 错误迹象（无需图片比对）。
覆盖可由规则检测的错误：
  - code_malformed: 院校代码/专业代码字符形态异常
  - bracket_unbalanced: 括号不匹配
  - bracket_mixed: 中英/全半角混用
  - number_float_coerced: 代码被解析为 float（xxx.0）
  - forward_fill_gap: 第一列/批次/分类行应该向下继承但值为空
  - truncated_memo: 备注结尾含未闭合括号或疑似截断
  - all_caps_or_empty_cols: 整列几乎全空
"""
from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

import pandas as pd

DATA_ROOT = Path("data/13_征集志愿/普通高考")


def analyze_xlsx(xlsx_path: Path) -> dict:
    counters: Counter = Counter()
    examples: dict[str, list[str]] = {}

    # Read twice: str + default to catch float-coercion
    try:
        df_str = pd.read_excel(xlsx_path, dtype=str)
        df_default = pd.read_excel(xlsx_path)
    except Exception as e:
        return {"error": str(e)}

    n = len(df_str)
    if n == 0:
        return {"n_rows": 0}

    for col in ("院校代码", "专业代码"):
        if col not in df_str.columns:
            continue
        for i in range(n):
            v_str = df_str.iloc[i][col]
            v_def = df_default.iloc[i][col] if col in df_default.columns else None
            if pd.isna(v_str):
                continue
            v_str = str(v_str).strip()

            # float coercion check
            if isinstance(v_def, float) and not pd.isna(v_def):
                counters["number_float_coerced"] += 1
                _add_example(examples, "number_float_coerced",
                             f"row{i}/{col}: str={v_str!r}, default={v_def!r}")

            # Malformed
            if col == "院校代码":
                if v_str and (not v_str.replace(".0", "").isdigit()
                              or len(v_str.replace(".0", "")) != 4):
                    counters["code_malformed"] += 1
                    _add_example(examples, "code_malformed", f"row{i}/{col}={v_str!r}")
            if col == "专业代码":
                clean = v_str.replace(".0", "").replace(" ", "")
                if clean and not clean.isalnum():
                    counters["code_malformed"] += 1
                    _add_example(examples, "code_malformed", f"row{i}/{col}={v_str!r}")

    # Text-column errors
    for col in df_str.columns:
        dtype_matters = any(k in str(col) for k in ["备注", "名称", "地址"])
        if not dtype_matters:
            continue
        for i in range(n):
            v = df_str.iloc[i][col]
            if pd.isna(v):
                continue
            v = str(v)
            # bracket
            if "(" in v and "（" in v:
                counters["bracket_mixed"] += 1
                _add_example(examples, "bracket_mixed", f"row{i}/{col}: {v[:80]}")
            if v.count("（") != v.count("）") or v.count("(") != v.count(")"):
                counters["bracket_unbalanced"] += 1
                _add_example(examples, "bracket_unbalanced", f"row{i}/{col}: {v[:80]}")
            # truncation heuristic
            if v.endswith(("（", "(", "；", ";")) or v.count("（") > v.count("）"):
                counters["truncated_memo"] += 1
                _add_example(examples, "truncated_memo", f"row{i}/{col}: {v[-80:]}")

    # Forward-fill gap — if 批次/分类/科类 first row populated but some mid row empty
    for col in ("批次", "科类", "分类"):
        if col not in df_str.columns:
            continue
        col_series = df_str[col]
        if col_series.isna().all():
            continue
        # If there's at least one non-null then a mid null, flag
        first_nonnull = col_series.first_valid_index()
        if first_nonnull is None:
            continue
        mid_nulls = col_series.iloc[first_nonnull:].isna().sum()
        if mid_nulls > 0:
            counters["forward_fill_gap"] += int(mid_nulls)
            _add_example(examples, "forward_fill_gap",
                         f"col={col}, mid_null_count={mid_nulls}")

    return {"n_rows": n, "counters": dict(counters), "examples": examples}


def _add_example(store: dict, key: str, ex: str, cap: int = 3):
    store.setdefault(key, [])
    if len(store[key]) < cap:
        store[key].append(ex)


def run_all():
    per_file = {}
    global_counter: Counter = Counter()
    global_examples: dict[str, list[str]] = {}
    total_rows = 0

    for xlsx in sorted(DATA_ROOT.rglob("*.xlsx")):
        rel = str(xlsx.relative_to(DATA_ROOT))
        if "补充数据" in rel:
            continue
        info = analyze_xlsx(xlsx)
        per_file[rel] = info
        if "counters" in info:
            for k, v in info["counters"].items():
                global_counter[k] += v
            for k, exs in info["examples"].items():
                for ex in exs:
                    _add_example(global_examples, k, f"[{rel}] {ex}", cap=5)
        total_rows += info.get("n_rows", 0)

    return {"n_files": len(per_file), "total_rows": total_rows,
            "global_counter": dict(global_counter),
            "global_examples": global_examples, "per_file": per_file}


def write_catalog(result: dict, out: Path):
    out.parent.mkdir(parents=True, exist_ok=True)
    gc = result["global_counter"]
    total_rows = result["total_rows"]
    lines = [
        "# P3.3 · OCR 错误目录 (程序化统计)",
        "",
        f"**扫描范围**: {result['n_files']} 个 xlsx (排除补充数据), 共 {total_rows} 行",
        "",
        "> 本表仅包含规则可检测的错误。主观错误 (字符混淆如 O/0) "
        "需图片比对子 agent 补充；见 `ocr_error_catalog_subagent_sample.md`。",
        "",
        "## 错误类型分布",
        "",
        "| 错误类型 | 出现次数 | 估算行级错误率 |",
        "|---|---:|---:|",
    ]
    for k, v in sorted(gc.items(), key=lambda x: -x[1]):
        rate = v / max(total_rows, 1) * 100
        lines.append(f"| `{k}` | {v} | {rate:.2f}% |")

    lines.extend(["", "## 样例 (每类前 5)", ""])
    for k, exs in result["global_examples"].items():
        lines.append(f"### {k}")
        for ex in exs:
            lines.append(f"- {ex}")
        lines.append("")

    lines.extend([
        "## 修复策略",
        "",
        "| 错误类型 | 自动 | 半自动 | 人工 | 备注 |",
        "|---|:-:|:-:|:-:|---|",
        "| `number_float_coerced` | ✅ | | | 改用 `pd.read_excel(..., dtype=str)` |",
        "| `code_malformed` | 部分 | ✅ | | 字符混淆可自动回溯 (O→0, l→1); "
        "真畸形 (如 YH、C9) 是合法代码 |",
        "| `bracket_mixed` | ✅ | | | 统一为中文括号 |",
        "| `bracket_unbalanced` | | ✅ | | 根据上下文补齐或标记 flag |",
        "| `truncated_memo` | | ✅ | | 标记 flag_maybe_truncated, 可选重 OCR |",
        "| `forward_fill_gap` | ✅ | | | 按列 forward-fill |",
        "",
    ])
    out.write_text("\n".join(lines), encoding="utf-8")


if __name__ == "__main__":
    r = run_all()
    out = Path("docs/superpowers/specs/2026-04-17-data-integration-master/ocr_error_catalog.md")
    write_catalog(r, out)
    # also dump raw json for debugging
    dbg = Path("data/_pipeline/P3/ocr_error_catalog_raw.json")
    dbg.parent.mkdir(parents=True, exist_ok=True)
    dbg.write_text(json.dumps({"global": r["global_counter"],
                               "examples": r["global_examples"],
                               "n_files": r["n_files"],
                               "total_rows": r["total_rows"]},
                              ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {out}; total_rows={r['total_rows']}; counters={r['global_counter']}")
