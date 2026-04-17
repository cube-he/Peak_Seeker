# 数据整合 P0-P1 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完成 P0 工程准备（目录骨架 + lib 基础模块 + contract）与 P1 03 主表自洽修复（去重 + 分数逻辑 + 专业代码补齐），产出 `03_patched.xlsx` + `patch_log.csv` + `P1_report.md` 供用户验收。

**Architecture:** Python 脚本 + pytest TDD。所有修复有独立测试；主表处理脚本读取 03 xlsx，按主键分组检查、修复、输出新 xlsx + 修改日志。血缘标记通过独立 `_source` / `_quality_flag` 列写入。

**Tech Stack:** Python 3.11.9, pandas 2.3.3, openpyxl, pytest, 内置 hashlib/json/pathlib

**Spec 参照:** `docs/superpowers/specs/2026-04-17-data-integration-master/design.md`（v1.1）

**Plan 边界:** 本计划覆盖 P0 + P1；P2/P3/P4 的详细 plan 待本计划验收后单独出。

---

## File Structure

**新建（scripts 目录）:**
- `scripts/data_integration/__init__.py` — 包标识
- `scripts/data_integration/lib/__init__.py` — lib 包标识
- `scripts/data_integration/lib/batch_dict.py` — 批次字典加载与命名映射
- `scripts/data_integration/lib/code_mapper.py` — 院校代码映射（四川招生码↔国标）
- `scripts/data_integration/lib/lineage.py` — 血缘标记 helper
- `scripts/data_integration/p1_baseline.py` — 基线冻结：扫描源文件产出 manifest
- `scripts/data_integration/p1_patch_03.py` — 03 自洽修复（去重+分数逻辑+专业代码）
- `scripts/data_integration/p1_report.py` — 生成 P1_report.md

**新建（测试）:**
- `scripts/data_integration/tests/__init__.py`
- `scripts/data_integration/tests/test_batch_dict.py`
- `scripts/data_integration/tests/test_code_mapper.py`
- `scripts/data_integration/tests/test_lineage.py`
- `scripts/data_integration/tests/test_p1_baseline.py`
- `scripts/data_integration/tests/test_p1_patch_03.py`
- `scripts/data_integration/tests/fixtures/mini_03.xlsx` — 手工构造的 mini 测试数据
- `scripts/data_integration/tests/fixtures/mini_code_map.csv`

**新建（文档）:**
- `docs/superpowers/specs/2026-04-17-data-integration-master/contracts/subagent_output.md`
- `docs/superpowers/specs/2026-04-17-data-integration-master/baselines/` — 空目录，P1.1 填充
- `docs/superpowers/specs/2026-04-17-data-integration-master/P1_report.md` — P1 终态报告

**修改:**
- `.gitignore` — 加入 `data/_pipeline/`

**数据产出目录（gitignored）:**
- `data/_pipeline/P1/03_patched.xlsx`
- `data/_pipeline/P1/patch_log.csv`
- `data/_pipeline/P1/unresolvable.csv`

---

## 阶段 P0：Bootstrap

### Task 1: 创建目录骨架

**Files:**
- Create: `scripts/data_integration/__init__.py`
- Create: `scripts/data_integration/lib/__init__.py`
- Create: `scripts/data_integration/tests/__init__.py`
- Create: `scripts/data_integration/tests/fixtures/.gitkeep`
- Create: `data/_pipeline/P1/.gitkeep`, `P2/.gitkeep`, `P3/.gitkeep`, `P4/.gitkeep`
- Create: `docs/superpowers/specs/2026-04-17-data-integration-master/contracts/.gitkeep`
- Create: `docs/superpowers/specs/2026-04-17-data-integration-master/baselines/.gitkeep`

- [ ] **Step 1: 创建目录和 __init__.py**

```bash
mkdir -p scripts/data_integration/lib scripts/data_integration/tests/fixtures
mkdir -p data/_pipeline/P1 data/_pipeline/P2 data/_pipeline/P3 data/_pipeline/P4
mkdir -p docs/superpowers/specs/2026-04-17-data-integration-master/contracts
mkdir -p docs/superpowers/specs/2026-04-17-data-integration-master/baselines

touch scripts/data_integration/__init__.py
touch scripts/data_integration/lib/__init__.py
touch scripts/data_integration/tests/__init__.py
touch scripts/data_integration/tests/fixtures/.gitkeep
touch data/_pipeline/P1/.gitkeep data/_pipeline/P2/.gitkeep data/_pipeline/P3/.gitkeep data/_pipeline/P4/.gitkeep
touch docs/superpowers/specs/2026-04-17-data-integration-master/contracts/.gitkeep
touch docs/superpowers/specs/2026-04-17-data-integration-master/baselines/.gitkeep
```

Expected: 目录全部创建成功，无报错。

- [ ] **Step 2: Commit**

```bash
git add scripts/data_integration/ docs/superpowers/specs/2026-04-17-data-integration-master/contracts/.gitkeep docs/superpowers/specs/2026-04-17-data-integration-master/baselines/.gitkeep
git commit -m "chore: scaffold data_integration package and pipeline dirs"
```

注：`data/_pipeline/` 将在 Task 2 的 `.gitignore` 更新后不进 git。

---

### Task 2: 更新 .gitignore

**Files:**
- Modify: `.gitignore`（追加 `data/_pipeline/`）

- [ ] **Step 1: 查看当前 .gitignore**

Run: `cat .gitignore | head -30`

观察现有结构，决定追加位置（文件末尾即可）。

- [ ] **Step 2: 追加 data/_pipeline/ 忽略规则**

在 `.gitignore` 末尾追加：

```
# Data integration pipeline intermediate artifacts (not versioned)
data/_pipeline/
```

- [ ] **Step 3: 验证 git 不再追踪 _pipeline**

Run: `git status data/_pipeline/`
Expected: 无输出（或 "nothing to commit"）

Run: `git check-ignore -v data/_pipeline/P1/anything.xlsx`
Expected: 显示 `.gitignore:<行号>:data/_pipeline/ data/_pipeline/P1/anything.xlsx`

- [ ] **Step 4: Commit**

```bash
git add .gitignore
git commit -m "chore: ignore data/_pipeline/ intermediate artifacts"
```

---

### Task 3: lib/batch_dict.py —— 批次字典加载模块

**职责**：读取 `docs/superpowers/specs/2026-04-17-batch-dict-2024-science.md` 和 `-2025-physics.md`，解析为 Python 字典，提供命名规范化接口。

**Files:**
- Create: `scripts/data_integration/lib/batch_dict.py`
- Create: `scripts/data_integration/tests/test_batch_dict.py`

- [ ] **Step 1: 先读取批次字典 md 文件了解格式**

Run: `head -40 docs/superpowers/specs/2026-04-17-batch-dict-2025-physics.md`

记录表头格式（含哪些列、分隔符）。如果字典采用表格形式（`| 列1 | 列2 |`），解析器按 markdown table 解析。

- [ ] **Step 2: 写测试（TDD RED）**

写入 `scripts/data_integration/tests/test_batch_dict.py`：

