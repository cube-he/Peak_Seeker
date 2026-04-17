# 数据整合 P2 实现计划（03 × 01 交叉校验与补缺）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 01 官方数据作为"补缺+校验"源合并到 03 主表：先打通院校代码桥（0.63% 手工补全），再按 `(年份, 院校代码, 专业代码, 批次, 科类)` outer join，产出差异报告 + 独有列增补 + 提前批/历史年份补缺，最终得到 `03_enriched.xlsx`。

**Architecture:** 新增 `lib/source_01.py` 作为 01 读取层（吸收 2025 字段翻转 / 批次命名差异），通过 `CodeMapper` 桥接 01 的国标码与 03 的四川招生码；在内存中按主键外连，用规则驱动的差异检测器（分数/位次/计划数三类阈值）生成 xlsx 报告；独有字段以 `_01` 后缀作为新增列合入，**不覆盖 03 既有非空值**。所有修改通过 `Lineage` 记录来源。

**Tech Stack:** Python 3.11.9, pandas 2.3.3, openpyxl, pytest；复用 P1 的 `batch_dict` / `code_mapper` / `lineage`。

**Spec 参照:** `docs/superpowers/specs/2026-04-17-data-integration-master/design.md` P2 节（v1.1）

**Plan 边界:** 本计划覆盖 P2.0-P2.5 全部；P3（13 治理）/ P4（三源合一）待 P2 验收后单独出。

**关键前提（来自 P1 发现）:**
- 03 主表实际已清洗（ISSUE-010），P2 重心从"补缺"调整为"双向审计 + 追加 01 独有字段 + 提前批/历史补缺"
- 先在 P2.0 回补三项已登记的非阻塞 issue（ISSUE-007/008/009），避免 P2 正式开工后反复
- 2024 年 01 数据有质量警示（最低位次/最高分匹配率低），P2.3 差异报告须显式分年份统计

---

## File Structure

**新建（scripts 目录）:**
- `scripts/data_integration/lib/source_01.py` — 01 数据读取 + 字段归一化（含 2025 翻转处理）
- `scripts/data_integration/lib/diff_rules.py` — 字段差异阈值与标红规则
- `scripts/data_integration/p2_code_mapping.py` — 院校代码映射 probe + 补全
- `scripts/data_integration/p2_join.py` — 03×01 outer join 主流程
- `scripts/data_integration/p2_diff_report.py` — 差异报告生成
- `scripts/data_integration/p2_enrich.py` — 独有字段合入（_01 后缀）+ 提前批/历史补缺
- `scripts/data_integration/p2_report.py` — 生成 P2_report.md + coverage_uplift.md

**新建（测试）:**
- `scripts/data_integration/tests/test_source_01.py`
- `scripts/data_integration/tests/test_diff_rules.py`
- `scripts/data_integration/tests/test_p2_join.py`
- `scripts/data_integration/tests/test_p2_enrich.py`
- `scripts/data_integration/tests/fixtures/mini_01_2024.json` — 手工构造 3 条 2024 数据（含字段齐全）
- `scripts/data_integration/tests/fixtures/mini_01_2025.json` — 手工构造 3 条 2025 数据（含 uMinScore=0 翻转）

**修改（P2.0 预动作）:**
- `scripts/data_integration/lib/batch_dict.py` — ISSUE-007 诊断细化；ISSUE-008 加 `strict` 参数
- `scripts/data_integration/lib/code_mapper.py` — ISSUE-009 加冲突检测
- `scripts/data_integration/tests/test_batch_dict.py` — 补 issue 相关用例
- `scripts/data_integration/tests/test_code_mapper.py` — 补冲突检测用例

**新建（文档）:**
- `docs/superpowers/specs/2026-04-17-data-integration-master/P2_report.md`
- `docs/superpowers/specs/2026-04-17-data-integration-master/coverage_uplift.md`

**数据产出（gitignored，本地）:**
- `data/_pipeline/P2/code_mapping_patched.csv`（0.63% 补全后）
- `data/_pipeline/P2/join_result.parquet`（中间：外连接原始结果）
- `data/_pipeline/P2/cross_diff_report.xlsx`（全量差异）
- `data/_pipeline/P2/anomaly_diff.xlsx`（标红项，按差值降序）
- `data/_pipeline/P2/03_enriched.xlsx`（最终产出）
- `data/_pipeline/P2/lineage_P2.json`（血缘）

---

## 阶段 P2.0：Pre-flight 修复（处理 P1 遗留 issue）

### Task 1: 修复 ISSUE-007（batch_dict 错误诊断细化）

**Files:**
- Modify: `scripts/data_integration/lib/batch_dict.py`
- Modify: `scripts/data_integration/tests/test_batch_dict.py`

**背景:** 当前 `normalize_batch_name` 对"字典本身缺年份/科目"和"名称未注册"返回同一条 `未知批次` 信息，P2 跨源校验需要区分这两类根因。

- [ ] **Step 1: 写失败测试（字典缺失场景）**

在 `test_batch_dict.py` 末尾追加：

```python
def test_normalize_raises_dict_missing_when_year_course_not_registered():
    """(year, course) 组合不在 _CANONICAL_NAMES / _ALIASES 中：专用错误路径。"""
    import pytest
    from scripts.data_integration.lib.batch_dict import (
        normalize_batch_name,
        BatchDictMissingError,
    )

    with pytest.raises(BatchDictMissingError) as exc_info:
        normalize_batch_name("本科批", year=2023, course="理科")
    msg = str(exc_info.value)
    assert "2023" in msg and "理科" in msg
    assert "字典未注册" in msg or "dict" in msg.lower()


def test_normalize_raises_name_unknown_when_dict_exists_but_name_not_found():
    """字典存在但名称不认识：保留原 ValueError 语义。"""
    import pytest
    from scripts.data_integration.lib.batch_dict import normalize_batch_name

    with pytest.raises(ValueError) as exc_info:
        normalize_batch_name("完全不存在的批次XYZ", year=2025, course="物理")
    assert "未知批次" in str(exc_info.value)
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pytest scripts/data_integration/tests/test_batch_dict.py -v -k "dict_missing or name_unknown"`
Expected: FAIL（`BatchDictMissingError` 未定义）

