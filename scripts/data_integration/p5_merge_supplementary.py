# -*- coding: utf-8 -*-
"""
P5 阶段 B/C — 征集志愿合并至专业招生主表.

按照方案 v4 实施:
  - 加载主表, 清空/新增 11 个征集列
  - 构建多级索引 (2025 六键/五键, 23-24 四键/三键/名称)
  - 遍历 78 个征集文件, 逐行映射后匹配主表, 写入对应轮次列
  - 执行一致性校验 (7.1-7.4)
  - 输出时间戳新文件 + 所有日志

输入:
  - data/03_专家版主表/output/专业招生主表.xlsx                     (主表, 不修改)
  - data/13_征集志愿/**/*_已校验.xlsx                             (78 个征集文件)

产出:
  - scripts/data_integration/_p5_out/专业招生主表_含征集_{TS}.xlsx  (合并后主表)
  - scripts/data_integration/_p5_out/征集合并校验日志.xlsx
  - scripts/data_integration/_p5_out/征集未匹配记录.xlsx
  - scripts/data_integration/_p5_out/征集行异常.xlsx
  - scripts/data_integration/_p5_out/征集抽样核对.xlsx
  - scripts/data_integration/_p5_out/p5_summary.txt
"""
from __future__ import annotations

import random
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pandas as pd

from lib.supp_matcher import (
    SUPP_TYPE_2025,
    map_subject,
    map_2025_type,
    map_2324_type,
    map_2324_old_batch,
    norm_college_code,
    norm_group_code,
    norm_major_code,
    norm_text,
    parse_rounds_from_text,
)

# ==================== 路径 ====================
MASTER_PATH = Path("data/03_专家版主表/output/专业招生主表.xlsx")
SUPP_DIR = Path("data/13_征集志愿")
OUT_DIR = Path("scripts/data_integration/_p5_out")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ==================== 征集列 (方案 §二) ====================
SUPP_COLS = (
    [f"23征集第{i}次计划" for i in range(1, 5)]
    + [f"24征集第{i}次计划" for i in range(1, 5)]
    + [f"25征集第{i}次计划" for i in range(1, 4)]
)

# 年份对应的计划人数列（校验 7.3 用）
PLAN_COL_BY_YEAR = {
    2025: "计划人数",
    2024: "24计划人数",
    2023: "23计划人数",
}

# ==================== 日志容器 ====================
class Logs:
    def __init__(self) -> None:
        self.validation: list[dict] = []   # 合并校验日志 (字段不一致/一致性违反)
        self.unmatched: list[dict] = []    # 未匹配记录
        self.row_errors: list[dict] = []   # 行级异常 (科类异常/类型未映射等)
        self.written: list[dict] = []      # 已写入追踪表


# ==================== 文件名解析 ====================
def parse_filename(fname: str) -> dict:
    """解析文件名, 返回 {id, year, batch_raw, global_rounds, segment_round_map}.

    segment_round_map: {批次段关键词: 轮次号} (仅多段文件有)
    """
    base = fname.replace("_已校验.xlsx", "")
    parts = base.split("_")
    info = {"fname": fname, "id": parts[0] if parts else ""}

    # 年份
    if len(parts) >= 2 and parts[1].isdigit() and len(parts[1]) == 4:
        info["year"] = int(parts[1])
    else:
        info["year"] = None
        return info

    # 找 "征集志愿"
    try:
        zj_idx = parts.index("征集志愿")
    except ValueError:
        return info

    # 批次原文
    batch_parts = parts[3:zj_idx]
    info["batch_raw"] = "_".join(batch_parts)

    # 全局轮次 (整个文件名里所有"第N次")
    after_zj = "_".join(parts[zj_idx + 1:])
    all_text = info["batch_raw"] + "_" + after_zj
    info["global_rounds"] = parse_rounds_from_text(all_text)

    # 多段解析: 如 "A段国家专项第二次+A段地方专项第一次"
    # split by "+", 每段提取(关键词, 轮次)
    segment_round_map: dict[str, int] = {}
    if "+" in info["batch_raw"]:
        for seg in info["batch_raw"].split("+"):
            rs = parse_rounds_from_text(seg)
            if len(rs) == 1:
                # 关键词 = 去掉"第N次"后的剩余
                kw = re.sub(r"第[一二三四五12345]次", "", seg).strip("_").strip()
                # 再去掉常见前缀
                for prefix in ("本科批次_", "本科提前批次_", "专科批次_", "专科提前批次_"):
                    if kw.startswith(prefix):
                        kw = kw[len(prefix):]
                        break
                if kw:
                    segment_round_map[kw] = rs[0]
    info["segment_round_map"] = segment_round_map

    return info