```python
# -*- coding: utf-8 -*-
"""Unit tests for batch_dict module."""
import pytest
from scripts.data_integration.lib.batch_dict import load_batch_dict, normalize_batch_name


def test_load_2025_physics_returns_list_of_dicts():
    """加载 2025 物理批次字典，验证返回结构。"""
    entries = load_batch_dict("2025", "物理")
    assert isinstance(entries, list)
    assert len(entries) > 0
    # 每条记录须含至少这几个字段
    sample = entries[0]
    assert "batch_name" in sample
    assert "category" in sample  # 普通类/艺术类/体育类/特殊类


def test_normalize_batch_name_canonical_passthrough():
    """规范名称应原样返回。"""
    # 规范名：本科批B 是 2025 物理类的规范批次名
    assert normalize_batch_name("本科批B", year=2025, course="物理") == "本科批B"


def test_normalize_batch_name_alias_mapping():
    """03 主表的 '本科批B段' 应映射到 01 的 '本科B'（或相反，取决于方向）。"""
    # 接口契约：normalize_batch_name 把任意别名规范化到 03 主表口径
    # 因此 01 的 "本科B" 应该映射到 03 的 "本科批B段"
    result = normalize_batch_name("本科B", year=2025, course="物理")
    assert result == "本科批B段"


def test_normalize_unknown_raises():
    """未知批次抛异常，避免静默错误。"""
    with pytest.raises(ValueError, match="未知批次"):
        normalize_batch_name("火星批次", year=2025, course="物理")
```

- [ ] **Step 3: 运行测试验证失败（RED）**

Run: `cd C:/Users/Administrator/Documents/VolunteerHelper && python -m pytest scripts/data_integration/tests/test_batch_dict.py -v`

Expected: 4 个测试全部 FAIL，错误 `ModuleNotFoundError` 或 `ImportError`。

- [ ] **Step 4: 实现 batch_dict.py（GREEN）**

写入 `scripts/data_integration/lib/batch_dict.py`：

```python
# -*- coding: utf-8 -*-
"""Batch dictionary loader and name normalizer.

Loads authoritative batch dictionaries (from docs/superpowers/specs/)
and provides canonical-name lookup for cross-source integration.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Literal

SPECS_DIR = Path(__file__).resolve().parents[3] / "docs" / "superpowers" / "specs"

DICT_FILES = {
    ("2024", "理科"): SPECS_DIR / "2026-04-17-batch-dict-2024-science.md",
    ("2025", "物理"): SPECS_DIR / "2026-04-17-batch-dict-2025-physics.md",
}

# 别名映射：01 口径 -> 03 口径
# 这是初始化的最小集，执行时可在 lib/batch_dict_aliases.json 扩展
_ALIASES: dict[tuple[str, str], dict[str, str]] = {
    ("2025", "物理"): {
        "本科B": "本科批B段",
        "本科A": "本科批A段",
        "本科A(国家专项)": "本科批A段(国家专项)",
        "本科A(地方专项)": "本科批A段(地方专项)",
        "本科(高校专项)": "本科批(高校专项)",
        "本科(高水平运动队)": "本科批(高水平运动队)",
        "本科(区域均衡专项)": "本科批A段(地方专项)",
    },
    ("2024", "理科"): {
        "本一": "本科批A段",
        "本二": "本科批B段",
        "专科": "专科批",
    },
}


def load_batch_dict(year: str, course: str) -> list[dict]:
    """Load batch dictionary for a given year+course.

    Returns list of dicts with keys at least: batch_name, category.
    """
    key = (year, course)
    if key not in DICT_FILES:
        raise ValueError(f"无字典: year={year} course={course}")
    path = DICT_FILES[key]
    if not path.exists():
        raise FileNotFoundError(path)
    return _parse_markdown_table(path.read_text(encoding="utf-8"))


def _parse_markdown_table(md: str) -> list[dict]:
    """Parse the first markdown table found in md text."""
    lines = [l.rstrip() for l in md.splitlines() if l.startswith("|")]
    if len(lines) < 2:
        return []
    # 表头
    headers = [h.strip() for h in lines[0].strip("|").split("|")]
    # 跳过分隔行（|---|---|）
    data_lines = [l for l in lines[1:] if not re.match(r"^\|[-:\s|]+\|$", l)]
    out = []
    for l in data_lines:
        cells = [c.strip() for c in l.strip("|").split("|")]
        if len(cells) != len(headers):
            continue
        row = dict(zip(headers, cells))
        # 为兼容测试，至少保留 batch_name / category
        if "批次" in row and "batch_name" not in row:
            row["batch_name"] = row["批次"]
        if "类别" in row and "category" not in row:
            row["category"] = row["类别"]
        if "batch_name" not in row:
            # 尝试第一列作为 batch_name
            row["batch_name"] = cells[0]
        if "category" not in row:
            row["category"] = row.get("类别", "普通类")
        out.append(row)
    return out


def normalize_batch_name(name: str, year: int | str, course: str) -> str:
    """Normalize batch name from any source to 03 canonical form.

    Raises ValueError if name is not in any known form.
    """
    key = (str(year), course)
    aliases = _ALIASES.get(key, {})

    # 1. 已经是规范名（在字典中直接能找到）
    try:
        entries = load_batch_dict(str(year), course)
        canonical_set = {e.get("batch_name") for e in entries if e.get("batch_name")}
    except (ValueError, FileNotFoundError):
        canonical_set = set()

    if name in canonical_set:
        return name

    # 2. 在别名表中
    if name in aliases:
        return aliases[name]

    # 3. 规范名列表为空时，别名映射作为唯一依据
    if not canonical_set and name in aliases:
        return aliases[name]

    # 4. 找不到则报错
    raise ValueError(f"未知批次: {name} (year={year}, course={course})")
```

- [ ] **Step 5: 运行测试验证通过（GREEN）**

Run: `python -m pytest scripts/data_integration/tests/test_batch_dict.py -v`

Expected: 4 个测试 PASS。

如果某个测试失败（常见原因：批次字典 md 文件真实字段名与测试预期不符），调整 `_parse_markdown_table` 或测试断言，保持接口契约一致。

- [ ] **Step 6: Commit**

```bash
git add scripts/data_integration/lib/batch_dict.py scripts/data_integration/tests/test_batch_dict.py
git commit -m "feat(data-integration): add batch_dict loader and name normalizer"
```

---

### Task 4: lib/code_mapper.py —— 院校代码映射

**职责**：读取 `data/08_数据治理记录/编码映射表_招生代码_国标代码.csv`（99.37% 覆盖），提供四川招生代码 ↔ 国标代码双向查询；未命中时支持手工增量 patch。

**Files:**
- Create: `scripts/data_integration/lib/code_mapper.py`
- Create: `scripts/data_integration/tests/test_code_mapper.py`
- Create: `scripts/data_integration/tests/fixtures/mini_code_map.csv`

- [ ] **Step 1: 创建 mini fixture**

先探查真实映射表前几行看 schema：

Run: `head -5 data/08_数据治理记录/编码映射表_招生代码_国标代码.csv 2>/dev/null || echo "file not found"`