- [ ] **Step 3: 在 batch_dict.py 加专用异常与分支**

在 `batch_dict.py` 顶部加：

```python
class BatchDictMissingError(LookupError):
    """字典本身未注册 (year, course) 组合。区别于名称未知。"""
```

修改 `normalize_batch_name`：

```python
def normalize_batch_name(name: str, year: int | str, course: str) -> str:
    key = (str(year), course)
    if key not in _CANONICAL_NAMES and key not in _ALIASES:
        raise BatchDictMissingError(
            f"字典未注册: year={year} course={course}（需在 _CANONICAL_NAMES / _ALIASES 中补录）"
        )
    canonical_set = _CANONICAL_NAMES.get(key, set())
    aliases = _ALIASES.get(key, {})
    if name in canonical_set:
        return name
    if name in aliases:
        return aliases[name]
    raise ValueError(f"未知批次: {name!r} (year={year}, course={course})")
```

- [ ] **Step 4: 跑全部 batch_dict 测试**

Run: `pytest scripts/data_integration/tests/test_batch_dict.py -v`
Expected: 6/6 PASS（原 4 + 新 2）

- [ ] **Step 5: 提交**

```bash
git add scripts/data_integration/lib/batch_dict.py scripts/data_integration/tests/test_batch_dict.py
git commit -m "fix(data_integration): split batch_dict missing vs unknown name errors (ISSUE-007)"
```

---

### Task 2: 修复 ISSUE-008（"本科批" 模糊默认加 strict 选项）

**Files:**
- Modify: `scripts/data_integration/lib/batch_dict.py`
- Modify: `scripts/data_integration/tests/test_batch_dict.py`

**背景:** `_ALIASES[("2025","物理")]["本科批"]="本科批B段"` 基于"无段别默认 B 段"假设，跨年跨源可能 silent drift。P2 首次跑 conflict report 前加 `strict` 开关。

- [ ] **Step 1: 写失败测试**

在 `test_batch_dict.py` 追加：

```python
def test_normalize_strict_rejects_ambiguous_aliases():
    """strict=True 时，'本科批' 这类模糊别名拒绝默认映射到 B 段。"""
    import pytest
    from scripts.data_integration.lib.batch_dict import (
        normalize_batch_name,
        AmbiguousBatchError,
    )

    # 非严格模式：保持现有行为
    assert normalize_batch_name("本科批", year=2025, course="物理") == "本科批B段"

    # 严格模式：抛错
    with pytest.raises(AmbiguousBatchError):
        normalize_batch_name("本科批", year=2025, course="物理", strict=True)


def test_normalize_strict_allows_unambiguous_aliases():
    """明确的别名（如 '本一'→'本科一批'）在 strict=True 下仍成功。"""
    from scripts.data_integration.lib.batch_dict import normalize_batch_name
    assert normalize_batch_name("本一", year=2024, course="理科", strict=True) == "本科一批"
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pytest scripts/data_integration/tests/test_batch_dict.py -v -k "strict"`
Expected: FAIL

- [ ] **Step 3: 实现 strict 支持**

在 `batch_dict.py` 顶部定义 `_AMBIGUOUS_ALIASES` 集合和异常，修改 `normalize_batch_name` 签名增加 `strict: bool = False`：

```python
class AmbiguousBatchError(ValueError):
    """模糊别名在 strict 模式下被拒绝。"""

# 明确标记为"假设性默认"的别名（strict 模式下拒绝）
_AMBIGUOUS_ALIASES: set[tuple[str, str, str]] = {
    ("2025", "物理", "本科批"),
    ("2025", "物理", "本科批次"),
    ("2025", "物理", "普通类 本科批次"),
    ("2025", "物理", "本科A"),  # 默认映射到"国家专项"，但真实可能指任意 A 段
}


def normalize_batch_name(
    name: str, year: int | str, course: str, strict: bool = False
) -> str:
    # ...前面的 BatchDictMissingError 分支保留...
    if strict and (str(year), course, name) in _AMBIGUOUS_ALIASES:
        raise AmbiguousBatchError(
            f"模糊别名拒绝映射(strict): {name!r} year={year} course={course}；"
            f"需在源头消歧或显式 strict=False"
        )
    # ...原 lookup 逻辑保留...
```

- [ ] **Step 4: 跑全部 batch_dict 测试**

Run: `pytest scripts/data_integration/tests/test_batch_dict.py -v`
Expected: 8/8 PASS

- [ ] **Step 5: 提交**

```bash
git add scripts/data_integration/lib/batch_dict.py scripts/data_integration/tests/test_batch_dict.py
git commit -m "feat(data_integration): add strict mode to normalize_batch_name (ISSUE-008)"
```

---

### Task 3: 修复 ISSUE-009（CodeMapper 冲突检测）

**Files:**
- Modify: `scripts/data_integration/lib/code_mapper.py`
- Modify: `scripts/data_integration/tests/test_code_mapper.py`

**背景:** 治理 CSV 若同一 `national_code` 出现多次，当前后者静默覆盖前者。P2.1 真实补丁前必须告警。

- [ ] **Step 1: 写失败测试**

```python
def test_from_csv_collects_conflicts_when_national_code_duplicated(tmp_path):
    """同一 national_code 出现多次：记录到 conflicts 列表，保留首个值。"""
    csv = tmp_path / "dup.csv"
    csv.write_text(
        "招生代码,国标代码,院校\n"
        "1001,100001,A大学\n"
        "1002,100001,A大学（分部）\n",
        encoding="utf-8-sig",
    )
    from scripts.data_integration.lib.code_mapper import CodeMapper
    m = CodeMapper.from_csv(csv)
    assert len(m.conflicts) == 1
    conflict = m.conflicts[0]
    assert conflict["national_code"] == "100001"
    assert conflict["existing_enroll"] in ("1001", "0001", "01001")  # zfill 行为
    assert conflict["new_enroll"] in ("1002", "0002", "01002")


def test_add_patch_rejects_overwrite_by_default():
    """add_patch 默认不覆盖已有映射，需要 overwrite=True 显式允许。"""
    import pytest
    from scripts.data_integration.lib.code_mapper import CodeMapper
    m = CodeMapper()
    m.add_patch(enroll_code="0001", national_code="100001", name="A大学")
    with pytest.raises(ValueError) as exc:
        m.add_patch(enroll_code="0001", national_code="999999", name="冲突")
    assert "已有映射" in str(exc.value) or "exists" in str(exc.value).lower()
    # overwrite=True 允许
    m.add_patch(enroll_code="0001", national_code="999999", name="覆盖", overwrite=True)
    assert m.enroll_to_national("0001") == "999999"
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pytest scripts/data_integration/tests/test_code_mapper.py -v -k "conflict or overwrite"`
Expected: FAIL