# ==================== 轮次分配 ====================
def clean_for_match(s: str) -> str:
    """清洗字符串用于子串匹配."""
    if not s:
        return ""
    return re.sub(r"[^\u4e00-\u9fffA-Za-z0-9]", "", s)


def determine_round(
    file_info: dict,
    row_main_batch: str | None,
) -> tuple[int | None, str]:
    """根据文件名+行的主表批次, 返回 (轮次号, 备注).

    - 单轮文件 → 返回全局轮次
    - 多段文件 → 按主表批次匹配段关键词
    - 无法判定 → 返回 None + 备注
    """
    rounds = file_info.get("global_rounds", [])
    seg_map = file_info.get("segment_round_map", {})

    if not rounds:
        return None, "WARN-轮次未识别"

    if len(rounds) == 1:
        return rounds[0], ""

    # 多轮 + 多段
    if seg_map and row_main_batch:
        cleaned_batch = clean_for_match(row_main_batch)
        hits = [(kw, rnum) for kw, rnum in seg_map.items()
                if clean_for_match(kw) and clean_for_match(kw) in cleaned_batch]
        if len(hits) == 1:
            return hits[0][1], f"INFO-段匹配:{hits[0][0]}"
        if len(hits) > 1:
            return max(r for _, r in hits), f"WARN-段多命中:{[h[0] for h in hits]}"

    # 兜底: 多轮但无法拆分 → 取最大轮次
    return max(rounds), f"WARN-轮次合并:{rounds}"


# ==================== 主表加载与索引 ====================
def load_master() -> pd.DataFrame:
    print(f"[P5-B] 加载主表 {MASTER_PATH}...")
    df = pd.read_excel(MASTER_PATH, engine="openpyxl")
    print(f"       {len(df)} 行 × {len(df.columns)} 列")
    return df


def ensure_supp_cols(df: pd.DataFrame) -> None:
    """幂等性: 清空/创建 11 个征集列."""
    for col in SUPP_COLS:
        df[col] = pd.NA


def build_indices(df: pd.DataFrame) -> dict:
    """构建多级索引. value = list[行号] (支持多命中检测)."""
    idx: dict = {
        # ---- 2025 ----
        "2025_six": defaultdict(list),           # 六键完整
        "2025_five_noatype": defaultdict(list),  # 去招生类型
        "2025_five_nogc": defaultdict(list),     # 去专业组(专科场景)
        "2025_four": defaultdict(list),          # 去招生类型+专业组
        # ---- 23-24 v5 (含老批次) ----
        "2324_ob_five": defaultdict(list),   # (cc,subj,老批次,atype,mc)
        "2324_ob_four": defaultdict(list),   # (cc,subj,老批次,mc)
        "2324_ob_name": defaultdict(list),   # (cc,subj,老批次,mname)
        # ---- 23-24 旧版 (不含老批次, 降级用) ----
        "2324_four": defaultdict(list),   # (cc,subj,atype,mc)
        "2324_three": defaultdict(list),  # (cc,subj,mc)
        "2324_name": defaultdict(list),   # (cc,subj,mname)
    }
    for i, row in df.iterrows():
        cc = norm_college_code(row["院校代码"])
        subj = norm_text(row["科目"])
        batch = norm_text(row["批次"])
        atype = norm_text(row["招生类型"])
        gc = norm_group_code(row["专业组代码"])
        mc = norm_major_code(row["专业代码"])
        mname = norm_text(row["专业"])
        old_batch = norm_text(row.get("老批次"))

        if cc is None or subj is None:
            continue

        # 2025 索引
        idx["2025_six"][(cc, subj, batch, atype, gc, mc)].append(i)
        idx["2025_five_noatype"][(cc, subj, batch, gc, mc)].append(i)
        idx["2025_five_nogc"][(cc, subj, batch, atype, mc)].append(i)
        idx["2025_four"][(cc, subj, batch, mc)].append(i)

        # 23-24 含老批次索引 (仅对有老批次的行构建)
        if old_batch:
            idx["2324_ob_five"][(cc, subj, old_batch, atype, mc)].append(i)
            idx["2324_ob_four"][(cc, subj, old_batch, mc)].append(i)
            if mname:
                idx["2324_ob_name"][(cc, subj, old_batch, mname)].append(i)

        # 23-24 不含老批次索引 (降级兜底)
        idx["2324_four"][(cc, subj, atype, mc)].append(i)
        idx["2324_three"][(cc, subj, mc)].append(i)
        if mname:
            idx["2324_name"][(cc, subj, mname)].append(i)

    return idx


