# P3 · 13 征集志愿治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `data/13_征集志愿/普通高考/` 下 99 个 OCR xlsx 清洗、标准化、与 03_enriched 主表对齐，产出可信的 `13_clean.xlsx`。

**Architecture:** 六阶段串行流水线（rename → pilot → OCR 错误量化 → 批量修复 → 主表对齐 → 人工复核）；每阶段独立脚本 + 测试，落盘中间件到 `data/_pipeline/P3/`；修复日志 `P3_fix_log.csv` 追加写入；遵循 ADR-003（不覆盖原始 OCR 文件，新文件走 `_pipeline/P3/`）。

**Tech Stack:** Python 3.11 + pandas + openpyxl + pytest；复用 `scripts/data_integration/lib/`。

**Related specs:**
- `docs/superpowers/specs/2026-04-17-data-integration-master/design.md` (P3 section, lines 292-367)
- `docs/superpowers/specs/2026-04-17-rename-plan.csv` (175 条重命名映射)
- `docs/superpowers/specs/2026-04-17-naming-dict-unified.md` (命名规则)
- `docs/superpowers/specs/2026-04-17-groundtruth-2023-2024.md`, `2026-04-17-groundtruth-2025.md`

**Decision principles (自主决策，不打断用户):**
- 所有中间技术选择由 controller 决定，不收集"待用户审批"清单
- 只有遇到歧义的项目目标/需求时才询问
- 阶段衔接自动进行，不等"可以进入 P4 吗"

---

## 工作区布局

```
data/_pipeline/P3/
  rename_execution_log.md          # P3.1
  rename_failures.csv              # P3.1
  pilot_2023_2024.md               # P3.2
  ocr_sample_index.csv             # P3.3 抽样索引
  ocr_error_catalog.md             # P3.3
  page_one_investigation.md        # P3.3 页码全为 1 根因
  P3_fix_log.csv                   # P3.4 修复追加日志
  13_normalized.xlsx               # P3.4 字符+代码+结构修复后
  13_aligned.xlsx                  # P3.5 含主表对齐列
  not_in_master.csv                # P3.5 合法离群
  needs_human_review.csv           # P3.5→P3.6
  unresolvable_images.csv          # P3.6
  13_clean.xlsx                    # P3 终产物
docs/superpowers/specs/2026-04-17-data-integration-master/
  P3_report.md                     # 验收报告
```

---

## Task 1: P3.1 执行 Rename Plan

**Files:**
- Create: `scripts/data_integration/p3_execute_rename.py`
- Create: `scripts/data_integration/tests/test_p3_execute_rename.py`
- Output: `data/_pipeline/P3/rename_execution_log.md`
- Output: `data/_pipeline/P3/rename_failures.csv`
- Input: `docs/superpowers/specs/2026-04-17-rename-plan.csv`

**Design:**
- 读取 CSV，按 `type` 分组：先 xlsx 后文件夹（文件夹先改会断路径）→ **不**，正确顺序：先 xlsx 在旧文件夹内改名 → 再旧文件夹改名。csv 已按 `文件夹, xlsx, 文件夹, xlsx` 交错排列，但 **xlsx 的 old 路径引用的是旧文件夹名，而 new 路径引用的是新文件夹名**。所以必须：**先把 xlsx 在旧文件夹内改成"新 xlsx 名（不动目录部分）"，再把旧文件夹改名为新文件夹名**。两步法。
- 或简化：**先整体检查目标不存在（碰撞检测）→ 按文件夹分组，对每个文件夹：先 rename 内部 xlsx 到临时新名（仍在旧文件夹）→ 再 rename 文件夹**。
- 幂等：若 `new_abs` 已存在且 `old_abs` 不存在，视为已执行，skip；若两者都存在 → 冲突，进 failures。
- 产出 MD 表格（时间戳、状态、old→new）。

- [ ] **Step 1: 写失败测试**