- [ ] **Step 3: 实现冲突检测**

`CodeMapper` 增加 `conflicts: list[dict]` 字段和 `add_patch(overwrite: bool = False)` 参数，`from_csv` 解析时检查 `national_to_enroll` 是否已有条目，重复则 append conflict 而不覆盖。

- [ ] **Step 4: 跑全部 code_mapper 测试**

Run: `pytest scripts/data_integration/tests/test_code_mapper.py -v`
Expected: 9/9 PASS（原 7 + 新 2）

- [ ] **Step 5: 提交**

```bash
git add scripts/data_integration/lib/code_mapper.py scripts/data_integration/tests/test_code_mapper.py
git commit -m "feat(data_integration): detect code_mapper conflicts, strict add_patch default (ISSUE-009)"
```

---

## 阶段 P2.1：院校代码桥打通

### Task 4: `source_01` 读取器骨架 + 2022-2024 基础字段

**Files:**
- Create: `scripts/data_integration/lib/source_01.py`
- Create: `scripts/data_integration/tests/test_source_01.py`
- Create: `scripts/data_integration/tests/fixtures/mini_01_2024.json`

**模块职责:** 读取 01 专业分数线 json，统一字段名到 03 口径（`院校代码_国标`、`专业代码`、`批次`、`科目`、`最低分`、`平均分`、`最高分`、`最低位次`、`录取人数`），产出 pandas DataFrame。

**预期 01 schema（来自 Explore 探测）:**
- `collegeCode`（6位国标）, `collegeName`, `professionEnrollCode`（专业代码）, `professionName`
- `batch`, `course`
- `uMinScore`/`uAvgScore`/`uMaxScore`（2022-2024 有效），`minScore`/`avgScore`/`maxScore`（2025 有效字段）
- `uMinRank`, `uAvgRank`, `uMaxRank`
- `enrollCount`（录取人数）, `planCount`（计划人数）
- `uZjText`（征集标志）, `pressureScore`（压力线）, `collegeType`（办学性质）, `collegeCategory`（院校分类）

- [ ] **Step 1: 构造 fixture**

创建 `tests/fixtures/mini_01_2024.json`（3 条记录，覆盖：本一/本二、理科/文科、含空值）：

```json
[
  {
    "collegeCode": "100001",
    "collegeName": "北京大学",
    "professionEnrollCode": "01",
    "professionName": "哲学类",
    "batch": "本一",
    "course": "理科",
    "uMinScore": 680, "uAvgScore": 685, "uMaxScore": 690,
    "uMinRank": 500, "uAvgRank": 400, "uMaxRank": 300,
    "enrollCount": 5, "planCount": 5,
    "uZjText": "", "pressureScore": 539,
    "collegeType": "公办", "collegeCategory": "综合"
  },
  {
    "collegeCode": "100002",
    "collegeName": "中国人民大学",
    "professionEnrollCode": "02",
    "professionName": "经济学类",
    "batch": "本一",
    "course": "文科",
    "uMinScore": 620, "uAvgScore": null, "uMaxScore": 625,
    "uMinRank": 200, "uAvgRank": null, "uMaxRank": 150,
    "enrollCount": 3, "planCount": 3,
    "uZjText": "", "pressureScore": 527,
    "collegeType": "公办", "collegeCategory": "综合"
  },
  {
    "collegeCode": "100003",
    "collegeName": "清华大学",
    "professionEnrollCode": "03",
    "professionName": "工科试验班",
    "batch": "本二",
    "course": "理科",
    "uMinScore": 600, "uAvgScore": 605, "uMaxScore": 610,
    "uMinRank": 8000, "uAvgRank": 7500, "uMaxRank": 7000,
    "enrollCount": 10, "planCount": 10,
    "uZjText": "征集", "pressureScore": 459,
    "collegeType": "公办", "collegeCategory": "理工"
  }
]
```

- [ ] **Step 2: 写失败测试**

```python
# test_source_01.py
from pathlib import Path
import pandas as pd
from scripts.data_integration.lib.source_01 import load_01_major_scores

FIXTURES = Path(__file__).parent / "fixtures"


def test_load_01_2024_basic_fields():
    df = load_01_major_scores(FIXTURES / "mini_01_2024.json", year=2024)
    assert len(df) == 3
    # 字段已归一化到 03 口径
    assert "院校代码_国标" in df.columns
    assert "专业代码" in df.columns
    assert "最低分" in df.columns
    assert "最低位次" in df.columns
    # 2024 年从 uMinScore 取分
    row0 = df.iloc[0]
    assert row0["院校代码_国标"] == "100001"
    assert row0["最低分"] == 680
    assert row0["批次"] == "本一"
    assert row0["科目"] == "理科"


def test_load_01_2024_preserves_nulls():
    df = load_01_major_scores(FIXTURES / "mini_01_2024.json", year=2024)
    # 中国人民大学 avg 字段为 null
    row1 = df[df["院校代码_国标"] == "100002"].iloc[0]
    assert pd.isna(row1["平均分"])
    assert pd.isna(row1["平均位次"])


def test_load_01_adds_year_column():
    df = load_01_major_scores(FIXTURES / "mini_01_2024.json", year=2024)
    assert (df["数据年份"] == 2024).all()
```

- [ ] **Step 3: 运行测试验证失败**

Run: `pytest scripts/data_integration/tests/test_source_01.py -v`
Expected: FAIL（模块不存在）

- [ ] **Step 4: 实现 `load_01_major_scores`**