# ==================== 匹配 ====================
def _collect_hits(index: dict, keys: list[tuple]) -> list[int]:
    """对多候选键 (如老批次列表×其它固定字段) 汇总命中行号, 去重."""
    hits: list[int] = []
    seen: set[int] = set()
    for k in keys:
        for r in index.get(k, []):
            if r not in seen:
                seen.add(r)
                hits.append(r)
    return hits


def match_row(
    year: int,
    cc: int | None, subj: str | None, batch: str | None, atype: str | None,
    gc: int | None, mc: str | None, mname: str | None,
    idx: dict,
    old_batch_candidates: list[str] | None = None,
) -> tuple[int | None, str]:
    """返回 (主表行号, 降级级别标记)."""
    if cc is None or subj is None or mc is None:
        return None, "KEY-INCOMPLETE"

    if year == 2025:
        # Level 1: 六键完整 (有专业组 + 有招生类型)
        key = (cc, subj, batch, atype, gc, mc)
        rows = idx["2025_six"].get(key, [])
        if len(rows) == 1:
            return rows[0], "EXACT"
        if len(rows) > 1:
            return None, "WARN-精确多命中"

        # Level 2: 去招生类型 (保留专业组)
        key2 = (cc, subj, batch, gc, mc)
        rows2 = idx["2025_five_noatype"].get(key2, [])
        if len(rows2) == 1:
            return rows2[0], "DOWNGRADE-去类型"
        if len(rows2) > 1:
            return None, "WARN-降级多命中"

        # Level 3: 去专业组 (专科常见, 专科文件无 专业组 字段)
        key3 = (cc, subj, batch, atype, mc)
        rows3 = idx["2025_five_nogc"].get(key3, [])
        if len(rows3) == 1:
            return rows3[0], "DOWNGRADE-去专业组"
        if len(rows3) > 1:
            return None, "WARN-去专业组多命中"

        # Level 4: 去招生类型 + 去专业组
        key4 = (cc, subj, batch, mc)
        rows4 = idx["2025_four"].get(key4, [])
        if len(rows4) == 1:
            return rows4[0], "DOWNGRADE-去类型+去专业组"
        if len(rows4) > 1:
            return None, "WARN-四键多命中"
        return None, "UNMATCHED"
    else:  # 2023, 2024 — v5: 引入老批次维度, 6 级降级
        obs = old_batch_candidates or []

        # Level 1: (cc, subj, 老批次, atype, mc) 含老批次的精确五键
        if obs:
            keys = [(cc, subj, ob, atype, mc) for ob in obs]
            hits = _collect_hits(idx["2324_ob_five"], keys)
            if len(hits) == 1:
                return hits[0], "EXACT-含老批次"
            if len(hits) > 1:
                # 进入下一级 (多命中不直接返回 WARN, 让更细级别尝试)
                pass

        # Level 2: (cc, subj, 老批次, mc) 去招生类型
        if obs:
            keys = [(cc, subj, ob, mc) for ob in obs]
            hits = _collect_hits(idx["2324_ob_four"], keys)
            if len(hits) == 1:
                return hits[0], "DOWNGRADE-含老批次去类型"
            if len(hits) > 1:
                pass  # 继续下级

        # Level 3: (cc, subj, atype, mc) 不含老批次的精确 (回退到 v4 旧逻辑)
        key = (cc, subj, atype, mc)
        rows = idx["2324_four"].get(key, [])
        if len(rows) == 1:
            return rows[0], "DOWNGRADE-去老批次"
        if len(rows) > 1:
            return None, "WARN-精确多命中"

        # Level 4: (cc, subj, mc) 去招生类型+去老批次
        key2 = (cc, subj, mc)
        rows2 = idx["2324_three"].get(key2, [])
        if len(rows2) == 1:
            return rows2[0], "DOWNGRADE-去类型+去老批次"
        if len(rows2) > 1:
            return None, "WARN-去类型多命中"

        # Level 5: (cc, subj, 老批次, mname) 专业名称+老批次替代
        if mname and obs:
            keys = [(cc, subj, ob, mname) for ob in obs]
            hits = _collect_hits(idx["2324_ob_name"], keys)
            if len(hits) == 1:
                return hits[0], "DOWNGRADE-名称+老批次"
            if len(hits) > 1:
                return None, "WARN-名称多命中"

        # Level 6: (cc, subj, mname) 最后兜底
        if mname:
            key3 = (cc, subj, mname)
            rows3 = idx["2324_name"].get(key3, [])
            if len(rows3) == 1:
                return rows3[0], "DOWNGRADE-名称替代"
            if len(rows3) > 1:
                return None, "WARN-名称多命中"
        return None, "UNMATCHED"


