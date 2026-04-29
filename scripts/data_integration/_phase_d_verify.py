# -*- coding: utf-8 -*-
"""Phase D: 对 100 条抽样做程序化源文件核对.

策略:
  1. 读 78 份 `_已校验.xlsx`, 按 (院校代码, 专业代码, 科目) 建索引, 每条记录携带 (year, round_hint, 专业计划数, 专业名称, 文件名)
  2. 解析每条样本的 `_zj_cols` 中的写入值 ("23征集第1次计划=X; 24征集第2次计划=Y")
  3. 对每个 (year, round, plan_value) 断言: 源索引里有相同 (cc, mc, subj, year, ~round, plan=value) 的记录存在
  4. 同时 2 级校验: 专业名称 (主表) 与 源侧专业名称 做 norm_text 相等或包含关系

输出: `_p5_out/phase_d/verification_report.xlsx`, 含每行 status ∈ {PASS, FAIL-未找到源, FAIL-计划数不符, FAIL-专业名称不符}
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from collections import defaultdict

import pandas as pd

ROOT = Path(".")
FREEZE = ROOT / "scripts/data_integration/_p5_out/征集源冻结清单.json"
SAMPLES = ROOT / "scripts/data_integration/_p5_out/phase_d/samples_100.xlsx"
OUT = ROOT / "scripts/data_integration/_p5_out/phase_d/verification_report.xlsx"


def norm(s) -> str:
    if pd.isna(s):
        return ""
    return str(s).strip().replace(" ", "").replace("　", "")


def norm_code(s) -> str:
    if pd.isna(s):
        return ""
    s = str(s).strip()
    # 去除小数点后 0 (pandas 读 int 为 float)
    if s.endswith(".0"):
        s = s[:-2]
    return s.zfill(2) if s.isdigit() and len(s) < 2 else s


def parse_year_from_path(p: str) -> str:
    m = re.search(r"_(202[345])_", p)
    return m.group(1) if m else "?"


def parse_round_hint(p: str) -> str:
    """从文件名解析轮次 (第一轮/第二轮/第三轮/第四轮)."""
    m = re.search(r"第([一二三四1234])轮", p)
    if not m:
        return ""
    mapping = {"一": "1", "二": "2", "三": "3", "四": "4", "1": "1", "2": "2", "3": "3", "4": "4"}
    return mapping.get(m.group(1), "")


def load_source_index() -> tuple[dict, dict]:
    """返回 两级索引:
       strict: (year, cc, mc, subj) -> list[record]
       loose : (year, cc, subj)     -> list[record]   (含 mc 信息以便后续核对)
    """
    with FREEZE.open(encoding="utf-8") as f:
        freeze = json.load(f)
    strict = defaultdict(list)
    loose = defaultdict(list)
    for fi in freeze["files"]:
        fp = ROOT / fi["path"]
        year = parse_year_from_path(fi["path"])
        rh = parse_round_hint(fi["path"])
        try:
            df = pd.read_excel(fp)
        except Exception as e:
            print(f"[WARN] 读失败: {fp.name}: {e}", file=sys.stderr)
            continue
        col_cc = "院校代码"
        col_mc = "专业代码"
        col_subj = "科目"
        col_plan = "专业计划数"
        col_pname = "专业名称"
        missing = [c for c in [col_cc, col_mc, col_subj, col_plan] if c not in df.columns]
        if missing:
            print(f"[WARN] {fp.name} 缺列: {missing}", file=sys.stderr)
            continue
        for _, row in df.iterrows():
            cc = norm_code(row[col_cc])
            mc = norm_code(row[col_mc])
            subj = norm(row[col_subj])
            try:
                plan = int(float(row[col_plan])) if pd.notna(row[col_plan]) else None
            except Exception:
                plan = None
            rec = {
                "round_hint": rh,
                "plan": plan,
                "mc": mc,
                "pname": norm(row.get(col_pname, "")),
                "fname": fp.name,
            }
            strict[(year, cc, mc, subj)].append(rec)
            loose[(year, cc, subj)].append(rec)
    return strict, loose


ZJ_PATTERN = re.compile(r"(2[345])征集第([1234])次计划=([0-9.]+)")


def parse_zj_cols(s: str):
    """['23征集第1次计划=2', ...] -> [(year, round, plan_int)]"""
    result = []
    for m in ZJ_PATTERN.finditer(s or ""):
        year = "20" + m.group(1)
        rnd = m.group(2)
        try:
            plan = int(float(m.group(3)))
        except Exception:
            plan = None
        result.append((year, rnd, plan))
    return result


def verify_sample(sample_row, strict_idx, loose_idx) -> dict:
    """两级匹配: 优先严格 (cc,mc,subj), 回退宽松 (cc,subj)+plan+名称 匹配."""
    cc = norm_code(sample_row["院校代码"])
    mc = norm_code(sample_row["专业代码"])
    subj = norm(sample_row["科目"])
    pname_main = norm(sample_row.get("专业", ""))
    writes = parse_zj_cols(sample_row.get("_zj_cols", ""))

    per_write = []
    overall = "PASS"

    def name_match(src_name: str) -> bool:
        if not pname_main or not src_name:
            return False
        return pname_main == src_name or pname_main in src_name or src_name in pname_main

    for year, rnd, plan in writes:
        # 先严格匹配
        strict_cands = strict_idx.get((year, cc, mc, subj), [])
        strict_round = [c for c in strict_cands if c["round_hint"] == rnd] or strict_cands
        strict_plan = [c for c in strict_round if c["plan"] == plan]
        if strict_plan:
            sn = {c["pname"] for c in strict_plan}
            if any(name_match(n) for n in sn):
                per_write.append(f"{year}R{rnd}={plan} OK-严格 ({strict_plan[0]['fname'][:28]})")
                continue
        # 宽松匹配 (DOWNGRADE 路径): 允许 mc 不同, 但须 plan + 名称 同时命中
        loose_cands = loose_idx.get((year, cc, subj), [])
        loose_round = [c for c in loose_cands if c["round_hint"] == rnd] or loose_cands
        loose_match = [c for c in loose_round if c["plan"] == plan and name_match(c["pname"])]
        if loose_match:
            per_write.append(
                f"{year}R{rnd}={plan} OK-宽松(mc={mc}→{loose_match[0]['mc']}) ({loose_match[0]['fname'][:28]})"
            )
            continue
        # 都失败
        if not strict_cands and not loose_cands:
            per_write.append(f"{year}R{rnd}={plan} 未在源找到任何 (cc={cc},subj={subj})")
            overall = "FAIL-未找到源"
        elif strict_plan and not any(name_match(c["pname"]) for c in strict_plan):
            sn = {c["pname"] for c in strict_plan}
            per_write.append(f"{year}R{rnd}={plan} 严格计划对但名称不符, 主={pname_main} 源={sn}")
            if overall == "PASS":
                overall = "FAIL-专业名称不符"
        else:
            all_plans = sorted({c["plan"] for c in (loose_round or strict_round)})
            all_names = {c["pname"] for c in (loose_round or strict_round)}
            per_write.append(
                f"{year}R{rnd}={plan} 计划/名称均不符, 源计划={all_plans} 源名称样本={list(all_names)[:3]}"
            )
            overall = "FAIL-计划数不符"
    return {"status": overall, "detail": " | ".join(per_write)}


def main() -> None:
    print("[1/3] 构建源索引")
    strict_idx, loose_idx = load_source_index()
    print(f"       严格键数: {len(strict_idx)}, 宽松键数: {len(loose_idx)}")

    print("[2/3] 读样本")
    samples = pd.read_excel(SAMPLES)
    print(f"       样本数: {len(samples)}")

    print("[3/3] 逐条核对")
    statuses = []
    details = []
    for _, row in samples.iterrows():
        r = verify_sample(row, strict_idx, loose_idx)
        statuses.append(r["status"])
        details.append(r["detail"])
    samples["status"] = statuses
    samples["detail"] = details
    samples.to_excel(OUT, index=False)

    # 统计
    from collections import Counter
    c = Counter(statuses)
    print(f"\n核对结果: {dict(c)}")
    pass_rate = c.get("PASS", 0) / len(samples) * 100
    print(f"PASS 率: {pass_rate:.1f}%")


if __name__ == "__main__":
    main()