```python
# source_01.py
"""01 核心录取数据 读取器。

Why a separate module: 01 的 json schema 与 03 不同（英文字段 + 2025 字段翻转），
需要统一归一化到 03 口径后才能 outer join。
"""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd

# 字段映射：01 英文字段 → 03 中文字段（2022-2024 默认）
_FIELD_MAP_DEFAULT = {
    "collegeCode": "院校代码_国标",
    "collegeName": "院校名称_01",
    "professionEnrollCode": "专业代码",
    "professionName": "专业名称_01",
    "batch": "批次",
    "course": "科目",
    "uMinScore": "最低分",
    "uAvgScore": "平均分",
    "uMaxScore": "最高分",
    "uMinRank": "最低位次",
    "uAvgRank": "平均位次",
    "uMaxRank": "最高位次",
    "enrollCount": "录取人数",
    "planCount": "计划人数",
    "uZjText": "征集标志",
    "pressureScore": "压力线",
    "collegeType": "办学性质",
    "collegeCategory": "院校分类",
}

# 2025 专用映射（字段翻转）:从 minScore/avgScore/maxScore 取分
_FIELD_MAP_2025 = {
    **_FIELD_MAP_DEFAULT,
    "minScore": "最低分",
    "avgScore": "平均分",
    "maxScore": "最高分",
    # uMinScore 在 2025 全为 0，丢弃
}


def load_01_major_scores(path: str | Path, year: int) -> pd.DataFrame:
    """Load 01 专业分数线 json and normalize to 03 schema."""
    path = Path(path)
    raw = json.loads(path.read_text(encoding="utf-8"))
    df = pd.DataFrame(raw)
    field_map = _FIELD_MAP_2025 if int(year) == 2025 else _FIELD_MAP_DEFAULT

    # 2025: 先丢弃 uMinScore 等翻转字段，避免冲突
    if int(year) == 2025:
        for drop_col in ("uMinScore", "uAvgScore", "uMaxScore"):
            if drop_col in df.columns:
                df = df.drop(columns=[drop_col])

    # 只重命名存在的列
    actual_map = {k: v for k, v in field_map.items() if k in df.columns}
    df = df.rename(columns=actual_map)

    # 国标代码确保字符串（避免数值被截零）
    if "院校代码_国标" in df.columns:
        df["院校代码_国标"] = df["院校代码_国标"].astype(str).str.zfill(6)

    df["数据年份"] = int(year)
    return df
```

- [ ] **Step 5: 跑测试**

Run: `pytest scripts/data_integration/tests/test_source_01.py -v`
Expected: 3/3 PASS

- [ ] **Step 6: 提交**

```bash
git add scripts/data_integration/lib/source_01.py \
        scripts/data_integration/tests/test_source_01.py \
        scripts/data_integration/tests/fixtures/mini_01_2024.json
git commit -m "feat(data_integration): add 01 major scores loader with field normalization"
```

---

### Task 5: `source_01` 2025 字段翻转处理（ISSUE-001）

**Files:**
- Modify: `scripts/data_integration/lib/source_01.py`（已在 Task 4 引入 `_FIELD_MAP_2025`，本任务验证）
- Create: `scripts/data_integration/tests/fixtures/mini_01_2025.json`
- Modify: `scripts/data_integration/tests/test_source_01.py`

**背景:** ISSUE-001 — 2025 数据 `uMinScore` 全为 0，有效分数在 `minScore`。上一任务已写好代码，本任务独立 fixture 验证，避免遗漏。

- [ ] **Step 1: 构造 2025 fixture**

`tests/fixtures/mini_01_2025.json`（2 条，uMinScore=0，minScore 有值）：

```json
[
  {
    "collegeCode": "100001",
    "collegeName": "北京大学",
    "professionEnrollCode": "01",
    "professionName": "哲学类",
    "batch": "本科A",
    "course": "物理",
    "uMinScore": 0, "uAvgScore": 0, "uMaxScore": 0,
    "minScore": 690, "avgScore": 695, "maxScore": 700,
    "uMinRank": 400, "uAvgRank": 350, "uMaxRank": 280,
    "enrollCount": 5, "planCount": 5,
    "uZjText": "", "pressureScore": 553,
    "collegeType": "公办", "collegeCategory": "综合"
  },
  {
    "collegeCode": "100002",
    "collegeName": "中国人民大学",
    "professionEnrollCode": "02",
    "professionName": "经济学类",
    "batch": "本科B",
    "course": "历史",
    "uMinScore": 0, "uAvgScore": 0, "uMaxScore": 0,
    "minScore": 620, "avgScore": 625, "maxScore": 628,
    "uMinRank": 300, "uAvgRank": 250, "uMaxRank": 200,
    "enrollCount": 3, "planCount": 3,
    "uZjText": "", "pressureScore": 527,
    "collegeType": "公办", "collegeCategory": "综合"
  }
]
```

- [ ] **Step 2: 写测试**

```python
def test_load_01_2025_uses_minScore_not_uMinScore():
    """2025: ISSUE-001 字段翻转，必须从 minScore 取分，uMinScore 必须被丢弃。"""
    from scripts.data_integration.lib.source_01 import load_01_major_scores
    df = load_01_major_scores(FIXTURES / "mini_01_2025.json", year=2025)
    assert df.iloc[0]["最低分"] == 690
    assert df.iloc[0]["最高分"] == 700
    # uMinScore 列不应该残留
    assert "uMinScore" not in df.columns
    # 但位次字段仍从 uMinRank 取
    assert df.iloc[0]["最低位次"] == 400


def test_load_01_2025_batch_and_course_terminology():
    """2025 批次用"本科A/B"、科目用"物理/历史"（尚未归一化，P2.2 再做）。"""
    from scripts.data_integration.lib.source_01 import load_01_major_scores
    df = load_01_major_scores(FIXTURES / "mini_01_2025.json", year=2025)
    assert df.iloc[0]["批次"] == "本科A"
    assert df.iloc[1]["科目"] == "历史"
```

- [ ] **Step 3: 跑测试验证通过**

Run: `pytest scripts/data_integration/tests/test_source_01.py -v`
Expected: 5/5 PASS（不需改代码，Task 4 已实现）