# ==================== 附带字段校验 ====================
def check_side_fields(
    master_row: pd.Series, supp_row: dict, logs: Logs, source: dict,
) -> None:
    """比对主表与征集的共有字段, 不一致入 logs.validation."""
    checks = [
        ("院校名称", "院校名称"),
        ("专业", "专业名称"),
    ]
    for mcol, scol in checks:
        mv = norm_text(master_row.get(mcol))
        sv = norm_text(supp_row.get(scol))
        if mv and sv and mv != sv:
            logs.validation.append({
                **source,
                "level": "INFO",
                "category": "字段不一致",
                "字段": mcol,
                "主表值": mv,
                "征集值": sv,
            })


# ==================== 文件处理 ====================
def process_file(fp: Path, df: pd.DataFrame, idx: dict, logs: Logs) -> dict:
    """处理单个征集文件, 返回统计."""
    info = parse_filename(fp.name)
    stats = {"file": fp.name, "total": 0, "written": 0, "unmatched": 0, "row_errors": 0, "duplicate": 0}

    year = info.get("year")
    if year not in (2023, 2024, 2025):
        return stats

    try:
        sdf = pd.read_excel(fp, engine="openpyxl", dtype=str)
    except Exception as e:
        logs.row_errors.append({"源文件": fp.name, "源行号": -1,
                                "错误": f"读取失败: {e}"})
        return stats

    stats["total"] = len(sdf)

    for ridx, row in sdf.iterrows():
        source = {"源文件": fp.name, "源行号": int(ridx) + 2}  # +2 因为 xlsx 第1行是表头

        # 归一化
        cc = norm_college_code(row.get("院校代码"))
        kelei = norm_text(row.get("科类"))
        supp_type_raw = norm_text(row.get("招生类型"))
        gc = norm_group_code(row.get("专业组代码"))
        mc = norm_major_code(row.get("专业代码"))
        mname = norm_text(row.get("专业名称"))
        plan_raw = norm_text(row.get("专业计划数"))

        # 科目映射
        subj, subj_err = map_subject(kelei)
        if subj_err:
            logs.row_errors.append({**source, "错误": subj_err, "科类": kelei})
            stats["row_errors"] += 1
            continue

        # 计划数校验
        try:
            plan = int(float(plan_raw)) if plan_raw else None
        except ValueError:
            plan = None
        if plan is None or plan <= 0:
            logs.row_errors.append({**source, "错误": f"计划数无效: {plan_raw}",
                                    "科类": kelei, "专业代码": mc})
            stats["row_errors"] += 1
            continue

        # 确定主表批次+招生类型
        if year == 2025:
            m_batch, m_type, type_err = map_2025_type(supp_type_raw, fp.name)
            if type_err:
                logs.row_errors.append({**source, "错误": type_err,
                                        "招生类型": supp_type_raw})
                stats["row_errors"] += 1
                continue
        else:  # 23-24
            m_batch = None  # 23-24 不用主表批次做匹配
            m_type, _ = map_2324_type(supp_type_raw, fp.name)

        # 23-24 额外计算老批次候选 (v5)
        old_batch_candidates: list[str] | None = None
        if year in (2023, 2024):
            old_batch_candidates = map_2324_old_batch(fp.name, supp_type_raw)

        # 确定轮次
        rnum, round_note = determine_round(info, m_batch)
        if rnum is None:
            logs.row_errors.append({**source, "错误": f"轮次无法判定: {round_note}"})
            stats["row_errors"] += 1
            continue

        # 匹配
        hit_idx, match_level = match_row(
            year, cc, subj, m_batch, m_type, gc, mc, mname, idx,
            old_batch_candidates=old_batch_candidates,
        )

        if hit_idx is None:
            logs.unmatched.append({
                **source,
                "year": year, "轮次": rnum,
                "院校代码": cc, "科目": subj, "批次": m_batch,
                "招生类型": m_type, "专业组代码": gc, "专业代码": mc,
                "专业名称": mname, "计划数": plan,
                "失败原因": match_level,
                "round_note": round_note,
            })
            stats["unmatched"] += 1
            continue

        # 写入
        target_col = f"{str(year)[2:]}征集第{rnum}次计划"
        if target_col not in SUPP_COLS:
            logs.row_errors.append({**source, "错误": f"列不存在: {target_col}"})
            stats["row_errors"] += 1
            continue

        # 追踪重复
        track_key = (hit_idx, year, rnum)
        existing = [w for w in logs.written if (w["行号"], w["year"], w["轮次"]) == track_key]
        if existing:
            logs.validation.append({
                **source,
                "level": "ERROR",
                "category": "重复写入",
                "主表行号": hit_idx,
                "列": target_col,
                "现值": df.at[hit_idx, target_col],
                "新值": plan,
                "首次来源": existing[0]["源文件"] + f"#{existing[0]['源行号']}",
            })
            stats["duplicate"] += 1
            continue

        df.at[hit_idx, target_col] = plan
        logs.written.append({
            "行号": hit_idx, "year": year, "轮次": rnum,
            "源文件": fp.name, "源行号": int(ridx) + 2,
            "计划数": plan, "match_level": match_level,
            "round_note": round_note,
        })
        stats["written"] += 1

        # 附带字段校验
        check_side_fields(df.iloc[hit_idx], row.to_dict(), logs, source)

    return stats


