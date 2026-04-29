# -*- coding: utf-8 -*-
"""
P5 阶段 A — 征集志愿合并预处理

目标：
  1. 扫描 78 个已校验征集 xlsx 文件，从文件名解析 (年份, 轮次, 批次原文, 科类)
  2. 读取每个 xlsx，统计内部的科类、招生类型实际枚举值
  3. 读取主表，提取批次/科目/招生类型枚举（供对比用）
  4. 输出枚举交叉对比报告，暴露映射缺口

不修改主表。此阶段仅产出报告。

输入：
  - data/13_征集志愿/**/*_已校验.xlsx                (78 个征集文件)
  - data/03_专家版主表/output/专业招生主表.xlsx      (主表)

产出：
  - scripts/data_integration/_p5_out/征集映射枚举对比.txt
  - scripts/data_integration/_p5_out/征集文件清单.xlsx
"""
from __future__ import annotations

import re
from collections import Counter, defaultdict
from pathlib import Path

import pandas as pd

SUPP_DIR = Path("data/13_征集志愿")
MASTER = Path("data/03_专家版主表/output/专业招生主表.xlsx")
OUT_DIR = Path("scripts/data_integration/_p5_out")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 中文数字 → int（轮次解析用）
CN_NUM = {
    "一": 1, "二": 2, "三": 3, "四": 4, "五": 5,
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5,
}


def parse_rounds(text: str) -> list[int]:
    """从"第N次""第三次和第二次""A段地方专项第二次+B段第一次"等文本提取轮次数字.

    返回所有出现的轮次号，去重排序。
    """
    # 匹配 "第X次" 其中 X 是中文或阿拉伯数字
    rounds = []
    for m in re.finditer(r"第([一二三四五12345])次", text):
        ch = m.group(1)
        if ch in CN_NUM:
            rounds.append(CN_NUM[ch])
    return sorted(set(rounds))


def parse_filename(fname: str) -> dict:
    """解析文件名. 文件名格式见方案 §三.

    返回 dict: {id, year, 科类_raw, 批次原文, 轮次_列表, 原始文件名}
    """
    base = fname.replace("_已校验.xlsx", "")
    parts = base.split("_")

    result = {
        "原始文件名": fname,
        "id": parts[0] if parts else "",
        "year": "",
        "科类_raw": "",
        "批次原文": "",
        "轮次_列表": [],
        "解析状态": "",
    }

    # 第二位应该是年份
    if len(parts) >= 2 and parts[1].isdigit() and len(parts[1]) == 4:
        result["year"] = int(parts[1])
    else:
        result["解析状态"] = "ERROR-年份缺失"
        return result

    # 第三位是科类
    if len(parts) >= 3:
        result["科类_raw"] = parts[2]

    # 找 "征集志愿" 的位置
    try:
        zj_idx = parts.index("征集志愿")
    except ValueError:
        result["解析状态"] = "ERROR-未找到征集志愿标记"
        return result

    # 批次原文: parts[3:zj_idx] 拼接
    batch_parts = parts[3:zj_idx]
    result["批次原文"] = "_".join(batch_parts)

    # 轮次: 从 批次原文 + parts[zj_idx+1:] 合并文本中提取
    after_zj = "_".join(parts[zj_idx + 1:])
    all_text = result["批次原文"] + "_" + after_zj
    result["轮次_列表"] = parse_rounds(all_text)

    if not result["轮次_列表"]:
        result["解析状态"] = "WARN-轮次未识别"
    else:
        result["解析状态"] = "OK"

    return result


def scan_files() -> pd.DataFrame:
    """扫描所有已校验文件, 返回解析结果 DataFrame."""
    files = sorted(SUPP_DIR.rglob("*_已校验.xlsx"))
    rows = []
    for fp in files:
        info = parse_filename(fp.name)
        info["路径"] = str(fp)
        rows.append(info)
    return pd.DataFrame(rows)


def read_supp_xlsx_columns(fp: Path) -> dict:
    """读取一个征集 xlsx, 返回 {列名: 非空unique值集合(截断到50)}.

    目前只关心"科类"和"招生类型"字段（若存在）.
    """
    try:
        df = pd.read_excel(fp, engine="openpyxl", dtype=str)
    except Exception as e:
        return {"ERROR": f"读取失败: {e}"}

    out = {}
    for col in ("科类", "招生类型"):
        if col in df.columns:
            vals = df[col].dropna().astype(str).str.strip()
            vals = vals[vals != ""]
            uniq = sorted(vals.unique().tolist())
            out[col] = uniq
        else:
            out[col] = None  # 该文件没有此列
    return out