- [ ] **Step 4: 提交**

```bash
git add scripts/data_integration/tests/fixtures/mini_01_2025.json \
        scripts/data_integration/tests/test_source_01.py
git commit -m "test(data_integration): verify 01 2025 field flip handling (ISSUE-001)"
```

---

### Task 6: 院校代码桥 probe 与 patch（P2.1）

**Files:**
- Create: `scripts/data_integration/p2_code_mapping.py`

**目的:** 用 Task 3 加固后的 CodeMapper 扫描 `data/08_数据治理记录/编码映射表_招生代码_国标代码.csv`，识别 01 中出现但映射表缺失的 `collegeCode`（0.63% 预期），派子 agent 手工补全，产出 `code_mapping_patched.csv`。

- [ ] **Step 1: 实现 probe 脚本（先不做手工补全）**

```python
# p2_code_mapping.py
"""Probe coverage of 编码映射表 against 01 collegeCode universe.

Dumps missing codes to csv for subagent to manually patch.
Does not mutate the source mapping CSV.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import pandas as pd

from scripts.data_integration.lib.code_mapper import CodeMapper
from scripts.data_integration.lib.source_01 import load_01_major_scores

MAPPING_CSV = Path("data/08_数据治理记录/编码映射表_招生代码_国标代码.csv")
OUT_DIR = Path("data/_pipeline/P2")


def probe_coverage(years: list[int]) -> pd.DataFrame:
    mapper = CodeMapper.from_csv(MAPPING_CSV)
    if mapper.conflicts:
        print(f"[WARN] mapping csv 内部 {len(mapper.conflicts)} 条冲突，见 conflicts.csv")

    all_codes: set[tuple[str, str]] = set()  # (国标代码, 院校名称)
    for year in years:
        src = Path(f"data/01_核心录取数据/专业分数线_四川_{year}.json")
        if not src.exists():
            continue
        df = load_01_major_scores(src, year=year)
        for _, row in df[["院校代码_国标", "院校名称_01"]].drop_duplicates().iterrows():
            all_codes.add((row["院校代码_国标"], row["院校名称_01"]))

    missing = [
        {"national_code": code, "college_name": name}
        for code, name in all_codes
        if mapper.national_to_enroll(code) is None
    ]
    return pd.DataFrame(missing)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", nargs="+", type=int, default=[2022, 2023, 2024, 2025])
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    missing_df = probe_coverage(args.years)
    out = OUT_DIR / "missing_college_codes.csv"
    missing_df.to_csv(out, index=False, encoding="utf-8-sig")
    print(f"Missing: {len(missing_df)} codes → {out}")
    # 覆盖率
    total_01 = sum(
        load_01_major_scores(
            Path(f"data/01_核心录取数据/专业分数线_四川_{y}.json"), year=y
        )["院校代码_国标"].nunique()
        for y in args.years
        if Path(f"data/01_核心录取数据/专业分数线_四川_{y}.json").exists()
    )
    # 注：total_01 是 (年×国标) 求和，非去重；只做 sanity 打印
    print(f"Coverage est.: {1 - len(missing_df) / max(1, total_01):.2%}")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 真实 dry-run probe**

Run: `python -m scripts.data_integration.p2_code_mapping --years 2022 2023 2024 2025`
Expected: 打印 missing 数量；`data/_pipeline/P2/missing_college_codes.csv` 生成。

- [ ] **Step 3: 派子 agent 手工补全 missing codes**

主 agent 将 `missing_college_codes.csv` 交给子 agent（sonnet），要求：
- 根据 `college_name` 网搜/推断对应的四川招生代码
- 无法确定的打标 `needs_human_review`
- 产出 `data/_pipeline/P2/code_mapping_patches.csv`（新条目 only）

子 agent 输出遵循 subagent_output.md contract。

- [ ] **Step 4: 合并补丁产出 code_mapping_patched.csv**

脚本逻辑：读原 CSV + patches，写合并结果 + lineage 标记。

- [ ] **Step 5: 提交**

```bash
git add scripts/data_integration/p2_code_mapping.py
git commit -m "feat(data_integration): 01 college code probe + manual patch pipeline (P2.1)"
```

---

## 阶段 P2.2：Outer Join

### Task 7: `p2_join` — 03×01 按主键外连接

**Files:**
- Create: `scripts/data_integration/p2_join.py`
- Create: `scripts/data_integration/tests/test_p2_join.py`

**主键:** `(数据年份, 院校代码_国标, 专业代码, 批次, 科目)`
- 03 原始用"四川招生代码"，先通过 CodeMapper 桥接为国标码再 join
- 批次/科目通过 batch_dict 归一化（2025 先翻译成 03 口径）

- [ ] **Step 1: 写失败测试（mini fixture outer join）**

构造 `tests/fixtures/mini_03_for_join.xlsx`（2 条与 01 能匹配，1 条 03 独有，0 条 01 独有）+ 配合 Task 4 的 mini_01_2024。

```python
def test_outer_join_matched_records_have_both_sides():
    """匹配成功时，左右两侧字段都存在，且院校代码已桥接。"""
    from scripts.data_integration.p2_join import join_03_and_01
    joined = join_03_and_01(year=2024, strict=False)
    # 03 独有: 指示列为 'left_only'
    # 01 独有: 'right_only'
    # 匹配: 'both'
    assert "_merge" in joined.columns
    assert set(joined["_merge"].unique()) <= {"left_only", "right_only", "both"}


def test_outer_join_rows_preserve_primary_key_uniqueness():
    """同一主键不应重复出现（若重复说明 03 或 01 有重复主键）。"""
    from scripts.data_integration.p2_join import join_03_and_01, PRIMARY_KEY
    joined = join_03_and_01(year=2024, strict=False)
    dup = joined.duplicated(subset=PRIMARY_KEY)
    assert dup.sum() == 0


def test_outer_join_bridges_college_code_via_mapper():
    """03 的四川招生码 1 → 国标 100001，能对上 01 的 collegeCode='100001'。"""
    from scripts.data_integration.p2_join import join_03_and_01
    joined = join_03_and_01(year=2024, strict=False)
    matched = joined[joined["_merge"] == "both"]
    assert len(matched) > 0