# ==================== 一致性校验 (7.1-7.4) ====================
def run_consistency_checks(df: pd.DataFrame, logs: Logs) -> None:
    """执行 7.1-7.4."""
    for i, row in df.iterrows():
        for year_prefix, year_full, max_r in [("23", 2023, 4), ("24", 2024, 4), ("25", 2025, 3)]:
            vals = [row.get(f"{year_prefix}征集第{r}次计划") for r in range(1, max_r + 1)]

            # 7.1 轮次递进
            for r in range(2, max_r + 1):
                if pd.notna(vals[r - 1]):
                    for prev in range(1, r):
                        if pd.isna(vals[prev - 1]):
                            logs.validation.append({
                                "level": "INFO",
                                "category": "轮次断档",
                                "主表行号": i,
                                "year": year_full,
                                "提示": f"第{r}次有值但第{prev}次缺失",
                            })

            # 7.2 逐轮递减
            for r in range(2, max_r + 1):
                if pd.notna(vals[r - 1]) and pd.notna(vals[r - 2]):
                    try:
                        if float(vals[r - 1]) > float(vals[r - 2]):
                            logs.validation.append({
                                "level": "INFO",
                                "category": "计划数递增",
                                "主表行号": i,
                                "year": year_full,
                                "第N-1次": vals[r - 2],
                                "第N次": vals[r - 1],
                                "N": r,
                            })
                    except (ValueError, TypeError):
                        pass

            # 7.3 征集 ≤ 对应年份计划人数
            plan_col = PLAN_COL_BY_YEAR.get(year_full)
            if plan_col and plan_col in df.columns:
                year_plan = row.get(plan_col)
                if pd.notna(year_plan):
                    try:
                        year_plan = float(year_plan)
                        for r in range(1, max_r + 1):
                            if pd.notna(vals[r - 1]):
                                if float(vals[r - 1]) > year_plan:
                                    logs.validation.append({
                                        "level": "INFO",
                                        "category": "征集超计划",
                                        "主表行号": i,
                                        "year": year_full,
                                        "轮次": r,
                                        "征集计划": vals[r - 1],
                                        "年度计划": year_plan,
                                    })
                    except (ValueError, TypeError):
                        pass