```python
# test_p3_execute_rename.py
import shutil, tempfile, os, csv
from pathlib import Path
from scripts.data_integration.p3_execute_rename import execute_rename_plan

def test_execute_rename_folder_and_xlsx(tmp_path):
    # Arrange: 旧目录结构
    old_dir = tmp_path / "专科批次" / "3335_征集志愿_第一次_2023_专科批"
    old_dir.mkdir(parents=True)
    (old_dir / "3335_征集志愿_第一次_2023_mimo.xlsx").write_text("x")
    new_dir = tmp_path / "专科批次" / "3335_2023_文科_专科批_征集志愿_第一次"
    new_xlsx = new_dir / "3335_2023_文科_专科批_征集志愿_第一次_mimo.xlsx"

    plan = [
        {"type": "文件夹", "old_abs": str(old_dir), "new_abs": str(new_dir), "note": ""},
        {"type": "xlsx",
         "old_abs": str(old_dir / "3335_征集志愿_第一次_2023_mimo.xlsx"),
         "new_abs": str(new_xlsx), "note": ""},
    ]
    log, failures = execute_rename_plan(plan)
    assert new_dir.is_dir()
    assert new_xlsx.is_file()
    assert not old_dir.exists()
    assert len(failures) == 0
    assert len(log) == 2
```

- [ ] **Step 2: 运行测试确认 FAIL**

Run: `pytest scripts/data_integration/tests/test_p3_execute_rename.py -v`
Expected: FAIL (ImportError)

- [ ] **Step 3: 实现**

```python
# scripts/data_integration/p3_execute_rename.py
"""
执行 rename-plan.csv；幂等；生成 execution_log + failures。
策略：对每个 entry：
  - 若 new 已存在且 old 不存在 → already_done, skip
  - 若 new 已存在且 old 存在   → conflict, 进 failures
  - 若 old 不存在且 new 不存在 → missing, 进 failures
  - 否则 os.rename(old, new)
顺序：xlsx 在其父文件夹被重命名前先处理（csv 当前顺序是"文件夹, 其 xlsx"，
xlsx 的 old 路径用旧文件夹名 → 所以对每对 (folder, xlsx)：先执行 xlsx-rename-in-place
（临时名不改目录部分），再文件夹 rename。但 csv 的 xlsx 行已经写了 new 的完整路径
（含新文件夹名）→ 必须反过来：先按条目顺序，对每个文件夹：
  (a) rename xlsx 到"旧文件夹 + 新 xlsx 名"
  (b) rename 文件夹
我们采用分两轮策略：
轮 1：所有 xlsx 在旧父文件夹内改成新 basename
轮 2：所有文件夹整体改名
这样 csv 的 new_abs（含新文件夹）在轮 1 暂时不可达，改用 basename 派生。
"""
import csv, os
from pathlib import Path
from datetime import datetime

def execute_rename_plan(plan_rows):
    log, failures = [], []
    # 轮 1：xlsx 先在旧目录内改 basename
    # 轮 2：文件夹改名
    folders = [r for r in plan_rows if r["type"] == "文件夹"]
    xlsxs = [r for r in plan_rows if r["type"] == "xlsx"]

    # 建 folder old→new 映射
    folder_map = {r["old_abs"]: r["new_abs"] for r in folders}

    # 轮 1
    for r in xlsxs:
        old = Path(r["old_abs"])
        new_final = Path(r["new_abs"])
        # 推导轮 1 的临时 new：保留 old 的父目录，换 basename
        stage1_new = old.parent / new_final.name
        status = _rename_one(old, stage1_new)
        log.append({"ts": _ts(), "type": "xlsx_stage1", "old": str(old),
                    "new": str(stage1_new), "status": status})
        if status.startswith("error"):
            failures.append({"type": "xlsx", "old": str(old),
                             "new": str(stage1_new), "reason": status})

    # 轮 2
    for r in folders:
        old = Path(r["old_abs"])
        new = Path(r["new_abs"])
        status = _rename_one(old, new)
        log.append({"ts": _ts(), "type": "folder", "old": str(old),
                    "new": str(new), "status": status})
        if status.startswith("error"):
            failures.append({"type": "文件夹", "old": str(old),
                             "new": str(new), "reason": status})

    return log, failures

def _rename_one(old: Path, new: Path):
    if new.exists() and not old.exists():
        return "already_done"
    if new.exists() and old.exists():
        return "error:conflict_both_exist"
    if not old.exists() and not new.exists():
        return "error:missing"
    try:
        new.parent.mkdir(parents=True, exist_ok=True)
        os.rename(old, new)
        return "ok"
    except OSError as e:
        return f"error:{e}"

def _ts():
    return datetime.utcnow().isoformat()
```