```

- [ ] **Step 2: 实现 `join_03_and_01`**

```python
# p2_join.py
from __future__ import annotations
from pathlib import Path
import pandas as pd
from scripts.data_integration.lib.code_mapper import CodeMapper
from scripts.data_integration.lib.source_01 import load_01_major_scores
from scripts.data_integration.lib.batch_dict import normalize_batch_name

PRIMARY_KEY = ["数据年份", "院校代码_国标", "专业代码", "批次", "科目"]


def _bridge_03_to_national(df_03: pd.DataFrame, mapper: CodeMapper) -> pd.DataFrame:
    """Map 03's 四川招生代码 (1-2238 int) to 6-digit national code string."""
    df = df_03.copy()
    df["院校代码_国标"] = (
        df["院校代码"]
        .astype(int)
        .astype(str)
        .str.zfill(4)
        .map(mapper.enroll_to_national)
    )
    return df


def _normalize_batch_course(df: pd.DataFrame, year: int, strict: bool = False) -> pd.DataFrame:
    """Bring 01 batch/course to 03 canonical form via batch_dict."""
    df = df.copy()
    course_map = {"理科": "理科", "文科": "文科", "物理": "物理", "历史": "历史"}
    df["科目"] = df["科目"].map(course_map).fillna(df["科目"])
    df["批次"] = df.apply(
        lambda r: normalize_batch_name(r["批次"], year=year, course=r["科目"], strict=strict),
        axis=1,
    )
    return df


def join_03_and_01(year: int, strict: bool = False) -> pd.DataFrame:
    mapper = CodeMapper.from_csv(Path("data/08_数据治理记录/编码映射表_招生代码_国标代码.csv"))
    # 03
    from scripts.data_integration.lib.source_03 import load_master_by_year  # helper to add
    df_03 = load_master_by_year(year)
    df_03 = _bridge_03_to_national(df_03, mapper)
    # 01
    src_01 = Path(f"data/01_核心录取数据/专业分数线_四川_{year}.json")
    df_01 = load_01_major_scores(src_01, year=year)
    df_01 = _normalize_batch_course(df_01, year=year, strict=strict)

    joined = df_03.merge(df_01, on=PRIMARY_KEY, how="outer", indicator=True, suffixes=("", "_01"))
    return joined
```

- [ ] **Step 3: 补充 `lib/source_03.py` 的 `load_master_by_year`**（03 主表按年分片加载，fixture 读取兼容真实 xlsx）

- [ ] **Step 4: 跑测试**

Run: `pytest scripts/data_integration/tests/test_p2_join.py -v`
Expected: 3/3 PASS

- [ ] **Step 5: 真实 dry-run（日志 only，不落盘）**

```bash
python -c "from scripts.data_integration.p2_join import join_03_and_01; \
  df = join_03_and_01(year=2024); \
  print(df['_merge'].value_counts())"
```

记录匹配率到 RUNBOOK。

- [ ] **Step 6: 提交**

```bash
git add scripts/data_integration/p2_join.py scripts/data_integration/tests/test_p2_join.py \
        scripts/data_integration/lib/source_03.py
git commit -m "feat(data_integration): outer join 03×01 via code_mapper bridge (P2.2)"
```

---

## 阶段 P2.3：差异报告

### Task 8: `diff_rules` — 按字段分类的标红规则

**Files:**
- Create: `scripts/data_integration/lib/diff_rules.py`
- Create: `scripts/data_integration/tests/test_diff_rules.py`

**规则（来自 design.md P2.3）:**
- 分数：绝对差 > 5 **或** 相对差 > 1%
- 位次：相对差 > 5%
- 计划/录取人数：绝对差 > 2 **或** 相对差 > 10%
- 文本（专业名/备注）：不完全一致

- [ ] **Step 1: 写失败测试**

```python
def test_score_diff_absolute_threshold():
    from scripts.data_integration.lib.diff_rules import is_anomaly
    assert is_anomaly("score", lhs=600, rhs=606) is True   # diff 6 > 5
    assert is_anomaly("score", lhs=600, rhs=604) is False  # diff 4 ≤ 5, rel 0.67% ≤ 1%

def test_score_diff_relative_threshold():
    from scripts.data_integration.lib.diff_rules import is_anomaly
    # 低分段：绝对差小但相对差 >1%
    assert is_anomaly("score", lhs=300, rhs=304) is True   # diff 4 ≤5 BUT rel 1.33%>1%

def test_rank_diff_uses_relative_only():
    from scripts.data_integration.lib.diff_rules import is_anomaly
    assert is_anomaly("rank", lhs=100, rhs=104) is False   # 4%≤5%
    assert is_anomaly("rank", lhs=100, rhs=106) is True    # 6%>5%

def test_plan_count_diff():
    from scripts.data_integration.lib.diff_rules import is_anomaly
    assert is_anomaly("count", lhs=10, rhs=12) is False    # diff 2, rel 20%>10% → anomaly
    # wait: absolute > 2 OR relative > 10%. diff=2 not >2, but rel=20%>10% → True
    assert is_anomaly("count", lhs=10, rhs=12) is True
    assert is_anomaly("count", lhs=100, rhs=105) is False  # diff 5>2 → True
    assert is_anomaly("count", lhs=100, rhs=105) is True

def test_text_diff_exact_match():
    from scripts.data_integration.lib.diff_rules import is_anomaly
    assert is_anomaly("text", lhs="哲学类", rhs="哲学类") is False
    assert is_anomaly("text", lhs="哲学类", rhs="哲学类(国际)") is True

def test_diff_returns_false_when_either_side_null():
    """空对非空属于"补缺候选"，不算 anomaly（由另一流程处理）。"""
    import math
    from scripts.data_integration.lib.diff_rules import is_anomaly
    assert is_anomaly("score", lhs=None, rhs=600) is False
    assert is_anomaly("score", lhs=600, rhs=float("nan")) is False
```

- [ ] **Step 2: 运行测试验证失败**

Run: `pytest scripts/data_integration/tests/test_diff_rules.py -v`
Expected: FAIL

- [ ] **Step 3: 实现 `diff_rules.py`**

```python
# diff_rules.py
from __future__ import annotations
import math