# ==================== 抽样核对 ====================
def build_sampling(logs: Logs, df: pd.DataFrame, n: int = 30) -> pd.DataFrame:
    """随机抽 n 条已写入记录, 生成核对表."""
    if not logs.written:
        return pd.DataFrame()
    random.seed(42)
    sample = random.sample(logs.written, min(n, len(logs.written)))
    rows = []
    for w in sample:
        i = w["行号"]
        rows.append({
            "主表行号": i,
            "源文件": w["源文件"],
            "源行号": w["源行号"],
            "year": w["year"],
            "轮次": w["轮次"],
            "写入计划数": w["计划数"],
            "match_level": w["match_level"],
            "主表院校代码": df.at[i, "院校代码"],
            "主表院校名称": df.at[i, "院校名称"],
            "主表专业": df.at[i, "专业"],
            "主表批次": df.at[i, "批次"],
            "主表招生类型": df.at[i, "招生类型"],
            "主表科目": df.at[i, "科目"],
            "主表专业组代码": df.at[i, "专业组代码"],
            "主表专业代码": df.at[i, "专业代码"],
            "核对结果": "",
        })
    return pd.DataFrame(rows)


# ==================== 输出 ====================
def write_outputs(df: pd.DataFrame, logs: Logs) -> dict:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_master = OUT_DIR / f"专业招生主表_含征集_{ts}.xlsx"
    print(f"[P5-C] 保存主表 → {out_master} ...")
    df.to_excel(out_master, index=False, engine="openpyxl")

    out_val = OUT_DIR / "征集合并校验日志.xlsx"
    pd.DataFrame(logs.validation).to_excel(out_val, index=False, engine="openpyxl")

    out_unm = OUT_DIR / "征集未匹配记录.xlsx"
    pd.DataFrame(logs.unmatched).to_excel(out_unm, index=False, engine="openpyxl")

    out_err = OUT_DIR / "征集行异常.xlsx"
    pd.DataFrame(logs.row_errors).to_excel(out_err, index=False, engine="openpyxl")

    sampling_df = build_sampling(logs, df)
    out_sample = OUT_DIR / "征集抽样核对.xlsx"
    sampling_df.to_excel(out_sample, index=False, engine="openpyxl")

    return {
        "master": str(out_master),
        "validation": str(out_val),
        "unmatched": str(out_unm),
        "row_errors": str(out_err),
        "sampling": str(out_sample),
        "ts": ts,
    }