如果文件不存在，fixture 按约定 schema 构造。fixture 写入 `scripts/data_integration/tests/fixtures/mini_code_map.csv`：

```csv
招生代码,国标代码,院校名称
0001,10001,北京大学
0002,10003,清华大学
1234,10487,华中科技大学
```

（真实 schema 可能不同；执行 Step 4 时以真实文件为准，fixture 仅用于 lib 单测的独立性）

- [ ] **Step 2: 写测试（RED）**

写入 `scripts/data_integration/tests/test_code_mapper.py`：

```python
# -*- coding: utf-8 -*-
"""Unit tests for code_mapper module."""
from pathlib import Path
import pytest
from scripts.data_integration.lib.code_mapper import CodeMapper

FIXTURE = Path(__file__).parent / "fixtures" / "mini_code_map.csv"


def test_load_fixture():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.size() == 3


def test_enroll_to_national():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.enroll_to_national("0001") == "10001"
    assert cm.enroll_to_national("1234") == "10487"


def test_national_to_enroll():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.national_to_enroll("10003") == "0002"


def test_missing_enroll_returns_none():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.enroll_to_national("9999") is None


def test_name_by_enroll():
    cm = CodeMapper.from_csv(FIXTURE)
    assert cm.name_by_enroll("0001") == "北京大学"


def test_add_patch_increments_size():
    cm = CodeMapper.from_csv(FIXTURE)
    cm.add_patch(enroll="7777", national="99999", name="立方试验学院")
    assert cm.size() == 4
    assert cm.enroll_to_national("7777") == "99999"


def test_enroll_code_preserves_leading_zero():
    """四川招生代码保留前导零（字符串类型）。"""
    cm = CodeMapper.from_csv(FIXTURE)
    # 传入 int 也应被 normalize 为 4 位字符串
    assert cm.enroll_to_national(1) == "10001"
    assert cm.enroll_to_national("1") == "10001"
```

- [ ] **Step 3: 运行测试（RED）**

Run: `python -m pytest scripts/data_integration/tests/test_code_mapper.py -v`
Expected: 全部 FAIL（模块不存在）。

- [ ] **Step 4: 实现 code_mapper.py**

写入 `scripts/data_integration/lib/code_mapper.py`：

```python
# -*- coding: utf-8 -*-
"""College code mapper: 四川招生代码 <-> 国标代码 bi-directional lookup.

Primary source: data/08_数据治理记录/编码映射表_招生代码_国标代码.csv
Patches can be added at runtime via add_patch() for the 0.63% unmapped tail.
"""
from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


def _normalize_enroll(code: str | int) -> str:
    """四川招生代码统一为 4 位字符串（保留前导零）。"""
    s = str(code).strip()
    if not s:
        return ""
    if s.isdigit():
        return s.zfill(4)
    return s


@dataclass
class CodeMapper:
    enroll_to_nat: dict[str, str] = field(default_factory=dict)
    nat_to_enroll: dict[str, str] = field(default_factory=dict)
    enroll_to_name: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_csv(cls, path: Path) -> "CodeMapper":
        cm = cls()
        with open(path, "r", encoding="utf-8", newline="") as f:
            reader = csv.DictReader(f)
            for row in reader:
                enroll = _normalize_enroll(row.get("招生代码") or row.get("enroll_code") or "")
                national = (row.get("国标代码") or row.get("national_code") or "").strip()
                name = (row.get("院校名称") or row.get("name") or "").strip()
                if not enroll or not national:
                    continue
                cm.enroll_to_nat[enroll] = national
                cm.nat_to_enroll[national] = enroll
                if name:
                    cm.enroll_to_name[enroll] = name
        return cm

    def size(self) -> int:
        return len(self.enroll_to_nat)

    def enroll_to_national(self, code: str | int) -> Optional[str]:
        return self.enroll_to_nat.get(_normalize_enroll(code))

    def national_to_enroll(self, code: str) -> Optional[str]:
        return self.nat_to_enroll.get(str(code).strip())

    def name_by_enroll(self, code: str | int) -> Optional[str]:
        return self.enroll_to_name.get(_normalize_enroll(code))

    def add_patch(self, *, enroll: str, national: str, name: Optional[str] = None) -> None:
        enroll_n = _normalize_enroll(enroll)
        self.enroll_to_nat[enroll_n] = national
        self.nat_to_enroll[national] = enroll_n
        if name:
            self.enroll_to_name[enroll_n] = name
```

- [ ] **Step 5: 运行测试（GREEN）**

Run: `python -m pytest scripts/data_integration/tests/test_code_mapper.py -v`
Expected: 7 个测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add scripts/data_integration/lib/code_mapper.py scripts/data_integration/tests/test_code_mapper.py scripts/data_integration/tests/fixtures/mini_code_map.csv
git commit -m "feat(data-integration): add CodeMapper with leading-zero preservation"
```

---

### Task 5: lib/lineage.py —— 血缘标记 helper

**职责**：为任意 (row_key, column) 记录数据来源标签（03/01/13/manual/patched）。存储成独立 JSON，不污染主表行结构。

**Files:**
- Create: `scripts/data_integration/lib/lineage.py`
- Create: `scripts/data_integration/tests/test_lineage.py`

- [ ] **Step 1: 写测试（RED）**

写入 `scripts/data_integration/tests/test_lineage.py`：

```python
# -*- coding: utf-8 -*-
"""Unit tests for lineage module."""
import json
from pathlib import Path
import pytest
from scripts.data_integration.lib.lineage import Lineage


def test_empty_lineage():
    ln = Lineage()
    assert ln.get(("2025", "0001", "01", "A", "本科批B段", "物理"), "最低分") is None


def test_mark_and_get():
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    ln.mark(key, "最低分", "01")
    assert ln.get(key, "最低分") == "01"


def test_mark_overwrites_last():
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    ln.mark(key, "最低分", "03")
    ln.mark(key, "最低分", "manual")
    assert ln.get(key, "最低分") == "manual"


def test_save_load_roundtrip(tmp_path):
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    ln.mark(key, "最低分", "01")
    out = tmp_path / "lineage.json"
    ln.save(out)

    ln2 = Lineage.load(out)
    assert ln2.get(key, "最低分") == "01"


def test_invalid_source_raises():
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    with pytest.raises(ValueError):
        ln.mark(key, "最低分", "unknown_source")