- [ ] **Step 4: 运行测试确认 PASS**

Run: `pytest scripts/data_integration/tests/test_p3_execute_rename.py -v`
Expected: PASS

- [ ] **Step 5: 加一个测试：幂等 & 冲突**

```python
def test_execute_rename_idempotent(tmp_path):
    """second run on already-renamed tree → status=already_done, no failures."""
    new_dir = tmp_path / "x"
    new_dir.mkdir()
    plan = [{"type": "文件夹",
             "old_abs": str(tmp_path / "old_not_exist"),
             "new_abs": str(new_dir), "note": ""}]
    log, failures = execute_rename_plan(plan)
    assert len(failures) == 0
    assert log[0]["status"] == "already_done"
```

- [ ] **Step 6: CLI + dry-run 模式**

在 `p3_execute_rename.py` 末尾加 `if __name__ == "__main__"`，argparse 支持 `--dry-run`（只打印不执行）、`--plan` 路径、`--out-dir` 输出日志路径。

- [ ] **Step 7: Dry-run 跑真实 plan 验证**

```bash
python scripts/data_integration/p3_execute_rename.py \
  --plan docs/superpowers/specs/2026-04-17-rename-plan.csv \
  --out-dir data/_pipeline/P3 \
  --dry-run
```

Expected: 175 行 plan，stdout 打印每条预期操作；not failures（除非命名冲突）。

- [ ] **Step 8: 正式执行**

```bash
python scripts/data_integration/p3_execute_rename.py \
  --plan docs/superpowers/specs/2026-04-17-rename-plan.csv \
  --out-dir data/_pipeline/P3
```

校验 `data/13_征集志愿/普通高考/` 下所有文件夹都是新名；`data/_pipeline/P3/rename_execution_log.md` 生成；failures.csv 空或仅含 K1 混合项。

- [ ] **Step 9: 提交**

```bash
git add scripts/data_integration/p3_execute_rename.py \
        scripts/data_integration/tests/test_p3_execute_rename.py \
        data/_pipeline/P3/rename_execution_log.md \
        data/_pipeline/P3/rename_failures.csv
git commit -m "feat: P3.1 execute rename plan for 13 征集志愿 (175 entries)"
```

---

## Task 2: P3.2 完成 2023/2024 pilot

**Files:**
- Input: `scripts/_gt_2023_2024.json` (已存在)
- Input: `scripts/gt_scan_2023_2024.py` (已存在)
- Create: `scripts/data_integration/p3_pilot_2023_2024.py`
- Output: `data/_pipeline/P3/pilot_2023_2024.md`

**Design:**
- 复用已有 `_gt_2023_2024.json`：对 2023/2024 每个 xlsx 做结构检查（列名、行数、关键字段非空率）
- 不对每行做深度校验（那是 P3.3/P3.4 的事）
- 产出 MD 表：xlsx, 行数, 列名签名, 空行数, pilot_status ∈ {ok / warn / fail}

- [ ] **Step 1: 读取 _gt_2023_2024.json 观察已有结构**

Run: `python -c "import json; d=json.load(open('scripts/_gt_2023_2024.json', encoding='utf-8')); print(list(d.keys())[:5])"`

- [ ] **Step 2: 写 pilot 逻辑**

```python
# scripts/data_integration/p3_pilot_2023_2024.py
import json, openpyxl
from pathlib import Path

DATA_ROOT = Path("data/13_征集志愿/普通高考")

def scan_xlsx(xlsx_path: Path):
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return {"n_rows": 0, "cols": [], "empty_ratio": 0, "status": "fail"}
    header = rows[0]
    data = rows[1:]
    n = len(data)
    empty = sum(1 for r in data if all(v in (None, "") for v in r))
    status = "ok" if n > 0 and empty / max(n, 1) < 0.3 else "warn"
    return {"n_rows": n, "cols": [str(c) for c in header], "empty_ratio": empty / max(n, 1),
            "status": status}

def run_pilot():
    results = []
    for xlsx in DATA_ROOT.rglob("*.xlsx"):
        name = xlsx.stem
        if "2023" not in name and "2024" not in name:
            continue
        info = scan_xlsx(xlsx)
        info["file"] = str(xlsx.relative_to(DATA_ROOT))
        results.append(info)
    return results
```