THRESHOLDS = {
    "score": {"abs": 5, "rel": 0.01},
    "rank": {"abs": None, "rel": 0.05},
    "count": {"abs": 2, "rel": 0.10},
}


def _is_null(v) -> bool:
    if v is None:
        return True
    if isinstance(v, float) and math.isnan(v):
        return True
    return False


def is_anomaly(field_type: str, lhs, rhs) -> bool:
    if _is_null(lhs) or _is_null(rhs):
        return False
    if field_type == "text":
        return str(lhs) != str(rhs)
    if field_type not in THRESHOLDS:
        raise ValueError(f"unknown field_type: {field_type}")
    th = THRESHOLDS[field_type]
    diff = abs(float(lhs) - float(rhs))
    base = max(abs(float(lhs)), abs(float(rhs)), 1)
    rel = diff / base
    if th["abs"] is not None and diff > th["abs"]:
        return True
    if th["rel"] is not None and rel > th["rel"]:
        return True
    return False
```

- [ ] **Step 4: 跑测试**

Run: `pytest scripts/data_integration/tests/test_diff_rules.py -v`
Expected: 6/6 PASS

- [ ] **Step 5: 提交**

```bash
git add scripts/data_integration/lib/diff_rules.py scripts/data_integration/tests/test_diff_rules.py
git commit -m "feat(data_integration): field-typed anomaly detection rules (P2.3)"
```

---

### Task 9: `p2_diff_report` — 生成 cross_diff_report.xlsx + anomaly_diff.xlsx

**Files:**
- Create: `scripts/data_integration/p2_diff_report.py`

**逻辑:**
- 对 `_merge == "both"` 的行，逐对比重叠字段
- 用 `diff_rules.is_anomaly` 判定是否标红
- `cross_diff_report.xlsx`：全部差异，含 03/01 值、差值、分类
- `anomaly_diff.xlsx`：仅标红，按差值降序

- [ ] **Step 1: 定义重叠字段对照表**

```python
OVERLAP_FIELDS = [
    # (输出列名, 03 字段, 01 字段, 类型)
    ("最低分", "最低分", "最低分_01", "score"),
    ("平均分", "平均分", "平均分_01", "score"),
    ("最高分", "最高分", "最高分_01", "score"),
    ("最低位次", "最低位次", "最低位次_01", "rank"),
    ("计划人数", "计划人数", "计划人数_01", "count"),
    ("录取人数", "录取人数", "录取人数_01", "count"),
    ("专业名称", "专业名称", "专业名称_01", "text"),
]
```

- [ ] **Step 2: 实现生成逻辑**

```python
def build_diff_rows(joined: pd.DataFrame) -> pd.DataFrame:
    both = joined[joined["_merge"] == "both"].copy()
    rows = []
    for _, r in both.iterrows():
        for label, col_03, col_01, ftype in OVERLAP_FIELDS:
            lhs, rhs = r.get(col_03), r.get(col_01)
            if pd.isna(lhs) and pd.isna(rhs):
                continue
            if (not pd.isna(lhs)) and (not pd.isna(rhs)) and lhs == rhs:
                continue
            diff = None
            if ftype in ("score", "rank", "count") and not (pd.isna(lhs) or pd.isna(rhs)):
                diff = float(rhs) - float(lhs)
            rows.append({
                **{k: r[k] for k in PRIMARY_KEY},
                "字段": label,
                "03值": lhs,
                "01值": rhs,
                "差值": diff,
                "类型": ftype,
                "anomaly": is_anomaly(ftype, lhs, rhs),
            })
    return pd.DataFrame(rows)
```

- [ ] **Step 3: 真实 dry-run 生成 xlsx**

```bash
python -m scripts.data_integration.p2_diff_report --year 2024 2025
```

- [ ] **Step 4: 打印匹配率/差异率/标红率摘要，记入 RUNBOOK**

- [ ] **Step 5: 提交**

```bash
git add scripts/data_integration/p2_diff_report.py
git commit -m "feat(data_integration): cross-source diff + anomaly reports (P2.3)"
```

---

## 阶段 P2.4：独有字段合入 + 补缺

### Task 10: `p2_enrich` — 独有字段 `_01` 后缀列合入

**Files:**
- Create: `scripts/data_integration/p2_enrich.py`
- Create: `scripts/data_integration/tests/test_p2_enrich.py`

**规则（ADR-003）:**
- 01 独有字段作新增列：`最低位次_01`, `平均位次_01`, `最高位次_01`, `征集标志_01`, `压力线_01`, `办学性质_01`, `院校分类_01`
- 03 对应字段若非空，**不覆盖**；仅在 03 为空时，新增列用于"补缺候选"标注（不直接改 03 值）
- 新增列命名一律加 `_01` 后缀

- [ ] **Step 1: 写失败测试**

```python
def test_enrich_adds_01_suffix_columns_without_overwriting_03():
    """03 '最低位次' 非空时不动 03 值；同时新增 '最低位次_01' 列。"""
    import pandas as pd
    from scripts.data_integration.p2_enrich import enrich_with_01
    joined = pd.DataFrame([
        {"数据年份": 2024, "院校代码_国标": "100001", "专业代码": "01",
         "批次": "本一", "科目": "理科",
         "最低位次": 500, "最低位次_01": 505, "_merge": "both"},
    ])
    enriched = enrich_with_01(joined)
    assert enriched.iloc[0]["最低位次"] == 500         # 03 保留
    assert enriched.iloc[0]["最低位次_01"] == 505      # 01 作新列

def test_enrich_flags_backfill_candidate_when_03_null():
    """03 为空、01 非空：在 _backfill_flags 中标记，不直接替换 03 值。"""
    import pandas as pd
    from scripts.data_integration.p2_enrich import enrich_with_01
    joined = pd.DataFrame([
        {"数据年份": 2024, "院校代码_国标": "100001", "专业代码": "01",
         "批次": "本一", "科目": "理科",
         "最低位次": None, "最低位次_01": 505, "_merge": "both"},
    ])
    enriched = enrich_with_01(joined)
    assert pd.isna(enriched.iloc[0]["最低位次"])  # 03 不填充
    assert "补缺候选" in str(enriched.iloc[0].get("_backfill_notes", ""))