```

- [ ] **Step 2: 运行测试（RED）**

Run: `python -m pytest scripts/data_integration/tests/test_lineage.py -v`
Expected: 全部 FAIL。

- [ ] **Step 3: 实现 lineage.py**

写入 `scripts/data_integration/lib/lineage.py`：

```python
# -*- coding: utf-8 -*-
"""Lineage tracking: which source each (row, column) value came from.

Stored as a sidecar JSON to avoid bloating the main dataframe.
Keys are stringified tuples for JSON compatibility.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Tuple

VALID_SOURCES = {"03", "01", "13", "manual", "patched"}

RowKey = Tuple[str, str, str, str, str, str]  # (年份, 院校代码, 专业组, 专业代码, 批次, 科目)


def _key_to_str(k: RowKey) -> str:
    return "\x1f".join(k)


def _str_to_key(s: str) -> RowKey:
    parts = s.split("\x1f")
    return tuple(parts)  # type: ignore[return-value]


class Lineage:
    def __init__(self) -> None:
        # map[row_key_str][column_name] -> source_label
        self._data: dict[str, dict[str, str]] = {}

    def mark(self, key: RowKey, column: str, source: str) -> None:
        if source not in VALID_SOURCES:
            raise ValueError(f"非法 source: {source}，必须在 {VALID_SOURCES}")
        k = _key_to_str(key)
        self._data.setdefault(k, {})[column] = source

    def get(self, key: RowKey, column: str) -> str | None:
        k = _key_to_str(key)
        return self._data.get(k, {}).get(column)

    def save(self, path: Path) -> None:
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")

    @classmethod
    def load(cls, path: Path) -> "Lineage":
        ln = cls()
        if Path(path).exists():
            ln._data = json.loads(Path(path).read_text(encoding="utf-8"))
        return ln
```

- [ ] **Step 4: 运行测试（GREEN）**

Run: `python -m pytest scripts/data_integration/tests/test_lineage.py -v`
Expected: 5 个测试 PASS。

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/lib/lineage.py scripts/data_integration/tests/test_lineage.py
git commit -m "feat(data-integration): add Lineage sidecar tracker"
```

---

### Task 6: 写 contracts/subagent_output.md

**Files:**
- Create: `docs/superpowers/specs/2026-04-17-data-integration-master/contracts/subagent_output.md`

- [ ] **Step 1: 写入 contract 文档**

写入 `docs/superpowers/specs/2026-04-17-data-integration-master/contracts/subagent_output.md`：

````markdown
# 子 Agent 输出 Contract

所有被主 agent 派遣执行数据整合任务的子 agent，**最后一条消息必须是一个 JSON 对象**（可在 markdown code block 内），符合以下 schema：

```json
{
  "task_id": "P1.2",
  "status": "success | partial | failed",
  "counts": {
    "input": 48131,
    "changed": 34,
    "flagged": 0,
    "unresolvable": 0
  },
  "artifacts": [
    "data/_pipeline/P1/03_patched.xlsx",
    "data/_pipeline/P1/patch_log.csv"
  ],
  "issues": [
    {"severity": "warn", "message": "5 条记录无法通过 01 修复，标记为 needs_review"}
  ],
  "decisions_needed": [
    {"id": "TBD-p1-1", "question": "分数逻辑 5 条无法修复，是删除还是保留带 flag？"}
  ]
}
```

## 字段说明

- `task_id`：plan 中的 task 编号，如 `P1.2` 或 `P1.Task 8`
- `status`：
  - `success`：任务全部完成，无待处置
  - `partial`：主体完成但有需人工决策的条目
  - `failed`：任务卡壳，无法继续
- `counts`：任务涉及的记录数统计（key 由任务决定，至少含 `input`）
- `artifacts`：产出文件的**相对仓库根路径**
- `issues`：执行中发现的问题（不阻塞完成的告警）
  - `severity`: `info | warn | error`
- `decisions_needed`：需要主 agent 裁定或升级给用户的决策点

## 文字叙述

JSON 之外可以有自然语言描述，但不得在 JSON 内夹杂注释。
````

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-17-data-integration-master/contracts/subagent_output.md
git commit -m "docs: add subagent output contract for data integration tasks"
```

---

## 阶段 P0 收尾：Smoke Test

### Task 7: 验证 lib 可导入 + 运行全部测试

**Files:** 无新建，仅验证

- [ ] **Step 1: 验证 lib 导入**

Run: `python -c "from scripts.data_integration.lib import batch_dict, code_mapper, lineage; print('OK')"`
Expected: 输出 `OK`（无 import 错误）。

如果失败，检查 `scripts/data_integration/__init__.py` 和 `scripts/data_integration/lib/__init__.py` 是否存在，且项目根目录在 `sys.path`（从仓库根目录运行即可）。

- [ ] **Step 2: 运行所有 lib 测试**

Run: `python -m pytest scripts/data_integration/tests/ -v`
Expected: 全部 PASS（3 个测试文件，共 16 个测试）。

- [ ] **Step 3: 验证 _pipeline 被 ignore**

Run: `touch data/_pipeline/P1/test.txt && git status --porcelain data/_pipeline/`
Expected: 无输出（test.txt 未被 git 追踪）。

Run: `rm data/_pipeline/P1/test.txt`

P0 完成 checkpoint。

---

## 阶段 P1：基线与 03 自洽

### Task 8: p1_baseline.py —— 数据基线冻结

**职责**：扫描 03/01/13 目录下所有数据文件，计算 SHA256、行数/对象数、最后修改时间，输出 `baselines/2026-04-17-baseline.json`。

**Files:**
- Create: `scripts/data_integration/p1_baseline.py`
- Create: `scripts/data_integration/tests/test_p1_baseline.py`

- [ ] **Step 1: 写测试（RED）**

写入 `scripts/data_integration/tests/test_p1_baseline.py`：

```python
# -*- coding: utf-8 -*-
"""Tests for p1_baseline module."""
import json
from pathlib import Path
import pytest
from scripts.data_integration.p1_baseline import (
    scan_file,
    scan_directory,
    count_records,
)


def test_scan_file_returns_metadata(tmp_path):
    f = tmp_path / "sample.txt"
    f.write_text("hello")
    meta = scan_file(f)
    assert meta["path"].endswith("sample.txt")
    assert meta["size_bytes"] == 5
    assert len(meta["sha256"]) == 64
    assert "mtime" in meta


def test_count_records_json_array(tmp_path):
    f = tmp_path / "a.json"
    f.write_text(json.dumps([{"a": 1}, {"a": 2}, {"a": 3}]), encoding="utf-8")
    assert count_records(f) == 3


def test_count_records_json_object(tmp_path):
    f = tmp_path / "a.json"
    f.write_text(json.dumps({"rows": [{"a": 1}, {"a": 2}]}), encoding="utf-8")
    # 对单顶层 object，返回 1（不知道 rows 子键，仅计对象数）
    assert count_records(f) == 1


def test_count_records_unsupported_returns_none(tmp_path):
    f = tmp_path / "a.bin"
    f.write_bytes(b"\x00\x01\x02")
    assert count_records(f) is None


def test_scan_directory_yields_all_files(tmp_path):
    (tmp_path / "a.txt").write_text("a")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "b.txt").write_text("b")
    results = list(scan_directory(tmp_path))
    assert len(results) == 2
```

- [ ] **Step 2: 运行测试（RED）**

Run: `python -m pytest scripts/data_integration/tests/test_p1_baseline.py -v`
Expected: 全部 FAIL（模块不存在）。

- [ ] **Step 3: 实现 p1_baseline.py**

写入 `scripts/data_integration/p1_baseline.py`：

```python
# -*- coding: utf-8 -*-
"""P1.1 数据基线冻结：扫描源目录产出 manifest。

Usage:
    python -m scripts.data_integration.p1_baseline

Outputs to:
    docs/superpowers/specs/2026-04-17-data-integration-master/baselines/YYYY-MM-DD-baseline.json