- [ ] **Step 3: 写测试（mock）**

```python
# test_p3_pilot_2023_2024.py
from openpyxl import Workbook
from scripts.data_integration.p3_pilot_2023_2024 import scan_xlsx

def test_scan_xlsx_ok(tmp_path):
    wb = Workbook()
    ws = wb.active
    ws.append(["院校代码", "专业代码", "计划数"])
    for i in range(10):
        ws.append([f"1000{i}", "01", i])
    p = tmp_path / "x.xlsx"
    wb.save(p)
    r = scan_xlsx(p)
    assert r["n_rows"] == 10
    assert r["status"] == "ok"
```

- [ ] **Step 4: 运行测试 PASS**

Run: `pytest scripts/data_integration/tests/test_p3_pilot_2023_2024.py -v`

- [ ] **Step 5: 生成 pilot_2023_2024.md**

脚本末尾 `if __name__ == "__main__"` 执行 run_pilot，写 MD 表格。

- [ ] **Step 6: 提交**

```bash
git commit -m "feat: P3.2 pilot scan for 2023/2024 征集志愿 xlsx"
```

---

## Task 3: P3.3 OCR 错误量化

**Files:**
- Create: `scripts/data_integration/p3_sample_for_ocr_check.py` (分层抽样)
- Create: `data/_pipeline/P3/ocr_sample_index.csv`
- Create: `docs/superpowers/specs/2026-04-17-data-integration-master/ocr_error_catalog.md`
- Create: `data/_pipeline/P3/page_one_investigation.md`

**Design:**
- 分层抽样：99 xlsx × 每个抽 2-3 行 ≈ 250 行
- 每行记录：file, row_idx, 原始 row, 对应原图路径（同目录 `NNNN_NNN.jpg`），抽样理由（长备注/特殊代码/混合括号）
- 子 agent 对每条抽样：Read 原图 + 比对 OCR 值，标记错误类型
- 页码全为 1 调查：grep 所有 xlsx 的"页码"列，统计分布；若 99% 都是 1 → 归一化 bug；产出 page_one_investigation.md 含结论（重 OCR / 按序号回填 / 接受标注）

- [ ] **Step 1: 抽样脚本 + 测试**

```python
# p3_sample_for_ocr_check.py
import random, pandas as pd
from pathlib import Path

def stratified_sample(xlsx_files, per_file=3, seed=42):
    random.seed(seed)
    samples = []
    for xlsx in xlsx_files:
        df = pd.read_excel(xlsx)
        if len(df) == 0:
            continue
        n = min(per_file, len(df))
        idxs = _select_risky_indices(df, n)
        for i in idxs:
            samples.append({"file": str(xlsx), "row_idx": i,
                            "risk_tag": _risk_tag(df.iloc[i])})
    return samples

def _select_risky_indices(df, n):
    # 优先含多层括号、长备注（>30字）、特殊代码
    scores = []
    for i, row in df.iterrows():
        s = 0
        text = " ".join(str(v) for v in row.values if pd.notna(v))
        if "（(" in text or "）)" in text: s += 2
        if len(text) > 100: s += 1
        scores.append((i, s))
    scores.sort(key=lambda x: -x[1])
    return [i for i, _ in scores[:n]]
```

- [ ] **Step 2: 测试通过 → 生成 ocr_sample_index.csv**

- [ ] **Step 3: 子 agent 审图比对**

派遣子 agent 批量处理：
- 输入：`ocr_sample_index.csv` 的 50 条切片
- 行为：对每条，Read 对应 jpg + 打开 xlsx 读该行 → 列出不一致字段
- 输出：分类统计（字符混淆/括号串行/备注截断/简繁混用/代码位数/forward-fill 缺失/其他），每类至少 3 条样例

- [ ] **Step 4: 汇总 ocr_error_catalog.md**

各子 agent 输出合并 → 整体错误率 + 按类型占比 + 修复策略（自动/半自动/人工）

- [ ] **Step 5: 页码全为 1 根因调查**

```bash
# 检查 13_* xlsx 中页码列分布
python -c "
import pandas as pd, pathlib
dist = {}
for p in pathlib.Path('data/13_征集志愿').rglob('*.xlsx'):
    try:
        df = pd.read_excel(p)
    except: continue
    for col in df.columns:
        if '页' in str(col):
            vc = df[col].value_counts().to_dict()
            dist[str(p)] = vc
            break
print(dist)
"
```

