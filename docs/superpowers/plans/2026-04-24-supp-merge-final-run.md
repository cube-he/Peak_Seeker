# 征集志愿终版合并 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 78 个 `_已校验.xlsx` 征集志愿数据合并到 `专业招生主表.xlsx`，ERROR-重复写入清零，抽样准确率 ≥99%，就地交付。

**Architecture:** 沿用 v5 方案（六键/五键匹配 + 6 级降级）。本轮只做最小必要改动：三类 WARN 降级为 INFO，对四类真正的数据质量异常逐项收敛到阈值内，最终派 5 个子 Agent 并行抽样校验后直接覆盖主表。

**Tech Stack:** Python 3 + pandas + openpyxl；现有脚本 `scripts/data_integration/p5_merge_supplementary.py`（718 行）+ `lib/supp_matcher.py`（396 行）；子 Agent 使用 Claude Opus 4.6。

**Spec:** `docs/superpowers/specs/2026-04-24-supp-merge-final-run-design.md`

---

## Phase A — 源冻结

### Task A1：计算 78 个源文件的 sha256

**Files:**
- Create: `scripts/data_integration/_freeze_supp_sources.py`
- Create: `scripts/data_integration/_p5_out/征集源冻结清单.json`

- [ ] **Step 1: 写冻结脚本**

```python
# scripts/data_integration/_freeze_supp_sources.py
"""扫描 data/13_征集志愿/普通高考/ 下所有 _已校验.xlsx, 计算 sha256, 输出清单."""
from __future__ import annotations
import hashlib
import json
from datetime import datetime
from pathlib import Path

SUPP_ROOT = Path("data/13_征集志愿/普通高考")
OUT = Path("scripts/data_integration/_p5_out/征集源冻结清单.json")

def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

def main() -> None:
    files = sorted(SUPP_ROOT.rglob("*_已校验.xlsx"))
    if len(files) != 78:
        print(f"WARN: 预期 78 个文件, 实际 {len(files)} 个")
    manifest = {
        "frozen_at": datetime.now().isoformat(timespec="seconds"),
        "count": len(files),
        "files": [
            {
                "path": str(f.relative_to(Path.cwd())).replace("\\", "/"),
                "size": f.stat().st_size,
                "mtime": datetime.fromtimestamp(f.stat().st_mtime).isoformat(timespec="seconds"),
                "sha256": sha256(f),
            }
            for f in files
        ],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: 冻结 {len(files)} 个文件 -> {OUT}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行冻结**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_freeze_supp_sources.py
```

预期输出：`OK: 冻结 78 个文件 -> scripts\data_integration\_p5_out\征集源冻结清单.json`