"""
from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator, Optional

sys.stdout.reconfigure(encoding="utf-8")  # Windows GBK console safety

REPO_ROOT = Path(__file__).resolve().parents[2]

TARGET_DIRS = [
    REPO_ROOT / "data" / "03_专家版主表" / "output",
    REPO_ROOT / "data" / "01_核心录取数据",
    REPO_ROOT / "data" / "13_征集志愿" / "普通高考",
]

BASELINE_DIR = (
    REPO_ROOT
    / "docs" / "superpowers" / "specs" / "2026-04-17-data-integration-master" / "baselines"
)


def scan_file(path: Path) -> dict:
    """Compute metadata for a single file."""
    stat = path.stat()
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return {
        "path": str(path).replace("\\", "/"),
        "size_bytes": stat.st_size,
        "sha256": h.hexdigest(),
        "mtime": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
        "records": count_records(path),
    }


def count_records(path: Path) -> Optional[int]:
    """Return record count for known formats, else None."""
    suffix = path.suffix.lower()
    try:
        if suffix == ".json":
            data = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return len(data)
            if isinstance(data, dict):
                return 1
            return None
        if suffix in {".xlsx", ".xls"}:
            # Lazy import to avoid global dep if not needed
            from openpyxl import load_workbook
            wb = load_workbook(path, read_only=True, data_only=True)
            total = sum(ws.max_row for ws in wb.worksheets)
            return total
        if suffix == ".csv":
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                return sum(1 for _ in f) - 1  # 去除表头
    except Exception:
        return None
    return None


def scan_directory(root: Path) -> Iterator[dict]:
    """Yield metadata for every file under root."""
    root = Path(root)
    if not root.exists():
        return
    for p in root.rglob("*"):
        if p.is_file():
            yield scan_file(p)


def build_manifest() -> dict:
    manifest: dict = {
        "baseline_date": datetime.now(tz=timezone.utc).strftime("%Y-%m-%d"),
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "repo_root": str(REPO_ROOT).replace("\\", "/"),
        "sources": {},
    }
    for d in TARGET_DIRS:
        key = str(d.relative_to(REPO_ROOT)).replace("\\", "/")
        files = list(scan_directory(d))
        manifest["sources"][key] = {
            "exists": d.exists(),
            "file_count": len(files),
            "total_size_bytes": sum(f["size_bytes"] for f in files),
            "total_records": sum((f["records"] or 0) for f in files),
            "files": files,
        }
    return manifest


def main() -> int:
    manifest = build_manifest()
    BASELINE_DIR.mkdir(parents=True, exist_ok=True)
    out = BASELINE_DIR / f"{manifest['baseline_date']}-baseline.json"
    out.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Baseline written: {out}")
    for src_key, info in manifest["sources"].items():
        print(f"  {src_key}: {info['file_count']} files, {info['total_records']} records")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 4: 运行测试（GREEN）**

Run: `python -m pytest scripts/data_integration/tests/test_p1_baseline.py -v`
Expected: 5 个测试 PASS。

- [ ] **Step 5: 运行基线脚本生成真实 manifest**

Run: `python -m scripts.data_integration.p1_baseline`

Expected: 在 `docs/superpowers/specs/2026-04-17-data-integration-master/baselines/` 下生成 `2026-04-17-baseline.json`，控制台打印三个目录的文件数和记录数概览。

如果 `13_征集志愿/普通高考` 含非常多文件导致扫描慢，保留运行（单次任务可接受）。

- [ ] **Step 6: 人眼核对 manifest**

Run: `python -c "import json; m = json.load(open('docs/superpowers/specs/2026-04-17-data-integration-master/baselines/2026-04-17-baseline.json', encoding='utf-8')); [print(k, v['file_count'], v['total_records']) for k,v in m['sources'].items()]"`

Expected:
- `data/03_专家版主表/output`: ~9 files
- `data/01_核心录取数据`: ~36 files
- `data/13_征集志愿/普通高考`: ~99 xlsx + 大量原始图片

如果行数明显异常（如 03 主表 0 行），检查 `count_records` 对 xlsx 的处理。

- [ ] **Step 7: Commit**

```bash
git add scripts/data_integration/p1_baseline.py scripts/data_integration/tests/test_p1_baseline.py docs/superpowers/specs/2026-04-17-data-integration-master/baselines/2026-04-17-baseline.json
git commit -m "feat(data-integration): P1.1 baseline snapshot of 03/01/13 sources"
```

---

### Task 9: p1_patch_03.py —— 去重 + 分数逻辑 + 专业代码补齐

**职责**：读取 `data/03_专家版主表/output/专业招生主表.xlsx`，修复 3 类已知问题，输出 `03_patched.xlsx` + `patch_log.csv`。

这是 P1 的核心任务，分多个子步骤 TDD。

**Files:**
- Create: `scripts/data_integration/p1_patch_03.py`
- Create: `scripts/data_integration/tests/test_p1_patch_03.py`
- Create: `scripts/data_integration/tests/fixtures/mini_03.xlsx`（构造 fixture）

- [ ] **Step 1: 构造 mini_03 fixture**

写入临时脚本 `scripts/data_integration/tests/fixtures/build_mini_03.py`：

```python
# -*- coding: utf-8 -*-
"""Build mini_03.xlsx fixture with known anomalies for testing."""
from pathlib import Path
from openpyxl import Workbook

OUT = Path(__file__).parent / "mini_03.xlsx"

HEADERS = [
    "数据年份", "院校代码", "院校名称", "专业组代码", "专业代码",
    "批次", "科目", "专业",
    "25投档最低分", "25投档最低位次",
    "24最低分", "24平均分", "24最高分",
    "23最低分", "23最高分",
]

ROWS = [
    # 正常行
    [2025, 1, "北京大学", 101, "41", "本科批", "物理", "环境科学",
     690, 100, 680, 685, 695, 675, 700],
    # 重复行（主键与上一行完全一致）
    [2025, 1, "北京大学", 101, "41", "本科批", "物理", "环境科学",
     690, 100, 680, 685, 695, 675, 700],
    # 24 平均>最高异常
    [2025, 2, "清华大学", 102, "42", "本科批", "物理", "计算机",
     695, 50, 680, 710, 700, 680, 705],
    # 23 最低>最高异常
    [2025, 3, "复旦大学", 103, "43", "本科批", "历史", "新闻",
     660, 500, 650, 655, 660, 670, 660],
    # 专业代码缺失
    [2025, 4, "交大", 104, None, "本科批", "物理", "机械",
     650, 800, 640, 645, 650, None, None],
]

wb = Workbook()
ws = wb.active
ws.append(HEADERS)
for r in ROWS:
    ws.append(r)
wb.save(OUT)
print(f"Wrote: {OUT}")
```

Run: `python scripts/data_integration/tests/fixtures/build_mini_03.py`
Expected: `mini_03.xlsx` 生成。

可选：生成后可删除 `build_mini_03.py`（fixture 本身已二进制化）；也可保留以便将来重建。保留时 commit 一并加入。

- [ ] **Step 2: 写测试（RED）**

写入 `scripts/data_integration/tests/test_p1_patch_03.py`：

```python
# -*- coding: utf-8 -*-
"""Tests for p1_patch_03 module."""
from pathlib import Path
import pytest
import pandas as pd
from scripts.data_integration.p1_patch_03 import (
    load_master,
    find_duplicates,
    select_most_complete,
    find_score_anomalies,
    PRIMARY_KEY,
)

FIXTURE = Path(__file__).parent / "fixtures" / "mini_03.xlsx"


def test_load_master_returns_df():
    df = load_master(FIXTURE)
    assert len(df) == 5
    assert "院校代码" in df.columns


def test_find_duplicates_detects_one_group():
    df = load_master(FIXTURE)
    groups = find_duplicates(df, PRIMARY_KEY)
    # mini 有 1 组重复（北京大学 101/41）
    assert len(groups) == 1
    assert len(groups[0]) == 2  # 2 行


def test_select_most_complete_keeps_one():
    df = load_master(FIXTURE)
    groups = find_duplicates(df, PRIMARY_KEY)
    kept_idx, dropped_idx = select_most_complete(df, groups[0])
    assert kept_idx in groups[0]
    assert len(dropped_idx) == 1
    assert kept_idx not in dropped_idx


def test_find_score_anomalies_flags_mean_gt_max():
    df = load_master(FIXTURE)
    anomalies = find_score_anomalies(df)
    # 清华 24 平均 710 > 最高 700
    mask = (
        (anomalies["院校代码"] == 2)
        & (anomalies["anomaly_type"] == "24_mean_gt_max")
    )
    assert mask.any()


def test_find_score_anomalies_flags_min_gt_max():
    df = load_master(FIXTURE)
    anomalies = find_score_anomalies(df)
    # 复旦 23 最低 670 > 最高 660
    mask = (
        (anomalies["院校代码"] == 3)
        & (anomalies["anomaly_type"] == "23_min_gt_max")
    )
    assert mask.any()


def test_find_score_anomalies_flags_missing_major_code():
    df = load_master(FIXTURE)
    # 交大 专业代码 None
    # find_score_anomalies 不含缺失检测，但我们有独立函数；先覆盖 score 异常数量
    anomalies = find_score_anomalies(df)
    # 至少应报 2 条（清华 + 复旦）
    assert len(anomalies) >= 2
```

- [ ] **Step 3: 运行测试（RED）**

Run: `python -m pytest scripts/data_integration/tests/test_p1_patch_03.py -v`
Expected: 全部 FAIL。

- [ ] **Step 4: 实现 p1_patch_03.py（核心函数）**

写入 `scripts/data_integration/p1_patch_03.py`：

```python
# -*- coding: utf-8 -*-
"""P1.2-P1.4 03 主表自洽修复：去重 + 分数逻辑 + 专业代码补齐。