def collect_supp_enums(files_df: pd.DataFrame) -> tuple[Counter, Counter, dict]:
    """遍历所有文件, 汇总 科类 和 招生类型 的出现频次.

    返回: (科类Counter, 招生类型Counter, 文件级无招生类型的统计)
    """
    kelei_counter = Counter()
    type_counter = Counter()
    files_without_type = []

    for _, row in files_df.iterrows():
        fp = Path(row["路径"])
        cols = read_supp_xlsx_columns(fp)

        if "ERROR" in cols:
            continue

        if cols["科类"]:
            for v in cols["科类"]:
                kelei_counter[v] += 1

        if cols["招生类型"] is None:
            files_without_type.append(row["原始文件名"])
        elif cols["招生类型"]:
            for v in cols["招生类型"]:
                type_counter[v] += 1

    return kelei_counter, type_counter, files_without_type


def load_master_enums() -> dict:
    """加载主表, 返回各枚举列的 {值: 行数}."""
    df = pd.read_excel(MASTER, engine="openpyxl")
    out = {}
    for col in ("批次", "科目", "招生类型"):
        out[col] = Counter(df[col].dropna().astype(str).tolist())
    return out


def build_report(files_df: pd.DataFrame, supp_kelei: Counter,
                 supp_type: Counter, files_no_type: list,
                 master_enums: dict) -> str:
    """构建文本报告."""
    lines = []
    lines.append("=" * 80)
    lines.append("P5 征集志愿合并 - 阶段A 预处理报告")
    lines.append("=" * 80)
    lines.append("")

    # === 1. 文件解析概况 ===
    lines.append("## 1. 文件解析概况")
    lines.append("-" * 80)
    lines.append(f"总文件数: {len(files_df)}")
    status_counts = files_df["解析状态"].value_counts().to_dict()
    for s, c in status_counts.items():
        lines.append(f"  {s}: {c}")
    lines.append("")

    # 解析异常的文件
    bad = files_df[files_df["解析状态"] != "OK"]
    if len(bad) > 0:
        lines.append("### 解析异常文件:")
        for _, r in bad.iterrows():
            lines.append(f"  [{r['解析状态']}] {r['原始文件名']}")
        lines.append("")

    # === 2. 轮次分布 ===
    lines.append("## 2. 年份 × 轮次分布")
    lines.append("-" * 80)
    round_matrix = defaultdict(lambda: defaultdict(int))
    max_round_per_year = defaultdict(int)
    for _, r in files_df.iterrows():
        if r["解析状态"] == "OK":
            for rd in r["轮次_列表"]:
                round_matrix[r["year"]][rd] += 1
                max_round_per_year[r["year"]] = max(max_round_per_year[r["year"]], rd)

    years = sorted(round_matrix.keys())
    all_rounds = sorted({rd for y in years for rd in round_matrix[y].keys()})
    header = "年份   " + "  ".join(f"第{r}次" for r in all_rounds) + "   最大轮次"
    lines.append(header)
    for y in years:
        row = f"{y}  "
        for rd in all_rounds:
            row += f"  {round_matrix[y].get(rd, 0):3d} "
        row += f"    第{max_round_per_year[y]}次"
        lines.append(row)
    lines.append("")
    lines.append("方案设计的轮次列: 23/24 年各 4 轮, 25 年 3 轮")
    lines.append("若实际最大轮次超过上述设计, 需扩展征集列!")
    lines.append("")

    # === 3. 科类枚举对比 ===
    lines.append("## 3. 科类 (征集文件) → 科目 (主表) 映射")
    lines.append("-" * 80)
    lines.append("征集文件中出现的科类值 (从 xlsx 内部 '科类' 列统计):")
    for v, c in sorted(supp_kelei.items(), key=lambda x: -x[1]):
        lines.append(f"  {v:20s} 出现 {c} 次(行数累计)")
    lines.append("")
    lines.append("主表中的科目值:")
    for v, c in sorted(master_enums["科目"].items(), key=lambda x: -x[1]):
        lines.append(f"  {v:20s} {c} 行")
    lines.append("")
    lines.append("建议映射 (已在方案 §5.1):")
    lines.append("  文科 / 历史类 → 历史")
    lines.append("  理科 / 物理类 → 物理")
    lines.append("  其他值需人工确认")
    lines.append("")

    # === 4. 批次枚举对比 ===
    lines.append("## 4. 批次 (征集文件名解析) → 批次 (主表) 映射")
    lines.append("-" * 80)
    lines.append("征集文件名中出现的批次原文:")
    batch_counter = Counter()
    batch_year_map = defaultdict(set)  # 批次 → {年份集合}
    for _, r in files_df.iterrows():
        if r["解析状态"] == "OK":
            batch_counter[r["批次原文"]] += 1
            batch_year_map[r["批次原文"]].add(r["year"])

    for v, c in sorted(batch_counter.items()):
        years_str = ",".join(str(y) for y in sorted(batch_year_map[v]))
        lines.append(f"  [{years_str}] {v:45s} ({c} 个文件)")
    lines.append("")
    lines.append("主表中的批次值 (均为 2025 新高考):")
    for v, c in sorted(master_enums["批次"].items(), key=lambda x: -x[1]):
        lines.append(f"  {v:45s} {c} 行")
    lines.append("")
    lines.append("!! 关键问题: 2023-2024 征集是旧高考批次(本科一/二批/专科批),")
    lines.append("   但主表只有 2025 新高考批次(本科批A/B段等).")
    lines.append("   23/24 年征集数据无法直接用'批次'做匹配键!")
    lines.append("   需调整方案: 23/24 改用 (院校代码+科目+招生类型+专业代码),")
    lines.append("   并加前置过滤 '23/24计划人数 非空'.")
    lines.append("")

    # === 5. 招生类型枚举对比 ===
    lines.append("## 5. 招生类型 (征集 xlsx 字段) → 招生类型 (主表) 映射")
    lines.append("-" * 80)
    lines.append(f"有 {len(files_no_type)} 个文件 xlsx 中无'招生类型'列 (A1/A2 格式)")
    if len(files_no_type) <= 20:
        for f in files_no_type:
            lines.append(f"  - {f}")
    else:
        for f in files_no_type[:10]:
            lines.append(f"  - {f}")
        lines.append(f"  ... 共 {len(files_no_type)} 个")
    lines.append("")
    lines.append("征集 xlsx 中出现的招生类型值 (仅含此列的文件):")
    for v, c in sorted(supp_type.items(), key=lambda x: -x[1]):
        lines.append(f"  {v:30s} 出现 {c} 次")
    lines.append("")
    lines.append("主表中的招生类型值 (全部 42 种):")
    for v, c in sorted(master_enums["招生类型"].items(), key=lambda x: -x[1]):
        lines.append(f"  {v:30s} {c} 行")
    lines.append("")

    # 差集分析
    supp_only = set(supp_type.keys()) - set(master_enums["招生类型"].keys())
    master_only = set(master_enums["招生类型"].keys()) - set(supp_type.keys())
    both = set(supp_type.keys()) & set(master_enums["招生类型"].keys())

    lines.append("### 5.1 招生类型差集")
    lines.append(f"  两侧都有 (可直接匹配): {len(both)} 种")
    for v in sorted(both):
        lines.append(f"    ✓ {v}")
    lines.append(f"  仅征集有 (主表无对应, 需映射): {len(supp_only)} 种")
    for v in sorted(supp_only):
        lines.append(f"    ! {v}")
    lines.append(f"  仅主表有 (征集中不出现, 无需处理): {len(master_only)} 种")
    lines.append("")

    # === 6. 下一步 ===
    lines.append("## 6. 下一步建议")
    lines.append("-" * 80)
    lines.append("1. 基于上述枚举对比, 人工/自动补全批次和招生类型映射表")
    lines.append("2. 调整方案: 23/24 年批次维度的处理方案")
    lines.append("3. 编写阶段 B 脚本 (p5_merge_supplementary.py), 执行完整合并")
    lines.append("")

    return "\n".join(lines)