结论写入 `page_one_investigation.md`：
- 若真是 99%+ 都 1 → 决策（a）重新 OCR / （b）按图片序号回填 / （c）标注保留
- 按成本选最优，直接落 DECISIONS.md

- [ ] **Step 6: 提交**

```bash
git commit -m "feat: P3.3 OCR error rate quantification + page anomaly investigation"
```

---

## Task 4: P3.4 批量修复

**Files:**
- Create: `scripts/data_integration/p3_repair.py`
- Create: `scripts/data_integration/lib/ocr_fixes.py` (字符/代码/结构层)
- Output: `data/_pipeline/P3/13_normalized.xlsx`
- Output: `data/_pipeline/P3/P3_fix_log.csv`

**Design:** 严格顺序
1. **字符标准化**（幂等）：繁→简、括号统一、空白归一
2. **代码层**：院校码 4 位、专业码字符集、O→0/l→1/S→5
3. **结构层**：forward-fill（分类/批次/科类）、括号归属
4. **完整性**：截断检测

每步一函数，返回 `(new_df, fix_log_rows)`；管线串联。

- [ ] **Step 1: 字符标准化函数 + 测试**

```python
# ocr_fixes.py
import opencc  # 繁简（或 cn2an + 手写字典）
import re

_CONVERTER = None  # lazy init

def normalize_chars(text: str) -> str:
    global _CONVERTER
    if _CONVERTER is None:
        _CONVERTER = opencc.OpenCC("t2s")  # 繁→简
    if text is None: return None
    s = _CONVERTER.convert(text)
    # 括号统一为中文
    s = s.replace("(", "（").replace(")", "）")
    # 空白归一
    s = re.sub(r"\s+", " ", s).strip()
    return s
```

Test: 繁体入，简体+中文括号+单空格出。

- [ ] **Step 2: 代码层修复 + 测试**

```python
def fix_college_code(code: str) -> tuple[str, str | None]:
    """返回 (new_code, reason or None)；reason 非 None 即有修复"""
    if code is None: return (None, None)
    s = str(code).strip()
    # O/l/S 等混淆
    s2 = s.translate(str.maketrans("OlSZ", "0151"))
    if s2 != s:
        return (s2, f"char_confusion:{s}→{s2}")
    # 补 0 至 4 位
    if s.isdigit() and len(s) < 4:
        s3 = s.zfill(4)
        return (s3, f"pad_zero:{s}→{s3}")
    return (s, None)
```

Tests: `"O123"→"0123"`, `"123"→"0123"`, `"1234"→无修复`

- [ ] **Step 3: 结构层 — forward-fill**

```python
def forward_fill_structural(df: pd.DataFrame, cols: list[str]) -> tuple[pd.DataFrame, list]:
    log = []
    for c in cols:
        if c not in df.columns: continue
        last = None
        for i in range(len(df)):
            v = df.iloc[i][c]
            if pd.isna(v) or str(v).strip() == "":
                if last is not None:
                    df.iat[i, df.columns.get_loc(c)] = last
                    log.append({"row": i, "col": c, "fix_type": "forward_fill", "new": last})
            else:
                last = v
    return df, log
```

- [ ] **Step 4: 括号归属（Rule 1）**

难点：院校行备注 vs 专业行备注。策略：若"（……）"完整出现在一行且下一行无括号 → 归本行；若跨行 → 归上行。

- [ ] **Step 5: 完整性校验**

末尾未闭合括号 → `flag_maybe_truncated=True`。

- [ ] **Step 6: 主管线 p3_repair.py**

```python
def repair_pipeline(raw_df, year):
    log_all = []
    df = raw_df.copy()
    # 1. 字符
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].apply(normalize_chars)
    # 2. 代码
    for col in ["院校代码", "专业代码"]:
        if col in df.columns:
            results = df[col].apply(fix_college_code)
            df[col] = results.apply(lambda x: x[0])
            for i, (_, reason) in enumerate(results):
                if reason:
                    log_all.append({"row": i, "col": col, "fix_type": reason})
    # 3. 结构
    df, log = forward_fill_structural(df, ["批次", "科类", "分类"])
    log_all.extend(log)
    # 4. 完整性
    df["flag_maybe_truncated"] = df["备注"].apply(_is_truncated) if "备注" in df else False
    return df, log_all
```