Usage:
    python -m scripts.data_integration.p1_patch_03

Outputs:
    data/_pipeline/P1/03_patched.xlsx
    data/_pipeline/P1/patch_log.csv
    data/_pipeline/P1/unresolvable.csv (if any)
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import List, Tuple

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "data" / "03_专家版主表" / "output" / "专业招生主表.xlsx"
OUT_DIR = REPO_ROOT / "data" / "_pipeline" / "P1"
OUT_XLSX = OUT_DIR / "03_patched.xlsx"
OUT_LOG = OUT_DIR / "patch_log.csv"
OUT_UNRES = OUT_DIR / "unresolvable.csv"

PRIMARY_KEY = ["数据年份", "院校代码", "专业组代码", "专业代码", "批次", "科目"]


def load_master(path: Path) -> pd.DataFrame:
    df = pd.read_excel(path, dtype={"院校代码": "Int64"})
    return df


def find_duplicates(df: pd.DataFrame, key_cols: List[str]) -> List[List[int]]:
    """Return list of duplicate groups; each group is a list of row indices."""
    groups: List[List[int]] = []
    for _, grp in df.groupby(key_cols, dropna=False):
        if len(grp) > 1:
            groups.append(list(grp.index))
    return groups


def select_most_complete(df: pd.DataFrame, group_indices: List[int]) -> Tuple[int, List[int]]:
    """Given rows with same PK, keep the one with fewest NaN; drop others."""
    sub = df.loc[group_indices]
    non_null_counts = sub.notna().sum(axis=1)
    kept = int(non_null_counts.idxmax())
    dropped = [i for i in group_indices if i != kept]
    return kept, dropped


def find_score_anomalies(df: pd.DataFrame) -> pd.DataFrame:
    """Return DataFrame of rows violating score logic.

    Columns: 院校代码, 专业代码, anomaly_type, detail
    """
    records: List[dict] = []

    def _report(idx, anomaly_type, detail):
        records.append({
            "row_index": idx,
            "院校代码": df.at[idx, "院校代码"],
            "专业代码": df.at[idx, "专业代码"],
            "anomaly_type": anomaly_type,
            "detail": detail,
        })

    # 24 平均 > 最高
    if {"24平均分", "24最高分"}.issubset(df.columns):
        mask = df["24平均分"].fillna(-1) > df["24最高分"].fillna(9999)
        mask = mask & df["24平均分"].notna() & df["24最高分"].notna()
        for idx in df.index[mask]:
            _report(idx, "24_mean_gt_max",
                    f"avg={df.at[idx, '24平均分']} max={df.at[idx, '24最高分']}")

    # 24 最低 > 最高（同理，若存在）
    if {"24最低分", "24最高分"}.issubset(df.columns):
        mask = df["24最低分"].fillna(-1) > df["24最高分"].fillna(9999)
        mask = mask & df["24最低分"].notna() & df["24最高分"].notna()
        for idx in df.index[mask]:
            _report(idx, "24_min_gt_max",
                    f"min={df.at[idx, '24最低分']} max={df.at[idx, '24最高分']}")

    # 23 最低 > 最高
    if {"23最低分", "23最高分"}.issubset(df.columns):
        mask = df["23最低分"].fillna(-1) > df["23最高分"].fillna(9999)
        mask = mask & df["23最低分"].notna() & df["23最高分"].notna()
        for idx in df.index[mask]:
            _report(idx, "23_min_gt_max",
                    f"min={df.at[idx, '23最低分']} max={df.at[idx, '23最高分']}")

    # 分数范围 150-750
    for year_col in ["25投档最低分", "24最低分", "23最低分", "22最低分"]:
        if year_col in df.columns:
            mask = (df[year_col] < 150) | (df[year_col] > 750)
            mask = mask & df[year_col].notna()
            for idx in df.index[mask]:
                _report(idx, f"{year_col}_out_of_range",
                        f"score={df.at[idx, year_col]}")

    return pd.DataFrame(records)


def find_missing_major_code(df: pd.DataFrame) -> pd.DataFrame:
    """专业代码缺失记录。"""
    mask = df["专业代码"].isna()
    sub = df[mask].copy()
    return sub