# ==================== 主流程 ====================
def main() -> None:
    print("=" * 70)
    print("P5 征集志愿合并 - 阶段 B/C")
    print("=" * 70)

    # 1. 加载主表
    df = load_master()

    # 2. 清空/创建 11 个征集列 (幂等)
    ensure_supp_cols(df)

    # 3. 构建索引
    print("[P5-B] 构建主表索引...")
    idx = build_indices(df)
    for k in idx:
        idx[k] = dict(idx[k])  # 锁定
    print(f"       2025六键索引: {len(idx['2025_six'])} 个键")
    print(f"       23-24四键索引: {len(idx['2324_four'])} 个键")

    # 4. 扫描并处理
    logs = Logs()
    files = sorted(SUPP_DIR.rglob("*_已校验.xlsx"))
    print(f"[P5-B] 处理 {len(files)} 个征集文件...")
    file_stats = []
    for fp in files:
        s = process_file(fp, df, idx, logs)
        file_stats.append(s)
    total_rows = sum(s["total"] for s in file_stats)
    total_written = sum(s["written"] for s in file_stats)
    total_unmatched = sum(s["unmatched"] for s in file_stats)
    total_errors = sum(s["row_errors"] for s in file_stats)
    total_dup = sum(s["duplicate"] for s in file_stats)
    print(f"       征集总行数: {total_rows}")
    print(f"       已写入: {total_written}")
    print(f"       未匹配: {total_unmatched}")
    print(f"       行错误: {total_errors}")
    print(f"       重复写入: {total_dup}")

    # 5. 一致性校验
    print("[P5-C] 执行一致性校验 (7.1-7.4)...")
    run_consistency_checks(df, logs)
    print(f"       校验日志条数: {len(logs.validation)}")

    # 6. 输出
    print("[P5-C] 输出结果...")
    out_paths = write_outputs(df, logs)

    # 7. 总结
    summary_path = OUT_DIR / "p5_summary.txt"
    unmatched_rate = total_unmatched / max(total_rows, 1) * 100
    with summary_path.open("w", encoding="utf-8") as f:
        f.write(f"P5 执行时间戳: {out_paths['ts']}\n")
        f.write(f"\n=== 总览 ===\n")
        f.write(f"文件数: {len(files)}\n")
        f.write(f"征集总行数: {total_rows}\n")
        f.write(f"已写入: {total_written} ({total_written / max(total_rows, 1) * 100:.1f}%)\n")
        f.write(f"未匹配: {total_unmatched} ({unmatched_rate:.1f}%)\n")
        f.write(f"行错误: {total_errors}\n")
        f.write(f"重复写入: {total_dup}\n")
        f.write(f"\n=== 未匹配失败原因分布 ===\n")
        reason_counter = defaultdict(int)
        for u in logs.unmatched:
            reason_counter[u["失败原因"]] += 1
        for reason, cnt in sorted(reason_counter.items(), key=lambda x: -x[1]):
            f.write(f"  {reason}: {cnt}\n")
        f.write(f"\n=== 一致性校验违反分布 ===\n")
        vio_counter = defaultdict(int)
        for v in logs.validation:
            vio_counter[f"{v.get('level', '')}-{v.get('category', '')}"] += 1
        for cat, cnt in sorted(vio_counter.items(), key=lambda x: -x[1]):
            f.write(f"  {cat}: {cnt}\n")
        f.write(f"\n=== 输出文件 ===\n")
        for k, p in out_paths.items():
            f.write(f"  {k}: {p}\n")
        f.write(f"\n=== 每文件统计 (前20) ===\n")
        for s in file_stats[:20]:
            f.write(f"  {s['file']}\n")
            f.write(f"    total={s['total']}, written={s['written']}, "
                    f"unmatched={s['unmatched']}, errors={s['row_errors']}, "
                    f"dup={s['duplicate']}\n")
    print(f"       → {summary_path}")

    # 预警
    if unmatched_rate > 5:
        print(f"\n!! 警告: 未匹配率 {unmatched_rate:.1f}% > 5%, 请检查 {out_paths['unmatched']}")
    if total_dup > 0:
        print(f"\n!! 警告: 重复写入 {total_dup} 次, 请检查 {out_paths['validation']}")
    print("\n[P5] 完成.")


if __name__ == "__main__":
    main()