```

- [ ] **Step 2: 实现 enrich 主逻辑**（略，按规则实现）

- [ ] **Step 3: 跑测试**

Run: `pytest scripts/data_integration/tests/test_p2_enrich.py -v`
Expected: 2/2 PASS

- [ ] **Step 4: 提交**

```bash
git add scripts/data_integration/p2_enrich.py scripts/data_integration/tests/test_p2_enrich.py
git commit -m "feat(data_integration): enrich 03 with 01-only columns preserving SSoT (P2.4)"
```

---

### Task 11: 提前批 + 历史年份补缺（P2.5）

**Files:**
- Modify: `scripts/data_integration/p2_enrich.py`

**逻辑:**
- 提前批：01 `提前批招生计划_四川_YYYY.json` 2022-2025 全覆盖；03 提前批稀疏 → 用 01 提前批主键加新行（不与 03 既有主键冲突）
- 历史年份：2022-2024 的 `专业分数线_四川_YYYY.json` 为 03 稀缺年份补行
- 所有新增行在 lineage 中标记 `source="01"`

- [ ] **Step 1: 写测试（fixture 级别）**

覆盖：(a) 提前批 01 独有行写入、(b) 03 中已有相同主键时不重复、(c) lineage 正确写入。

- [ ] **Step 2: 实现**

- [ ] **Step 3: 跑测试 + 真实 dry-run，记录 coverage 变化**

- [ ] **Step 4: 提交**

```bash
git add scripts/data_integration/p2_enrich.py scripts/data_integration/tests/test_p2_enrich.py
git commit -m "feat(data_integration): backfill 提前批 + 历史年份 from 01 (P2.5)"
```

---

## 阶段 P2.5：终报告

### Task 12: `p2_report` — P2_report.md + coverage_uplift.md

**Files:**
- Create: `scripts/data_integration/p2_report.py`

**P2_report.md 内容:**
- 输入清单（03 + 01 + 映射表文件与 SHA256）
- 处理总览（match / left_only / right_only 计数）
- 差异报告摘要（anomaly 条数按字段/年份）
- 独有字段合入列清单
- 补缺统计（提前批新增 N 行、历史年份补缺 N 行）
- 20 条随机抽样（含 anomaly 与补缺各 10 条）方便人工验收
- 验收清单复刻 design.md P2 验收标准

**coverage_uplift.md 内容:**
- 各年份 × 批次 × 科目在 P1 结束时 vs P2 结束时的覆盖率对比表
- 以提前批为重点指标

- [ ] **Step 1: 实现报告生成（haiku 机械任务）**

- [ ] **Step 2: 真实运行生成两份 md**

- [ ] **Step 3: 提交**

```bash
git add scripts/data_integration/p2_report.py \
        docs/superpowers/specs/2026-04-17-data-integration-master/P2_report.md \
        docs/superpowers/specs/2026-04-17-data-integration-master/coverage_uplift.md
git commit -m "docs(data_integration): P2 report + coverage uplift summary"
```

---

### Task 13: P2 收尾 — 全量测试 + RUNBOOK 更新

- [ ] **Step 1: 跑全量测试**

Run: `pytest scripts/data_integration/tests/ -v`
Expected: ≥ 45 tests PASS（P1 的 29 + P2 新增 ~16）

- [ ] **Step 2: 更新 RUNBOOK.md**

在进度表把 P2 状态改为 ✅，日志追加 Task 1-12 关键结论、2024 年匹配率、ISSUE-010 scope 调整效果等。

- [ ] **Step 3: 更新 ISSUES.md**

- ISSUE-007/008/009 状态改为 ✅ 已修复（标注 commit）
- ISSUE-001 状态改为 ✅ 已处理（在 Task 5 验证）
- ISSUE-003 状态更新（映射补全进展）
- 登记 P2 过程中发现的新 issue（如 2024 数据质量具体表现、批次歧义剩余条数）

- [ ] **Step 4: 提交**

```bash
git add docs/superpowers/specs/2026-04-17-data-integration-master/RUNBOOK.md \
        docs/superpowers/specs/2026-04-17-data-integration-master/ISSUES.md
git commit -m "docs(data_integration): close P2 in RUNBOOK, update ISSUES"
```

---

## 验收标准对齐（design.md P2）

- [x] 差异报告按差值大小排序（Task 9 `anomaly_diff.xlsx`）
- [x] 补缺前后覆盖率对比（Task 12 `coverage_uplift.md`）
- [ ] 用户抽样 20 条差异记录认可取舍规则（Task 12 抽样表提供给用户）

---

## 交付清单（P2 阶段关闭时）

- **代码**: 3 个新 lib + 5 个 P2 脚本 + 对应 tests（≥16 新 tests）
- **数据产出** (gitignored):
  - `data/_pipeline/P2/code_mapping_patched.csv`
  - `data/_pipeline/P2/join_result.parquet`
  - `data/_pipeline/P2/cross_diff_report.xlsx`
  - `data/_pipeline/P2/anomaly_diff.xlsx`
  - `data/_pipeline/P2/03_enriched.xlsx`
  - `data/_pipeline/P2/lineage_P2.json`
- **验收报告**: `P2_report.md` + `coverage_uplift.md`
- **文档更新**: RUNBOOK.md P2 关闭，ISSUES.md 4 项状态更新

---

## Self-Review（写完本 plan 后自审）

- [x] Spec 覆盖：P2.1/P2.2/P2.3/P2.4/P2.5 每节都有对应 task
- [x] ISSUE-007/008/009/001 都有专门 task 或步骤处理
- [x] 关键类型/函数名在 plan 前后一致（`PRIMARY_KEY`、`is_anomaly`、`join_03_and_01`、`enrich_with_01`）
- [x] 没有 TBD / TODO / "implement later"
- [x] 每个 TDD 任务都有"写测试 → 跑失败 → 实现 → 跑通过 → 提交"五步
- [ ] 潜在风险：Task 11（补缺）依赖 03 主键分布的真实情况，可能需要 dry-run 后回头调整 scope — 接受为"开工后可能收紧"