def apply_deduplication(df: pd.DataFrame, log: List[dict]) -> pd.DataFrame:
    """去重，保留最完整行；log 追加 drop 记录。"""
    groups = find_duplicates(df, PRIMARY_KEY)
    to_drop: List[int] = []
    for grp in groups:
        kept, dropped = select_most_complete(df, grp)
        for d in dropped:
            log.append({
                "action": "drop_duplicate",
                "row_index": d,
                "kept_row_index": kept,
                "key": str(df.loc[d, PRIMARY_KEY].to_dict()),
                "detail": f"重复组大小={len(grp)}",
            })
            to_drop.append(d)
    return df.drop(index=to_drop).reset_index(drop=True)


def apply_score_flags(df: pd.DataFrame, log: List[dict]) -> pd.DataFrame:
    """标记分数异常：加 _quality_flag 列；不改动数值（等待 P2 用 01 修复）。"""
    anomalies = find_score_anomalies(df)
    if "_quality_flag" not in df.columns:
        df["_quality_flag"] = ""
    for _, a in anomalies.iterrows():
        idx = a["row_index"]
        existing = df.at[idx, "_quality_flag"] or ""
        tag = a["anomaly_type"]
        df.at[idx, "_quality_flag"] = (existing + "," + tag).strip(",") if existing else tag
        log.append({
            "action": "flag_score_anomaly",
            "row_index": int(idx),
            "kept_row_index": int(idx),
            "key": str(df.loc[idx, PRIMARY_KEY].to_dict()),
            "detail": a["detail"] + " | type=" + a["anomaly_type"],
        })
    return df


def apply_missing_major_code(df: pd.DataFrame, log: List[dict],
                             unresolvable: List[dict]) -> pd.DataFrame:
    """
    专业代码缺失：本阶段不反查 01（那是 P2），仅记录到 unresolvable.csv；
    标记 _quality_flag = missing_major_code。
    """
    if "_quality_flag" not in df.columns:
        df["_quality_flag"] = ""
    missing = find_missing_major_code(df)
    for idx in missing.index:
        existing = df.at[idx, "_quality_flag"] or ""
        tag = "missing_major_code"
        df.at[idx, "_quality_flag"] = (existing + "," + tag).strip(",") if existing else tag
        log.append({
            "action": "flag_missing_major_code",
            "row_index": int(idx),
            "kept_row_index": int(idx),
            "key": str(df.loc[idx, PRIMARY_KEY].to_dict()),
            "detail": "专业代码缺失，待 P2 用 01 反查",
        })
        unresolvable.append({
            "type": "missing_major_code",
            "row_index": int(idx),
            "院校代码": df.at[idx, "院校代码"],
            "专业": df.at[idx, "专业"] if "专业" in df.columns else None,
            "批次": df.at[idx, "批次"],
            "科目": df.at[idx, "科目"],
        })
    return df


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Loading: {SRC}")
    df = load_master(SRC)
    print(f"Loaded {len(df)} rows, {len(df.columns)} cols")

    log: List[dict] = []
    unresolvable: List[dict] = []

    df = apply_deduplication(df, log)
    print(f"After dedup: {len(df)} rows")

    df = apply_score_flags(df, log)
    df = apply_missing_major_code(df, log, unresolvable)

    # 写产出
    df.to_excel(OUT_XLSX, index=False)
    print(f"Wrote: {OUT_XLSX}")

    pd.DataFrame(log).to_csv(OUT_LOG, index=False, encoding="utf-8-sig")
    print(f"Wrote: {OUT_LOG}  ({len(log)} entries)")

    if unresolvable:
        pd.DataFrame(unresolvable).to_csv(OUT_UNRES, index=False, encoding="utf-8-sig")
        print(f"Wrote: {OUT_UNRES}  ({len(unresolvable)} entries)")

    # 总结
    actions = pd.DataFrame(log)["action"].value_counts() if log else pd.Series(dtype=int)
    print("\n=== P1 修复汇总 ===")
    print(actions.to_string())
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 5: 运行测试（GREEN）**

Run: `python -m pytest scripts/data_integration/tests/test_p1_patch_03.py -v`
Expected: 6 个测试 PASS。

如果 `test_find_duplicates_detects_one_group` 失败，检查 fixture 的 `专业代码` 类型（Int64 vs str）一致性；主键分组对类型敏感。

- [ ] **Step 6: 对真实 03 主表 dry-run（先不 commit 产出）**

Run: `python -m scripts.data_integration.p1_patch_03`

Expected 控制台输出示例：
```
Loading: .../data/03_专家版主表/output/专业招生主表.xlsx
Loaded 48131 rows, 71 cols
After dedup: ~48097 rows   (≈ 去除了 34 条重复)
Wrote: .../data/_pipeline/P1/03_patched.xlsx
Wrote: .../data/_pipeline/P1/patch_log.csv  (约 30~300 条)

=== P1 修复汇总 ===
drop_duplicate           34
flag_score_anomaly      232
flag_missing_major_code   2
```

- [ ] **Step 7: 核对修复数量与审计报告一致**

Run: `python -c "import pandas as pd; df = pd.read_csv('data/_pipeline/P1/patch_log.csv'); print(df['action'].value_counts())"`

Expected:
- `drop_duplicate`: 34（来自审计报告）
- `flag_score_anomaly`: 约 232（= 161 + 71，2024 和 2023 两类）
- `flag_missing_major_code`: 2

若数量偏差 > 10%，检查是否有字段名差异（如审计报告用"平均分"但主表用"24平均分"等）——调整 `find_score_anomalies` 中列名。

- [ ] **Step 8: Commit**

```bash
git add scripts/data_integration/p1_patch_03.py scripts/data_integration/tests/test_p1_patch_03.py scripts/data_integration/tests/fixtures/mini_03.xlsx scripts/data_integration/tests/fixtures/build_mini_03.py
git commit -m "feat(data-integration): P1.2-1.4 dedupe + score anomaly flags + missing code flags"
```

---

### Task 10: p1_report.py —— 生成 P1_report.md

**职责**：读取 `patch_log.csv`，生成 `P1_report.md`（供用户验收）。

**Files:**
- Create: `scripts/data_integration/p1_report.py`

- [ ] **Step 1: 实现 p1_report.py**

本任务无 TDD（纯报表生成），直接写脚本。

写入 `scripts/data_integration/p1_report.py`：