def main() -> None:
    print("[P5-A] 扫描征集文件...")
    files_df = scan_files()
    print(f"       共 {len(files_df)} 个文件")

    print("[P5-A] 读取每个 xlsx 的内部字段 (科类/招生类型)...")
    supp_kelei, supp_type, files_no_type = collect_supp_enums(files_df)
    print(f"       科类种类: {len(supp_kelei)}, 招生类型种类: {len(supp_type)}, "
          f"无招生类型列文件: {len(files_no_type)}")

    print("[P5-A] 加载主表并提取枚举...")
    master_enums = load_master_enums()
    print(f"       批次: {len(master_enums['批次'])}, "
          f"科目: {len(master_enums['科目'])}, "
          f"招生类型: {len(master_enums['招生类型'])}")

    print("[P5-A] 生成报告...")
    report = build_report(files_df, supp_kelei, supp_type, files_no_type, master_enums)

    report_path = OUT_DIR / "征集映射枚举对比.txt"
    report_path.write_text(report, encoding="utf-8")
    print(f"       → {report_path}")

    # 文件清单也存 xlsx 方便看
    manifest_path = OUT_DIR / "征集文件清单.xlsx"
    files_df_out = files_df.copy()
    files_df_out["轮次_列表"] = files_df_out["轮次_列表"].apply(
        lambda x: ",".join(str(i) for i in x) if x else ""
    )
    files_df_out.to_excel(manifest_path, index=False)
    print(f"       → {manifest_path}")

    print("[P5-A] 完成.")


if __name__ == "__main__":
    main()
