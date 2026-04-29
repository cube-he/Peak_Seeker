# -*- coding: utf-8 -*-
"""按 data/03_专家版主表/output/2025年批次结构.xlsx 规范化主表的 (录取批次, 招生类型) 值.

依据: 2026-04-24 用户指示 "所有都以这个为准进行修改".

规范化规则 (6 类中只改前 5 类; 第 6 类合并值 "公安类、司法类" 保留, 因拆分需源数据依据):
  (录取批次, 招生类型) 旧值 -> 新值
  (专科批, 普通类高职(专科))              -> (高职(专科)批, 普通类高职(专科))        16639 行
  (专科提前批, *)                         -> (高职(专科)提前批, *)                    289 行
  (本科批(预科), 省属高校少数民族预科)    -> (本科批(省属高校少数民族预科), 省属高校少数民族预科)  104 行
  (本科批A段(国家专项), 国家专项计划)    -> (本科批A段, 国家专项计划)                1353 行
  (本科批A段(地方专项), 地方专项计划)    -> (本科批A段, 地方专项计划)                 372 行

输入/输出: data/03_专家版主表/output/专业招生主表.xlsx (原地改写)
备份: data/03_专家版主表/output/专业招生主表_normalize_bak_{ts}.xlsx
校验: 前后 sha256、行数、(批次,类型) 枚举变动统计
"""
from __future__ import annotations

import hashlib
import shutil
from datetime import datetime
from pathlib import Path

import pandas as pd

MASTER = Path("data/03_专家版主表/output/专业招生主表.xlsx")

# (批次旧, 类型旧, 批次新, 类型新) -- 类型旧=None 表示所有类型都按新批次替换, 类型不变
RULES = [
    ("专科批", "普通类高职(专科)", "高职(专科)批", "普通类高职(专科)"),
    ("专科提前批", None, "高职(专科)提前批", None),
    ("本科批(预科)", "省属高校少数民族预科", "本科批(省属高校少数民族预科)", "省属高校少数民族预科"),
    ("本科批A段(国家专项)", "国家专项计划", "本科批A段", "国家专项计划"),
    ("本科批A段(地方专项)", "地方专项计划", "本科批A段", "地方专项计划"),
]


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> None:
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    bak = MASTER.with_name(f"专业招生主表_normalize_bak_{ts}.xlsx")

    print(f"[1/5] 读取主表: {MASTER}")
    pre_sha = sha256(MASTER)
    print(f"       sha256 (before): {pre_sha}")

    df = pd.read_excel(MASTER)
    print(f"       shape: {df.shape}")

    bcol, tcol = "录取批次", "招生类型"
    assert bcol in df.columns and tcol in df.columns, f"缺列: {bcol} / {tcol}"

    print(f"[2/5] 备份原表 -> {bak}")
    shutil.copy2(MASTER, bak)

    print(f"[3/5] 应用规范化规则:")
    total = 0
    for old_b, old_t, new_b, new_t in RULES:
        if old_t is None:
            mask = df[bcol] == old_b
            n = int(mask.sum())
            df.loc[mask, bcol] = new_b
            print(f"       (批次) {old_b} -> {new_b}  影响 {n} 行")
        else:
            mask = (df[bcol] == old_b) & (df[tcol] == old_t)
            n = int(mask.sum())
            df.loc[mask, bcol] = new_b
            df.loc[mask, tcol] = new_t
            print(f"       ({old_b}, {old_t}) -> ({new_b}, {new_t})  影响 {n} 行")
        total += n
    print(f"       合计影响: {total} 行")

    print(f"[4/5] 写回主表")
    df.to_excel(MASTER, index=False)

    post_sha = sha256(MASTER)
    print(f"       sha256 (after) : {post_sha}")

    print(f"[5/5] 验证")
    df2 = pd.read_excel(MASTER)
    assert df2.shape == df.shape, f"行列数变化: {df.shape} -> {df2.shape}"

    # 校验: 5 条旧值不应再存在
    residual = []
    for old_b, old_t, _, _ in RULES:
        if old_t is None:
            n = int((df2[bcol] == old_b).sum())
        else:
            n = int(((df2[bcol] == old_b) & (df2[tcol] == old_t)).sum())
        if n:
            residual.append((old_b, old_t, n))
    if residual:
        print("       ERROR: 规范化不完整:")
        for r in residual:
            print(f"         {r}")
        raise SystemExit(1)
    print(f"       OK: 规范化完整, 所有 {len(RULES)} 条旧值已清零")

    # 最终 (批次, 类型) 分布
    print("\n规范化后 (录取批次, 招生类型) 唯一组合数: "
          f"{df2[[bcol, tcol]].drop_duplicates().shape[0]}")


if __name__ == "__main__":
    main()