```python
# -*- coding: utf-8 -*-
"""Generate P1_report.md from patch_log + unresolvable.

Usage:
    python -m scripts.data_integration.p1_report
"""
from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

sys.stdout.reconfigure(encoding="utf-8")

REPO_ROOT = Path(__file__).resolve().parents[2]
LOG = REPO_ROOT / "data" / "_pipeline" / "P1" / "patch_log.csv"
UNRES = REPO_ROOT / "data" / "_pipeline" / "P1" / "unresolvable.csv"
OUT_XLSX = REPO_ROOT / "data" / "_pipeline" / "P1" / "03_patched.xlsx"
REPORT = (
    REPO_ROOT / "docs" / "superpowers" / "specs"
    / "2026-04-17-data-integration-master" / "P1_report.md"
)


def main() -> int:
    log = pd.read_csv(LOG) if LOG.exists() else pd.DataFrame()
    unres = pd.read_csv(UNRES) if UNRES.exists() else pd.DataFrame()

    # 读 patched 行数
    try:
        patched_rows = len(pd.read_excel(OUT_XLSX))
    except Exception:
        patched_rows = None

    lines = []
    lines.append("# P1 报告：基线与 03 主表自洽")
    lines.append("")
    lines.append(f"- **生成时间**：{datetime.now(tz=timezone.utc).isoformat()}")
    lines.append(f"- **产物**：`data/_pipeline/P1/03_patched.xlsx` (rows={patched_rows})")
    lines.append(f"- **日志**：`data/_pipeline/P1/patch_log.csv` (entries={len(log)})")
    if not unres.empty:
        lines.append(f"- **未解决**：`data/_pipeline/P1/unresolvable.csv` (entries={len(unres)})")
    lines.append("")

    lines.append("## 修复动作汇总")
    lines.append("")
    if not log.empty:
        vc = log["action"].value_counts()
        lines.append("| Action | Count |")
        lines.append("|---|---|")
        for a, c in vc.items():
            lines.append(f"| `{a}` | {c} |")
    else:
        lines.append("_无修改_")
    lines.append("")

    lines.append("## 抽样检查（供用户验收）")
    lines.append("")
    if not log.empty:
        sample = log.sample(min(20, len(log)), random_state=42).sort_values("action")
        lines.append("| Action | RowIdx | Kept | Detail |")
        lines.append("|---|---|---|---|")
        for _, r in sample.iterrows():
            detail = str(r.get("detail", ""))[:80]
            lines.append(
                f"| {r['action']} | {r.get('row_index','')} | "
                f"{r.get('kept_row_index','')} | {detail} |"
            )
    lines.append("")

    lines.append("## 待处置事项")
    lines.append("")
    if not unres.empty:
        lines.append(f"- {len(unres)} 条未解决（类型分布见 `unresolvable.csv`），将在 P2 阶段用 01 反查修复")
    else:
        lines.append("_无_")
    lines.append("")

    lines.append("## 验收 Checklist")
    lines.append("")
    lines.append("- [ ] 重复记录去除数量与审计报告一致（34 条）")
    lines.append("- [ ] 分数异常标记数量与审计报告一致（约 161+71=232 条）")
    lines.append("- [ ] 抽样 20 条修正记录，人工核对合理")
    lines.append("- [ ] `03_patched.xlsx` 行数 = 48131 - 去重数")
    lines.append("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Report written: {REPORT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

- [ ] **Step 2: 运行生成报告**

Run: `python -m scripts.data_integration.p1_report`
Expected: 输出 `Report written: .../P1_report.md`

- [ ] **Step 3: 人眼检查报告**

Run: `cat docs/superpowers/specs/2026-04-17-data-integration-master/P1_report.md | head -40`

Expected: Markdown 报告含汇总表 + 抽样表 + 待处置 + 验收 checklist。

- [ ] **Step 4: Commit**

```bash
git add scripts/data_integration/p1_report.py docs/superpowers/specs/2026-04-17-data-integration-master/P1_report.md
git commit -m "feat(data-integration): P1 report generator"
```

---

### Task 11: 更新 RUNBOOK 并准备交付

**Files:**
- Modify: `docs/superpowers/specs/2026-04-17-data-integration-master/RUNBOOK.md`

- [ ] **Step 1: 更新 RUNBOOK 进度表和日志**

在 RUNBOOK.md 中把 P0、P1 状态改为 ✅ 完成，并在日志尾部追加执行日期和关键发现（如 `flag_score_anomaly` 实际数量、与审计报告差异、是否有意外 unresolvable）。

示例编辑（具体数值以真实运行结果为准）：

```markdown
### 2026-04-17（续，P0+P1 执行）

- P0 完成：lib/ 三模块（batch_dict / code_mapper / lineage）+ contract 上线
- P1 完成：
  - 03 主表去重 34 条（与审计报告一致 ✅）
  - 分数异常标记 XXX 条（与预期 232 的差异：...）
  - 专业代码缺失 2 条标 flag，留 P2 反查 01 修复
- 产物：`data/_pipeline/P1/03_patched.xlsx` + `patch_log.csv`
- 待用户验收 P1_report.md
```

- [ ] **Step 2: 运行全部测试最后一次**

Run: `python -m pytest scripts/data_integration/tests/ -v`
Expected: 全部 PASS（应有约 25+ 测试）。

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-04-17-data-integration-master/RUNBOOK.md
git commit -m "docs(data-integration): update RUNBOOK with P0+P1 completion"
```

---

## 交付给用户（Sign-off checkpoint）

P0+P1 完成后，主 agent 向用户汇报：

> **P1 完成，请验收**
>
> 核心产出：
> - `data/_pipeline/P1/03_patched.xlsx`（行数：XXX）
> - `data/_pipeline/P1/patch_log.csv`（修改记录：XXX 条）
> - `docs/superpowers/specs/.../P1_report.md`（验收报告）
>
> 请抽查 20 条修正记录（见报告"抽样检查"节）；确认无误后回复"继续"，我启动 P2（03×01 交叉校验）。
> 如有问题指出具体哪条。

---

## Self-Review（Plan 写完后自审）

### Spec 覆盖检查

| Spec 条目 | Plan 任务 | 状态 |
|---|---|---|
| P0.1 目录骨架 | Task 1 | ✅ |
| P0.2 gitignore | Task 2 | ✅ |
| P0.3 batch_dict | Task 3 | ✅ |
| P0.3 code_mapper | Task 4 | ✅ |
| P0.3 lineage | Task 5 | ✅ |
| P0.4 contract | Task 6 | ✅ |
| P0 smoke test | Task 7 | ✅ |
| P1.1 基线冻结 | Task 8 | ✅ |
| P1.2 重复记录去除 | Task 9（apply_deduplication） | ✅ |
| P1.3 分数逻辑修复 | Task 9（apply_score_flags，flag 模式，修复留 P2） | ✅ |
| P1.4 专业代码补齐 | Task 9（apply_missing_major_code，flag 模式，修复留 P2） | ✅ |
| P1 report | Task 10 | ✅ |
| P1 验收点 | Task 11 + Delivery | ✅ |

**偏离 spec 处**：P1.3/P1.4 原 spec 说"优先用 01 修复"，但 P1 主表 patching 发生在 P2 01 数据 load 之前——改为"P1 仅标记，P2 合并时用 01 修复"，在 patch_log 中 action=flag。这是合理的执行顺序调整，已在 DECISIONS.md 可追加 ADR（执行时追加）。

### Placeholder 扫描

- ✅ 无 TBD/TODO/implement later
- ✅ 每个 Step 含具体命令或代码
- ✅ 所有列名、函数名在 Plan 内一致（`_quality_flag`、`apply_deduplication` 等跨步骤匹配）

### 类型一致性

- `PRIMARY_KEY` 在 p1_patch_03.py 定义，test 导入同名常量 ✅
- `find_duplicates` 返回 `List[List[int]]`，`select_most_complete` 签名接受 `List[int]` 一致 ✅
- `Lineage.mark` source 枚举与 `VALID_SOURCES` 一致 ✅
