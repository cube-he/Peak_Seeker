# -*- coding: utf-8 -*-
"""Phase D: 从合并后主表中随机抽 100 条写入, 按 5 批分发给子 Agent 核对.

方案 A 策略:
  - 主表 = `_p5_out/专业招生主表_含征集_20260424_222200.xlsx`
  - 写入成功 = 任一 `{23,24,25}年征集{1..4}次计划` 列非空
  - 按年抽样 (23:17 / 24:33 / 25:50), 合计 100, 覆盖 3 年份
  - 每条样本含: 院校代码+院校, 科目, 录取批次, 招生类型, 专业组代码, 专业代码, 专业, 计划数, 征集*计划列, 征集源文件

待审清单导出 (Phase E):
  review_重复写入.xlsx         (107 ERROR)
  review_名称多命中.xlsx       (WARN-名称多命中)
  review_去类型多命中.xlsx     (WARN-去类型多命中)

输出目录: `scripts/data_integration/_p5_out/phase_d/`
"""
from __future__ import annotations

import random
from pathlib import Path

import pandas as pd

P5 = Path("scripts/data_integration/_p5_out")
MERGED = P5 / "专业招生主表_含征集_20260424_225205.xlsx"
LOG = P5 / "征集合并校验日志.xlsx"
OUT = P5 / "phase_d"
OUT.mkdir(parents=True, exist_ok=True)

RANDOM_SEED = 20260424
BATCH_COUNT = 5

# 按年配额: 23 年 1787+568+176+8=2539, 24 年 2719+435+79+32=3265, 25 年 6385+4595+1449=12429
# 比例 14% / 18% / 68%, 放宽到 20/30/50 便于审核覆盖
QUOTA = {"23": 20, "24": 30, "25": 50}


def collect_writes(df: pd.DataFrame) -> pd.DataFrame:
    """按年份收集写入行, 标注年份 + 对应征集列."""
    frames = []
    for year in ["23", "24", "25"]:
        cols = [f"{year}征集第{k}次计划" for k in (1, 2, 3, 4) if f"{year}征集第{k}次计划" in df.columns]
        if not cols:
            continue
        mask = df[cols].notna().any(axis=1)
        sub = df[mask].copy()
        sub["_year"] = "20" + year
        sub["_zj_cols"] = sub[cols].apply(
            lambda r: "; ".join(f"{c}={r[c]}" for c in cols if pd.notna(r[c])),
            axis=1,
        )
        frames.append(sub)
    return pd.concat(frames, ignore_index=True)


KEEP_COLS = [
    "_year", "院校代码", "院校", "科目", "录取批次", "招生类型", "老批次",
    "专业组代码", "专业代码", "专业", "计划数", "_zj_cols",
]


def main() -> None:
    print(f"[1/4] 读取合并后主表: {MERGED}")
    df = pd.read_excel(MERGED)
    print(f"       shape: {df.shape}")

    print(f"[2/4] 收集写入行")
    writes = collect_writes(df)
    keep = [c for c in KEEP_COLS if c in writes.columns]
    writes = writes[keep]
    print(f"       总写入: {len(writes)}")
    print(f"       按年: {writes['_year'].value_counts().to_dict()}")

    print(f"[3/4] 按年配额抽样")
    random.seed(RANDOM_SEED)
    samples = []
    for year_short, n in QUOTA.items():
        year_long = "20" + year_short
        pool = writes[writes["_year"] == year_long]
        if len(pool) <= n:
            pick = pool
        else:
            idx = random.sample(range(len(pool)), n)
            pick = pool.iloc[idx]
        samples.append(pick)
        print(f"       {year_long}: 池 {len(pool)} -> 抽 {len(pick)}")
    sampled = pd.concat(samples, ignore_index=True).sample(frac=1, random_state=RANDOM_SEED).reset_index(drop=True)
    sampled.to_excel(OUT / "samples_100.xlsx", index=False)
    print(f"       合计抽样: {len(sampled)}")

    print(f"[4/4] 分 {BATCH_COUNT} 批")
    n = len(sampled)
    size = n // BATCH_COUNT
    for i in range(BATCH_COUNT):
        s = i * size
        e = s + size if i < BATCH_COUNT - 1 else n
        batch = sampled.iloc[s:e]
        out_p = OUT / f"samples_batch_{i+1}.xlsx"
        batch.to_excel(out_p, index=False)
        print(f"       batch {i+1}: {len(batch)} 条 -> {out_p.name}")

    # 同时导出 Phase E 待审清单
    print(f"\n[Phase E 清单] 读取 log")
    logdf = pd.read_excel(LOG)
    dup_err = logdf[(logdf["level"] == "ERROR") & (logdf["category"].str.contains("重复写入", na=False))]
    dup_err.to_excel(OUT / "review_重复写入.xlsx", index=False)
    print(f"       review_重复写入: {len(dup_err)}")

    # 名称多命中 / 去类型多命中 存在哪个 category
    print(f"       log category 分布:")
    for c, n in logdf["category"].value_counts().items():
        print(f"         {c}: {n}")


if __name__ == "__main__":
    main()