- [ ] **Step 3: 同时冻结主表 sha256（单独记录，便于 Phase E 前后一致性校验）**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python -c "import hashlib; p='data/03_专家版主表/output/专业招生主表.xlsx'; h=hashlib.sha256(open(p,'rb').read()).hexdigest(); print(h)" > scripts/data_integration/_p5_out/master_sha256_before.txt
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data_integration/_freeze_supp_sources.py scripts/data_integration/_p5_out/征集源冻结清单.json scripts/data_integration/_p5_out/master_sha256_before.txt
git commit -m "chore(supp-merge): freeze 78 verified sources + master sha256"
```

---

## Phase B — 代码调整（3 类 WARN → INFO）+ 首次重跑

### Task B1：修改 p5_merge_supplementary.py 中 3 处 severity

**Files:**
- Modify: `scripts/data_integration/p5_merge_supplementary.py:518`
- Modify: `scripts/data_integration/p5_merge_supplementary.py:531`
- Modify: `scripts/data_integration/p5_merge_supplementary.py:553`

- [ ] **Step 1: 修改第 518 行（轮次断档）**

把：
```python
            logs.validation.append({
                "level": "WARN",
                "category": "轮次断档",
```
改为：
```python
            logs.validation.append({
                "level": "INFO",
                "category": "轮次断档",
```

- [ ] **Step 2: 修改第 531 行（计划数递增）**

把：
```python
                            logs.validation.append({
                                "level": "WARN",
                                "category": "计划数递增",
```
改为：
```python
                            logs.validation.append({
                                "level": "INFO",
                                "category": "计划数递增",
```

- [ ] **Step 3: 修改第 553 行（征集超计划）**

把：
```python
                                    logs.validation.append({
                                        "level": "WARN",
                                        "category": "征集超计划",
```
改为：
```python
                                    logs.validation.append({
                                        "level": "INFO",
                                        "category": "征集超计划",
```

- [ ] **Step 4: 验证改动**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
grep -n -A1 "category.*轮次断档\|category.*计划数递增\|category.*征集超计划" scripts/data_integration/p5_merge_supplementary.py
```

预期：每个 category 行上面一行都是 `"level": "INFO",`，没有 WARN。

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/p5_merge_supplementary.py
git commit -m "feat(supp-merge): downgrade 3 business-legal warnings to INFO

- 轮次断档: 专业可在第N轮首次参与征集, 前轮无数据合法
- 计划数递增: 院校可合法新增/调增计划
- 征集超计划: 同上

这三类不再作为合并质量门禁, 只留审计痕迹."
```

---

### Task B2：首次重跑 v5 合并

**Files:** 无新文件，仅运行脚本

- [ ] **Step 1: 执行合并**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/p5_merge_supplementary.py
```

预期：20-40 分钟完成，终端打印类似：
```
文件数: 78
征集总行数: 23xxx
已写入: 17xxx (7x.x%)
未匹配: 3xxx (1x.x%)
行错误: 16xx
重复写入: xxx
=== 输出文件 ===
  master: scripts\data_integration\_p5_out\专业招生主表_含征集_{TS}.xlsx
  ...
```

- [ ] **Step 2: 把 summary 保存到基线文件**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
cp scripts/data_integration/_p5_out/p5_summary.txt scripts/data_integration/_p5_out/p5_summary_B2_baseline.txt
```

- [ ] **Step 3: 记录本轮 timestamp（后续步骤引用）**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
grep "^P5 执行时间戳" scripts/data_integration/_p5_out/p5_summary.txt
```

把这个时间戳记到剪贴板/笔记里，后续用 `$TS_B2` 指代。

- [ ] **Step 4: 快速检查关键指标**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
grep -E "ERROR-重复写入|WARN-名称多命中|WARN-去类型多命中|KEY-INCOMPLETE" scripts/data_integration/_p5_out/p5_summary.txt
```

**质量门禁阈值（记下本次实际值，后续与收敛后比较）**：

| 指标 | B2 阈值 | 本次实测 |
|---|---|---|
| ERROR-重复写入 | 0 | ? |
| KEY-INCOMPLETE | ≤ 50 | ? |
| WARN-名称多命中 | ≤ 50 | ? |
| WARN-去类型多命中 | ≤ 5 | ? |

任一未达标 → 进入 Phase C。全部达标 → 跳到 Phase D。

- [ ] **Step 5: Commit B2 产物**

```bash
git add scripts/data_integration/_p5_out/p5_summary_B2_baseline.txt scripts/data_integration/_p5_out/p5_summary.txt
git commit -m "chore(supp-merge): B2 baseline run after WARN downgrade"
```

---

## Phase C — 消灭 4 类数据质量异常（迭代）

> **Note:** Phase C 是迭代阶段，任务数取决于 B2 的实际异常数。下面按**每类异常一个任务**写，执行时按需跳过已达标的类别。

### Task C1：ERROR-重复写入 归因分析

**Files:**
- Create: `scripts/data_integration/_analyze_dup_writes.py`

- [ ] **Step 1: 写分析脚本**

```python
# scripts/data_integration/_analyze_dup_writes.py
"""读 征集合并校验日志.xlsx 的 ERROR-重复写入, 按根因分类."""
from __future__ import annotations
from pathlib import Path
import pandas as pd

LOG = Path("scripts/data_integration/_p5_out/征集合并校验日志.xlsx")

def main() -> None:
    df = pd.read_excel(LOG)
    dup = df[(df["level"] == "ERROR") & (df["category"] == "重复写入")].copy()
    print(f"ERROR-重复写入 总数: {len(dup)}")
    if len(dup) == 0:
        return
    # 按 (源文件, 主表行号) 频率统计
    print("\n--- Top 20 重复键 ---")
    key_cols = [c for c in ["主表行号", "year", "轮次", "源文件", "源行号", "原写入源"] if c in dup.columns]
    print(dup.groupby(key_cols[:3]).size().sort_values(ascending=False).head(20))
    # 按源文件统计
    print("\n--- 按源文件 ---")
    if "源文件" in dup.columns:
        print(dup["源文件"].value_counts().head(20))

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行分析**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_analyze_dup_writes.py | tee scripts/data_integration/_p5_out/_dup_analysis.txt
```

- [ ] **Step 3: 根据分析结果判断根因**

| 观察 | 根因 | 对应修复任务 |
|---|---|---|
| 同一源文件内多次命中同主表行 | 源 xlsx 本身重复 | Task C2 |
| 不同源文件（同年不同轮次除外）命中同主表行 | 映射表多候选被同时满足 | Task C3 |
| 同主表行被多次触发，但源文件分散、无规律 | 主表某些行匹配键组合非唯一 | Task C4 |

- [ ] **Step 4: 把分析结果加入 commit**

```bash
git add scripts/data_integration/_analyze_dup_writes.py scripts/data_integration/_p5_out/_dup_analysis.txt
git commit -m "chore(supp-merge): analyze ERROR-重复写入 root causes"
```

---

### Task C2：源文件内部去重（若 C1 判定为源重复）

**Files:**
- Create: `scripts/data_integration/_dedupe_verified.py`

- [ ] **Step 1: 写去重脚本（针对特定文件，根据 C1 结果填入）**

```python
# scripts/data_integration/_dedupe_verified.py
"""对指定 _已校验.xlsx 按(院校代码, 专业代码, 专业组代码, 专业名称)去重. 保留首条.
运行前在 TARGETS 填入 C1 分析出的需要去重的文件清单."""
from __future__ import annotations
from pathlib import Path
import pandas as pd

TARGETS: list[str] = [
    # 按 C1 分析结果填入, 例: "data/13_征集志愿/普通高考/.../xxx_已校验.xlsx"
]

DEDUPE_KEYS = ["院校代码", "专业代码", "专业组代码", "专业名称"]

def main() -> None:
    for t in TARGETS:
        p = Path(t)
        backup = p.with_suffix(".xlsx.pre_dedupe")
        if not backup.exists():
            import shutil; shutil.copy(p, backup)
        df = pd.read_excel(p)
        keys = [k for k in DEDUPE_KEYS if k in df.columns]
        n_before = len(df)
        df = df.drop_duplicates(subset=keys, keep="first").reset_index(drop=True)
        n_after = len(df)
        df.to_excel(p, index=False)
        print(f"{p.name}: {n_before} -> {n_after} (去重 {n_before - n_after} 条)")

if __name__ == "__main__":
    if not TARGETS:
        print("请先填 TARGETS 再运行")
    else:
        main()
```

- [ ] **Step 2: 根据 C1 分析填入 TARGETS，运行**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_dedupe_verified.py
```

- [ ] **Step 3: 更新源冻结清单**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_freeze_supp_sources.py
```

- [ ] **Step 4: Commit**

```bash
git add scripts/data_integration/_dedupe_verified.py scripts/data_integration/_p5_out/征集源冻结清单.json data/13_征集志愿/
git commit -m "fix(supp-merge): dedupe verified xlsx for ERROR-重复写入"
```

> 跳过条件：C1 分析判定无源重复 → 直接进入 Task C3。

---

### Task C3：映射表多候选收敛（若 C1 判定为映射问题）

**Files:**
- Modify: `scripts/data_integration/lib/supp_matcher.py`（具体位置根据 C1 结果定位）

- [ ] **Step 1: 先定位问题映射**

读 `lib/supp_matcher.py` 中的 `SUPP_TYPE_2025` 字典和 `map_2324_old_batch` 函数，找出在 C1 分析出的"重复命中"场景里会返回多候选的那个映射条目。

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
grep -n "SUPP_TYPE_2025\|map_2324_old_batch\|OLD_BATCH" scripts/data_integration/lib/supp_matcher.py | head -20
```

- [ ] **Step 2: 缩小候选（加二次筛选键）**

在匹配 2025 分支里，如果某条 `SUPP_TYPE_2025` 映射返回了多个候选主表 (批次, 招生类型)，对每个候选执行匹配时**要求专业组代码精确相等**，不相等的候选丢弃。

具体修改位置会根据 C1 分析的实际重复模式定位——一般在 `p5_merge_supplementary.py` 的 `match_2025` 函数里，在循环候选后加一层"命中数==1才返回，否则返回精确多命中"的判定。

> 此任务需根据 C1 分析结果才能给出确切代码，执行时先把 C1 的 `_dup_analysis.txt` 贴回来，然后补写 diff。

- [ ] **Step 3: Commit**

```bash
git add scripts/data_integration/lib/supp_matcher.py scripts/data_integration/p5_merge_supplementary.py
git commit -m "fix(supp-merge): tighten 2025 mapping fan-out to eliminate dup-writes"
```

> 跳过条件：C1 判定映射表无问题 → 进入 Task C4。

---

### Task C4：主表键非唯一行标注（兜底）

**Files:**
- Create: `scripts/data_integration/_mark_nonunique_master.py`

- [ ] **Step 1: 扫描主表六键非唯一的行**

```python
# scripts/data_integration/_mark_nonunique_master.py
"""扫描主表, 找出 (院校代码, 科目, 批次, 招生类型, 专业组代码, 专业代码) 非唯一的行.
输出到 _p5_out/主表_六键非唯一.xlsx, 供人工确认."""
from __future__ import annotations
from pathlib import Path
import pandas as pd

MASTER = Path("data/03_专家版主表/output/专业招生主表.xlsx")
OUT = Path("scripts/data_integration/_p5_out/主表_六键非唯一.xlsx")
KEYS = ["院校代码", "科目", "批次", "招生类型", "专业组代码", "专业代码"]

def main() -> None:
    df = pd.read_excel(MASTER)
    keys = [k for k in KEYS if k in df.columns]
    dup_mask = df.duplicated(subset=keys, keep=False)
    dups = df[dup_mask].sort_values(keys)
    print(f"六键非唯一行: {len(dups)}")
    dups.to_excel(OUT, index=False)
    print(f"已输出 -> {OUT}")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_mark_nonunique_master.py
```

- [ ] **Step 3: 决策**

- 若非唯一行数 < 50：人工复核该表，逐条合并或在主表标注，二次重跑后 ERROR 应清零
- 若 ≥ 50：暂停并产出诊断报告让用户决策（spec §六 风险应对）

- [ ] **Step 4: Commit**

```bash
git add scripts/data_integration/_mark_nonunique_master.py scripts/data_integration/_p5_out/主表_六键非唯一.xlsx
git commit -m "chore(supp-merge): identify master rows with non-unique 6-key"
```

---

### Task C5：KEY-INCOMPLETE 归因（若 > 50）

**Files:** 无新文件，直接分析 `征集未匹配记录.xlsx`

- [ ] **Step 1: 分析未匹配记录中 KEY-INCOMPLETE 的分布**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python -c "
import pandas as pd
df = pd.read_excel('scripts/data_integration/_p5_out/征集未匹配记录.xlsx')
ki = df[df['失败原因'].astype(str).str.contains('KEY-INCOMPLETE', na=False)]
print(f'KEY-INCOMPLETE 总数: {len(ki)}')
print('--- 按源文件 ---')
print(ki['源文件'].value_counts().head(20))
print('--- 缺失字段示例 ---')
print(ki[['源文件','源行号','院校代码','专业代码']].head(10))
"
```

- [ ] **Step 2: 根据分布决定**

- 集中在少数文件 → 回到 OCR 阶段看看能否补齐缺失字段
- 分散 → 单条在源 xlsx 中手工补齐（保留 `.pre_fix` 备份）

- [ ] **Step 3: 补齐后更新冻结清单**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_freeze_supp_sources.py
```

- [ ] **Step 4: Commit**

```bash
git add data/13_征集志愿/ scripts/data_integration/_p5_out/征集源冻结清单.json
git commit -m "fix(supp-merge): backfill KEY-INCOMPLETE rows in verified xlsx"
```

---

### Task C6：WARN-名称多命中 / 去类型多命中 收敛

**Files:**
- Modify: `scripts/data_integration/p5_merge_supplementary.py`（match 函数中的 Level 5/6 分支）

- [ ] **Step 1: 分析当前多命中分布**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python -c "
import pandas as pd
df = pd.read_excel('scripts/data_integration/_p5_out/征集未匹配记录.xlsx')
nm = df[df['失败原因'].astype(str).str.contains('名称多命中', na=False)]
dk = df[df['失败原因'].astype(str).str.contains('去类型多命中', na=False)]
print(f'名称多命中: {len(nm)}, 去类型多命中: {len(dk)}')
print('--- 名称多命中 按科目×年份 ---')
print(nm.groupby(['科目','year']).size() if 'year' in nm.columns else nm['科目'].value_counts())
"
```

- [ ] **Step 2: 收敛策略——专业名称 token 重叠度筛选**

在 `match_row` 的 Level 5（名称替代）里，若老批次候选×名称命中多行，不直接 WARN，而是按"专业名称归一化后 token 重叠度"保留最相似的一行。具体改法：

```python
# 在 supp_matcher.py 或 p5_merge_supplementary.py 添加
def name_sim(a: str, b: str) -> float:
    """按字符 2-gram 集合重合度算相似度."""
    def ng(s):
        s = ''.join(c for c in str(s) if c.isalnum() or '\u4e00' <= c <= '\u9fff')
        return set(s[i:i+2] for i in range(len(s)-1)) if len(s) > 1 else set([s])
    sa, sb = ng(a), ng(b)
    return len(sa & sb) / max(len(sa | sb), 1)

# 在 Level 5 多命中时:
# candidates = [(行号, df.at[行号, '专业']) for 行号 in 多命中行号列表]
# scores = [(idx, name_sim(源专业名, master_name)) for idx, master_name in candidates]
# 若 max(score) >= 0.8 且第二名 < 0.6, 返回该行 INFO-名称最优匹配; 否则 WARN-名称多命中
```

> 此任务细节由实际数据分布决定，执行阶段先根据 Step 1 输出再定阈值。

- [ ] **Step 3: Commit**

```bash
git add scripts/data_integration/p5_merge_supplementary.py scripts/data_integration/lib/supp_matcher.py
git commit -m "feat(supp-merge): converge name-multi-hit via 2-gram similarity"
```

---

### Task C7：收敛后重跑 + 验证达标

- [ ] **Step 1: 重跑**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/p5_merge_supplementary.py
```

- [ ] **Step 2: 校验所有阈值**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
cat scripts/data_integration/_p5_out/p5_summary.txt | grep -E "ERROR-重复写入|WARN-名称多命中|WARN-去类型多命中|KEY-INCOMPLETE"
```

**门禁**：
- ERROR-重复写入 = 0 → 必须达成
- KEY-INCOMPLETE ≤ 50
- WARN-名称多命中 ≤ 50
- WARN-去类型多命中 ≤ 5

任一不达标 → 回到 C1 重新归因。全部达标 → 进入 Phase D。

- [ ] **Step 3: 保存达标版 summary**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
cp scripts/data_integration/_p5_out/p5_summary.txt scripts/data_integration/_p5_out/p5_summary_C_passed.txt
git add scripts/data_integration/_p5_out/p5_summary_C_passed.txt
git commit -m "chore(supp-merge): Phase C passed all quality gates"
```

---

## Phase D — 100 条抽样准确率校验（5 子 Agent 并行）

### Task D1：分层随机抽样 100 条

**Files:**
- Create: `scripts/data_integration/_sample_for_verification.py`

- [ ] **Step 1: 写采样脚本**

```python
# scripts/data_integration/_sample_for_verification.py
"""从 征集抽样核对.xlsx 或更大范围随机分层抽 100 条, 按年份分 3 份 (各33/33/34), 再分 5 子 Agent (各20)."""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd

WRITTEN_LOG = Path("scripts/data_integration/_p5_out/征集合并校验日志.xlsx")  # INFO-写入 tracking
MASTER_OUT = None  # 运行时从 summary 读取 TS 后赋值
OUT_DIR = Path("scripts/data_integration/_p5_out/_agent_samples")
OUT_DIR.mkdir(parents=True, exist_ok=True)

def main() -> None:
    import re
    summary = Path("scripts/data_integration/_p5_out/p5_summary.txt").read_text(encoding="utf-8")
    ts = re.search(r"P5 执行时间戳:\s*(\S+)", summary).group(1)
    master_out = Path(f"scripts/data_integration/_p5_out/专业招生主表_含征集_{ts}.xlsx")
    sampling_path = Path("scripts/data_integration/_p5_out/征集抽样核对.xlsx")
    df = pd.read_excel(sampling_path)
    # 按 year 分层
    by_year = {y: sub for y, sub in df.groupby("year")}
    parts = []
    for y, n in [(2023, 33), (2024, 33), (2025, 34)]:
        sub = by_year.get(y, pd.DataFrame())
        if len(sub) < n:
            parts.append(sub)
        else:
            parts.append(sub.sample(n=n, random_state=42))
    pooled = pd.concat(parts).reset_index(drop=True)
    assert len(pooled) == 100, f"抽样数 {len(pooled)} != 100"
    # 切 5 份, 各 20 条
    for i in range(5):
        chunk = pooled.iloc[i*20:(i+1)*20]
        out = OUT_DIR / f"agent_{i+1}_samples.xlsx"
        chunk.to_excel(out, index=False)
        print(f"Agent {i+1}: {len(chunk)} 条 -> {out}")
    # 写入元数据供 Agent 使用
    meta = {"ts": ts, "master_out": str(master_out), "total": 100}
    (OUT_DIR / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_sample_for_verification.py
```

预期：5 个 `agent_{n}_samples.xlsx` 各 20 条 + `meta.json`。

- [ ] **Step 3: Commit**

```bash
git add scripts/data_integration/_sample_for_verification.py scripts/data_integration/_p5_out/_agent_samples/
git commit -m "chore(supp-merge): stratified sample 100 rows for agent verification"
```

---

### Task D2：派 5 个子 Agent 并行校验

- [ ] **Step 1: 准备标准 Agent Prompt**

每个 Agent 的任务描述：

```
你是征集志愿合并数据抽样校验 Agent #N（N=1..5）。

## 输入
- 抽样文件: scripts/data_integration/_p5_out/_agent_samples/agent_{N}_samples.xlsx（20 条）
  每条包含: 主表行号、源文件、源行号、year、轮次、写入计划数、match_level、主表院校代码、主表院校名称、主表专业、主表批次、主表招生类型、主表科目、主表专业组代码
- 源 xlsx 路径: 可从"源文件"字段推出，在 data/13_征集志愿/普通高考/ 下 find

## 任务
对每一条抽样：
1. 打开"源文件"对应的 _已校验.xlsx，定位"源行号"行
2. 读取源行的字段（院校代码、专业代码、专业名称、科目/科类、招生类型、计划数、收费、备注）
3. 与抽样记录中的"主表*"字段逐一比对（经过 v5 §3.0 字段归一化后）
4. 判定：
   - FULL_MATCH: 所有字段归一化后相等，写入计划数相等
   - MINOR_DIFF: 存在可接受差异（如专业名称归一化前后、收费单位差异）
   - MISMATCH: 关键字段（院校代码/专业代码/计划数）不一致

## 输出
JSON 文件 scripts/data_integration/_p5_out/_agent_samples/agent_{N}_result.json，格式：
{
  "agent": N,
  "total": 20,
  "full_match": <数量>,
  "minor_diff": <数量>,
  "mismatch": <数量>,
  "details": [
    {"主表行号": ..., "源文件": "...", "源行号": ..., "verdict": "FULL_MATCH|MINOR_DIFF|MISMATCH", "note": "..."},
    ...
  ]
}

## 重要约束
- 只读不写，不修改任何源文件或主表
- 若源文件/行找不到，verdict 标 "SOURCE_NOT_FOUND"，note 写清楚
- 字段归一化规则见 v5 方案 §3.0: 数值类去前导零, 文本类 strip, 专业代码 upper
```

- [ ] **Step 2: 并行派发 5 个 Agent**

使用 Agent 工具一次性发起 5 个 Opus 4.6 的并行调用（subagent_type = `general-purpose`），model = `opus`。

- [ ] **Step 3: 等待 5 份 agent_{N}_result.json 全部落盘**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
ls scripts/data_integration/_p5_out/_agent_samples/agent_*_result.json
```

应看到 5 个 json。

---

### Task D3：汇总准确率

**Files:**
- Create: `scripts/data_integration/_aggregate_agent_reports.py`

- [ ] **Step 1: 写汇总脚本**

```python
# scripts/data_integration/_aggregate_agent_reports.py
"""汇总 5 个 Agent 的 JSON 报告, 计算准确率."""
from __future__ import annotations
import json
from pathlib import Path

DIR = Path("scripts/data_integration/_p5_out/_agent_samples")
OUT = Path("scripts/data_integration/_p5_out/征集抽样准确率报告.xlsx")

def main() -> None:
    import pandas as pd
    reports = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(DIR.glob("agent_*_result.json"))]
    total = sum(r["total"] for r in reports)
    full = sum(r["full_match"] for r in reports)
    minor = sum(r["minor_diff"] for r in reports)
    mis = sum(r.get("mismatch", 0) for r in reports)
    src_nf = total - full - minor - mis
    accuracy = (full + minor) / total if total else 0
    print(f"总样本: {total}")
    print(f"FULL_MATCH: {full}")
    print(f"MINOR_DIFF: {minor}")
    print(f"MISMATCH: {mis}")
    print(f"SOURCE_NOT_FOUND: {src_nf}")
    print(f"准确率 (FULL+MINOR)/TOTAL = {accuracy:.2%}")
    # 明细落表
    rows = []
    for r in reports:
        for d in r["details"]:
            d["agent"] = r["agent"]
            rows.append(d)
    pd.DataFrame(rows).to_excel(OUT, index=False)
    print(f"明细 -> {OUT}")
    if accuracy < 0.99:
        print("❌ 准确率未达 99%, 需回 Phase C 根因修复")
        raise SystemExit(1)
    print("✅ 准确率达标")

if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 运行汇总**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python scripts/data_integration/_aggregate_agent_reports.py
```

- [ ] **Step 3: 决策**

- 准确率 ≥ 99% → Phase E
- 准确率 < 99% → 根据 MISMATCH 明细回到 Phase C 定位修复，然后重跑 Phase B→C→D

- [ ] **Step 4: Commit**

```bash
git add scripts/data_integration/_aggregate_agent_reports.py scripts/data_integration/_p5_out/征集抽样准确率报告.xlsx scripts/data_integration/_p5_out/_agent_samples/
git commit -m "test(supp-merge): 100-row sampling accuracy = XX.X%"
```

---

## Phase E — 交付

### Task E1：备份原主表

- [ ] **Step 1: 备份**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
TS=$(date +%Y%m%d_%H%M%S)
cp "data/03_专家版主表/output/专业招生主表.xlsx" "data/03_专家版主表/output/专业招生主表_前征集_${TS}.xlsx"
echo "backup: 专业招生主表_前征集_${TS}.xlsx"
```

- [ ] **Step 2: 校验备份 sha256 与 before 一致**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python -c "import hashlib; p='data/03_专家版主表/output/专业招生主表.xlsx'; print(hashlib.sha256(open(p,'rb').read()).hexdigest())"
cat scripts/data_integration/_p5_out/master_sha256_before.txt
```

两个哈希必须一致，否则说明主表被并发修改过——停止，调查原因。

---

### Task E2：覆盖主表

- [ ] **Step 1: 用达标版合并输出覆盖主表**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
TS=$(grep "^P5 执行时间戳" scripts/data_integration/_p5_out/p5_summary.txt | awk '{print $2}')
cp "scripts/data_integration/_p5_out/专业招生主表_含征集_${TS}.xlsx" "data/03_专家版主表/output/专业招生主表.xlsx"
```

- [ ] **Step 2: 校验覆盖后文件可读**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python -c "
import pandas as pd
df = pd.read_excel('data/03_专家版主表/output/专业招生主表.xlsx')
print(f'行数: {len(df)}, 列数: {len(df.columns)}')
supp_cols = [c for c in df.columns if '征集第' in c]
print(f'征集列数: {len(supp_cols)}')
print(f'征集列非空行数 (任一列有值): {df[supp_cols].notna().any(axis=1).sum()}')
"
```

预期：行数 ≈ 48131，列数 = 71 + 11 = 82，征集列数 = 11，非空行数 > 17,000。

---

### Task E3：写最终报告

**Files:**
- Create: `scripts/data_integration/_p5_out/征集合并_最终报告.md`

- [ ] **Step 1: 写报告**

```markdown
# 征集志愿合并最终报告

> 日期：2026-04-24
> 方案依据：`data/13_征集志愿/征集志愿合并主表方案.md` (v5) + `docs/superpowers/specs/2026-04-24-supp-merge-final-run-design.md`

## 一、最终指标

| 指标 | v5 基线 (20260421) | 本轮终版 |
|---|---|---|
| 征集源文件 | 78 | 78 |
| 征集总行数 | 23354 | <填> |
| 已写入 | 17766 (76.1%) | <填> |
| 未匹配 | 3536 (15.1%) | <填> |
| ERROR-重复写入 | 355 | <填，应为 0> |
| KEY-INCOMPLETE | 305 | <填> |
| WARN-名称多命中 | 198 | <填> |
| WARN-去类型多命中 | 13 | <填> |
| INFO-计划数递增 | — (原 WARN 553) | <填> |
| INFO-征集超计划 | — (原 WARN 1650) | <填> |
| INFO-轮次断档 | — (原 WARN 1694) | <填> |
| 抽样 100 条准确率 | — | <填，应 ≥ 99%> |

## 二、关键决策 & 理由

- 轮次断档 / 计划数递增 / 征集超计划 三类 WARN → INFO：合法业务现象（院校可合法新增/调增计划，专业可在非第一轮首次参与征集），不是数据质量问题
- 未匹配率未设硬门禁：v5 已分析 80% 是真实数据缺口（主表为 2025 骨架，23-24 停招专业无归宿行），算法不可修复
- ERROR-重复写入 清零硬门禁：<填实际清零策略>

## 三、交付文件

- 主表：`data/03_专家版主表/output/专业招生主表.xlsx` (48,131 × 82，新增 11 列征集计划)
- 原主表备份：`data/03_专家版主表/output/专业招生主表_前征集_{TS}.xlsx`
- 校验日志：`scripts/data_integration/_p5_out/征集合并校验日志.xlsx`
- 未匹配孤立表：`scripts/data_integration/_p5_out/征集未匹配记录.xlsx`
- 抽样准确率报告：`scripts/data_integration/_p5_out/征集抽样准确率报告.xlsx`

## 四、未匹配行处置建议

3,xxx 条未匹配行已存入孤立表，不入主表。后续：
- 2023/2024 停招专业 → 永久归档
- 2025 新增计划但主表无对应行 → 下次主表全量更新时纳入
```

- [ ] **Step 2: 用实际数值填充 `<填>` 占位**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
cat scripts/data_integration/_p5_out/p5_summary.txt
cat scripts/data_integration/_p5_out/征集抽样准确率报告.xlsx # 需要 Python 读
```

根据实际运行结果填入所有 `<填>`。

- [ ] **Step 3: Commit 最终报告**

```bash
git add scripts/data_integration/_p5_out/征集合并_最终报告.md
git commit -m "docs(supp-merge): final merge report"
```

---

### Task E4：最终 commit 主表覆盖

- [ ] **Step 1: 一次性提交交付物**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
git add "data/03_专家版主表/output/专业招生主表.xlsx" "data/03_专家版主表/output/专业招生主表_前征集_"*".xlsx"
git add scripts/data_integration/_p5_out/
git commit -m "feat(supp-merge): deliver final merged 专业招生主表 with 11 supp-recruit cols

- 78 verified supp-recruit xlsx -> master 专业招生主表
- ERROR-重复写入 清零; 抽样 100 条准确率 XX.X%
- 3 类合法业务异常 (轮次断档/计划数递增/征集超计划) 降级为 INFO
- 未匹配行孤立保存, 不入主表"
```

- [ ] **Step 2: 最终确认**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
git log --oneline -10
ls -la data/03_专家版主表/output/专业招生主表*.xlsx
```

---

## 自检已完成

- [x] Spec 覆盖：Phase A-E 完整对应 spec §一-六
- [x] 占位符扫描：Task C2/C3/C6 有"根据 C1 结果再定"的条件分支，但不是占位符，是迭代入口点
- [x] 类型/命名一致性：征集列命名、p5_summary.txt 字段、文件路径在所有 Task 中一致

---

## 执行提示

- Phase C 是迭代核心，每迭代一轮跑一遍 B2+C7，直到全部门禁通过
- Phase D 的 5 个子 Agent 必须 Opus 4.6，不用其他模型（抽样要求绝对精准）
- Phase E 前必须校验 `master_sha256_before.txt` 与当前主表 sha256 一致，防并发写