- [ ] **Step 7: 全量跑 → 产出 13_normalized.xlsx + P3_fix_log.csv**

- [ ] **Step 8: 提交**

```bash
git commit -m "feat: P3.4 batch repair pipeline (char/code/structural/completeness)"
```

---

## Task 5: P3.5 主表对齐

**Files:**
- Create: `scripts/data_integration/p3_align_to_master.py`
- Input: `data/_pipeline/P3/13_normalized.xlsx` + P2 `03_enriched`
- Output: `data/_pipeline/P3/13_aligned.xlsx`, `not_in_master.csv`, `needs_human_review.csv`

**Design:**
- 对 13_normalized 每行 `(院校代码, 专业代码, 年份)` 在 03_enriched 查存在性
- 命中 → `_in_master=True`
- 未命中：
  - 代码形态异常（院校码非 4 数字 / 专业码有非字母数字）→ `needs_human_review`
  - 代码合法但主表无此条 → `not_in_master`（合法情形，征集是对未完成计划的补充）

- [ ] **Step 1: 写测试**

```python
def test_align_classifies_miss():
    master = pd.DataFrame({"院校代码_国标": ["1001"], "专业代码": ["01"], "数据年份": [2025]})
    candidate = pd.DataFrame({
        "院校代码": ["1001", "1002", "XX"],
        "专业代码": ["01", "01", "@@"],
        "年份": [2025, 2025, 2025],
    })
    aligned, not_in_m, needs_rev = align_to_master(candidate, master)
    assert aligned.iloc[0]["_in_master"] == True
    assert len(not_in_m) == 1  # 1002 合法但无
    assert len(needs_rev) == 1  # XX/@@ 畸形
```

- [ ] **Step 2: 实现 + 测试通过**

- [ ] **Step 3: 全量跑 → 三文件产出**

- [ ] **Step 4: 提交**

---

## Task 6: P3.6 人工复核（子 agent 辅助）

**Files:**
- Input: `data/_pipeline/P3/needs_human_review.csv`
- Output: `data/_pipeline/P3/unresolvable_images.csv`
- Output: `data/_pipeline/P3/13_clean.xlsx` （13_aligned 去除 unresolvable + 合并人工修正）

**Design:** 派遣子 agent 读 needs_human_review + 对应原图 → 判定是"可修正"还是"不可判读"。

- [ ] **Step 1: 派遣子 agent 批处理 review 记录**
- [ ] **Step 2: 合并修正 → 产出 13_clean.xlsx**
- [ ] **Step 3: 提交**

---

## Task 7: P3 验收报告 + RUNBOOK 更新

**Files:**
- Create: `docs/superpowers/specs/2026-04-17-data-integration-master/P3_report.md`
- Modify: `docs/superpowers/specs/2026-04-17-data-integration-master/RUNBOOK.md`
- Modify: `docs/superpowers/specs/2026-04-17-data-integration-master/ISSUES.md`

**Design:** 汇总 P3.1-P3.6 的数字（rename 成功率、OCR 错误率按类型、修复后清洁度、不可判读残留率）。按 P2_report.md 的格式：输入清单、处理总览、抽样、技术决策（D*）、代码与测试、待办。

- [ ] **Step 1: 收集 P3.1-P3.6 产物数字**
- [ ] **Step 2: 写 P3_report.md**
- [ ] **Step 3: 更新 RUNBOOK.md 的 P3 section 为 ✅ + 日志块**
- [ ] **Step 4: 在 ISSUES.md 标记相关 issue 状态**
- [ ] **Step 5: 提交**

```bash
git commit -m "docs: close P3 (13 征集志愿治理) with report and runbook update"
```

---

## 执行手法

- Task 1-2：机械，controller 自己做（TDD + 跑脚本），不派 subagent
- Task 3（OCR 比对）：**必须派 subagent**（读图 token 开销大），分批 50 条一派
- Task 4-5：controller 自己做
- Task 6：派 subagent 做人工复核
- Task 7：controller 汇总

每个 task 完成后直接进入下一个，不找用户确认。
只在发现**需求/目标歧义**时停下来问用户（例如：某类修复是否应覆盖，影响 P4 血缘标记策略）。
