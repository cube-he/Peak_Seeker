# Three-Layer Data Structure — Structure Scaffolding

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the structural scaffolding (batch tree, mapping module, schemas, validation) for the three-layer data model — without processing actual data.

**Architecture:** batch_tree_2025.json defines the canonical 39-node hierarchy from 招生考试报. A Python mapping module bridges raw column values to tree node IDs. JSON schemas enforce structure contracts for all three layers.

**Tech Stack:** Python 3, pytest, jsonschema, openpyxl (for mapping validation only)

---

## File Structure

```
scripts/data_integration/
├── three_layer/
│   ├── __init__.py
│   ├── batch_tree.py              # Task 1: 生成 batch_tree_2025.json
│   ├── batch_mapping.py           # Task 2: (录取批次, 招生类型) → batchNodeId
│   ├── schemas.py                 # Task 3: 三层 JSON Schema 定义
│   └── validate_structure.py      # Task 4: 结构校验脚本
├── three_layer_output/
│   └── batch_tree_2025.json       # Task 1 产出
└── tests/
    └── test_three_layer/
        ├── __init__.py
        ├── test_batch_tree.py     # Task 1 测试
        ├── test_batch_mapping.py  # Task 2 测试
        └── test_schemas.py        # Task 3 测试
```

---

### Task 1: batch_tree_2025.json — 完整批次树

**Files:**
- Create: `scripts/data_integration/three_layer/batch_tree.py`
- Create: `scripts/data_integration/three_layer/__init__.py`
- Create: `scripts/data_integration/three_layer_output/batch_tree_2025.json`
- Create: `scripts/data_integration/tests/test_three_layer/__init__.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_batch_tree.py`

- [ ] **Step 1: Write failing tests for batch tree structure**

```python
# tests/test_three_layer/test_batch_tree.py
# -*- coding: utf-8 -*-
"""Tests for batch_tree_2025.json structural correctness."""
import json
from pathlib import Path

import pytest

TREE_PATH = Path(__file__).resolve().parents[2] / "three_layer_output" / "batch_tree_2025.json"


@pytest.fixture
def tree():
    with open(TREE_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def _collect_leaves(node_list: list) -> list:
    """Recursively collect all leaf nodes (nodes without children)."""
    leaves = []
    for node in node_list:
        if "children" in node and node["children"]:
            leaves.extend(_collect_leaves(node["children"]))
        else:
            leaves.append(node)
    return leaves


def _collect_all_ids(node_list: list) -> list:
    """Recursively collect all node IDs."""
    ids = []
    for node in node_list:
        ids.append(node["id"])
        if "children" in node and node["children"]:
            ids.extend(_collect_all_ids(node["children"]))
    return ids


def test_meta_fields(tree):
    assert tree["year"] == 2025
    assert tree["province"] == "四川"
    assert tree["examReform"] == "新高考"
    assert tree["volunteerUnit"] == "院校专业组"
    assert set(tree["scope"]) == {"物理", "历史"}


def test_top_level_batches(tree):
    top_names = [n["name"] for n in tree["tree"]]
    assert top_names == ["本科提前批次", "本科批次", "高职(专科)提前批次", "高职(专科)批次"]


def test_leaf_count(tree):
    leaves = _collect_leaves(tree["tree"])
    assert len(leaves) == 39


def test_all_ids_unique(tree):
    ids = _collect_all_ids(tree["tree"])
    assert len(ids) == len(set(ids)), f"Duplicate IDs: {[x for x in ids if ids.count(x) > 1]}"


def test_leaf_nodes_have_required_fields(tree):
    leaves = _collect_leaves(tree["tree"])
    for leaf in leaves:
        assert "id" in leaf, f"Missing id: {leaf}"
        assert "name" in leaf, f"Missing name: {leaf}"
        assert "subjects" in leaf, f"Missing subjects in {leaf['id']}"
        assert "enrollmentType" in leaf, f"Missing enrollmentType in {leaf['id']}"
        assert "dataStatus" in leaf, f"Missing dataStatus in {leaf['id']}"
        assert leaf["dataStatus"] in ("has_data", "no_data"), f"Bad dataStatus in {leaf['id']}"


def test_has_data_count(tree):
    leaves = _collect_leaves(tree["tree"])
    has_data = [l for l in leaves if l["dataStatus"] == "has_data"]
    no_data = [l for l in leaves if l["dataStatus"] == "no_data"]
    assert len(has_data) == 33
    assert len(no_data) == 6


def test_physics_only_nodes(tree):
    """飞行技术、提前批A段其他、本科批B段其他定向招生 仅物理。"""
    leaves = _collect_leaves(tree["tree"])
    physics_only_ids = {"bktqp_a_fxjs", "bktqp_a_qt", "bkp_b_qtdx"}
    for leaf in leaves:
        if leaf["id"] in physics_only_ids:
            assert leaf["subjects"] == ["物理"], f"{leaf['id']} should be physics-only"
        else:
            assert "历史" in leaf["subjects"], f"{leaf['id']} should include 历史"


def test_volunteer_settings_on_segments(tree):
    """A段、B段等中间节点必须有 volunteer 设置。"""
    for top in tree["tree"]:
        if "children" in top:
            for seg in top["children"]:
                if "children" in seg and seg["children"]:
                    assert "volunteer" in seg, f"Missing volunteer in segment {seg['id']}"
```

- [ ] **Step 2: Run tests — expect FAIL (file not found)**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_batch_tree.py -v
```

Expected: FAIL — `batch_tree_2025.json` does not exist.

- [ ] **Step 3: Write batch_tree.py — generates the complete JSON**

```python
# three_layer/batch_tree.py
# -*- coding: utf-8 -*-
"""Generate batch_tree_2025.json — the canonical batch hierarchy.

Source: 2025年招生考试报·高考指南 目录 (物理类 + 历史类)
Design: docs/superpowers/specs/2026-04-27-three-layer-data-structure-design.md
"""
from __future__ import annotations

import json
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


def build_tree() -> dict:
    return {
        "year": 2025,
        "province": "四川",
        "examReform": "新高考",
        "volunteerUnit": "院校专业组",
        "source": "2025年招生考试报·高考指南",
        "scope": ["物理", "历史"],
        "tree": [
            _本科提前批次(),
            _本科批次(),
            _高职专科提前批次(),
            _高职专科批次(),
        ],
    }


# -- helpers --

_BOTH = ["物理", "历史"]
_PHY = ["物理"]


def _leaf(id: str, name: str, etype: str, order: int,
          subjects=None, data="has_data") -> dict:
    return {
        "id": id,
        "name": name,
        "order": order,
        "subjects": subjects or _BOTH,
        "enrollmentType": etype,
        "dataStatus": data,
    }


def _本科提前批次() -> dict:
    return {
        "id": "bktqp",
        "name": "本科提前批次",
        "order": 1,
        "children": [
            {
                "id": "bktqp_gjzx",
                **_leaf("bktqp_gjzx", "国家专项计划", "国家专项计划", 1),
                "volunteer": {"mode": "parallel", "count": 2},
            },
            {
                "id": "bktqp_a",
                "name": "A段",
                "order": 2,
                "volunteer": {
                    "mode": "sequential_1_2",
                    "count": 3,
                    "desc": "3个志愿(1个第一志愿+2个平行第二志愿)",
                },
                "children": [
                    _leaf("bktqp_a_js",   "军事类",        "军事类",        1),
                    _leaf("bktqp_a_fxjs", "飞行技术",      "飞行技术",      2, _PHY, "no_data"),
                    _leaf("bktqp_a_gasf", "公安类、司法类", "公安类、司法类", 3),
                    _leaf("bktqp_a_hh",   "航海类",        "航海类",        4),
                    _leaf("bktqp_a_xfjy", "消防救援",      "消防救援",      5),
                    _leaf("bktqp_a_zhpj", "高校综合评价",   "高校综合评价",  6),
                    _leaf("bktqp_a_qt",   "其他",          "其他",          7, _PHY, "no_data"),
                ],
            },
            {
                **_leaf("bktqp_gxzx", "高校专项计划", "高校专项计划", 3),
                "volunteer": {"mode": "sequential", "count": 1, "desc": "1个顺序志愿"},
            },
            {
                "id": "bktqp_b",
                "name": "B段",
                "order": 4,
                "volunteer": {"mode": "parallel", "count": 30},
                "children": [
                    _leaf("bktqp_b_gjgfsf", "国家公费师范生",     "国家公费师范生",     1),
                    _leaf("bktqp_b_gjyszx", "国家优师专项",       "国家优师专项",       2),
                    _leaf("bktqp_b_ncddyx", "农村订单定向医学生",  "农村订单定向医学生",  3),
                    _leaf("bktqp_b_sjgfsf", "省级公费师范生",     "省级公费师范生",     4),
                    _leaf("bktqp_b_dfyszx", "地方优师计划",       "地方优师计划",       5),
                    _leaf("bktqp_b_xczx",   "乡村振兴计划",       "乡村振兴计划",       6),
                    _leaf("bktqp_b_qt",     "其他",               "其他",               7),
                ],
            },
        ],
    }


def _本科批次() -> dict:
    return {
        "id": "bkp",
        "name": "本科批次",
        "order": 2,
        "children": [
            {
                "id": "bkp_a",
                "name": "A段",
                "order": 1,
                "volunteer": {"mode": "parallel", "count": 20},
                "children": [
                    _leaf("bkp_a_gjzx", "国家专项计划", "国家专项计划", 1),
                    _leaf("bkp_a_dfzx", "地方专项计划", "地方专项计划", 2),
                ],
            },
            {
                **_leaf("bkp_gxzx", "高校专项计划", "高校专项计划", 2),
                "volunteer": {
                    "mode": "sequential_1_1",
                    "count": 2,
                    "desc": "2个志愿(1个第一志愿+1个第二志愿)",
                },
            },
            {
                **_leaf("bkp_gspyd", "高水平运动队", "高水平运动队", 3, data="no_data"),
                "volunteer": {"mode": "sequential", "count": 1},
            },
            {
                "id": "bkp_b",
                "name": "B段",
                "order": 4,
                "volunteer": {"mode": "parallel", "count": 45},
                "children": [
                    _leaf("bkp_b_pt",     "普通类本科",
                          "普通类本科", 1),
                    _leaf("bkp_b_bkzyjy", "本科层次职业教育人才培养改革试点",
                          "本科层次职业教育人才培养改革试点", 2),
                    _leaf("bkp_b_mzb",    "民族班",
                          "民族班", 3),
                    _leaf("bkp_b_fxzyx",  "非西藏生源定向西藏就业",
                          "非西藏生源定向西藏就业", 4),
                    _leaf("bkp_b_qtdx",   "其他定向招生",
                          "其他定向招生", 5, _PHY, "no_data"),
                    _leaf("bkp_b_yk",
                          "部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科",
                          "部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科",
                          6),
                ],
            },
            {
                "id": "bkp_smzyy",
                "name": "原\"少数民族语言授课为主\"",
                "order": 5,
                "volunteer": {"mode": "parallel", "count": 20},
                "children": [
                    _leaf("bkp_smzyy_bk", "本科", "少数民族语言授课为主·本科", 1, data="no_data"),
                    _leaf("bkp_smzyy_yk", "预科", "少数民族语言授课为主·预科", 2, data="no_data"),
                ],
            },
            {
                **_leaf("bkp_jsmzyw", "原\"加授少数民族语文\"",
                        "加授少数民族语文", 6, data="no_data"),
                "volunteer": {"mode": "parallel", "count": 6},
            },
            {
                **_leaf("bkp_qyjh", "区域教育均衡发展专项计划",
                        "区域教育均衡发展专项计划", 7),
                "volunteer": {"mode": "parallel", "count": 20},
            },
            {
                **_leaf("bkp_sxyk", "省属高校少数民族预科",
                        "省属高校少数民族预科", 8),
                "volunteer": {"mode": "parallel", "count": 20},
            },
        ],
    }


def _高职专科提前批次() -> dict:
    return {
        "id": "zktqp",
        "name": "高职(专科)提前批次",
        "order": 3,
        "volunteer": {
            "mode": "sequential_1_2",
            "count": 3,
            "desc": "3个志愿(1个第一志愿+2个平行第二志愿)",
        },
        "children": [
            _leaf("zktqp_dxpyjs", "定向培养军士",   "定向培养军士",   1),
            _leaf("zktqp_gasf",   "公安类、司法类",  "公安类、司法类", 2),
            _leaf("zktqp_hh",     "航海类",         "航海类",        3),
        ],
    }


def _高职专科批次() -> dict:
    return {
        "id": "zkp",
        "name": "高职(专科)批次",
        "order": 4,
        "children": [
            {
                **_leaf("zkp_pt", "普通类高职(专科)", "普通类高职(专科)", 1),
                "volunteer": {"mode": "parallel", "count": 45},
            },
            {
                **_leaf("zkp_smzyy", "原\"少数民族语言授课为主\"",
                        "少数民族语言授课为主·专科", 2, data="no_data"),
                "volunteer": {"mode": "parallel", "count": 6},
            },
            {
                **_leaf("zkp_jsmzyw", "原\"加授少数民族语文\"",
                        "加授少数民族语文·专科", 3, data="no_data"),
                "volunteer": {"mode": "parallel", "count": 6},
            },
        ],
    }


def generate(output_dir: Path | None = None) -> Path:
    out = output_dir or OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / "batch_tree_2025.json"
    data = build_tree()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


if __name__ == "__main__":
    p = generate()
    print(f"Written to {p}")
```

- [ ] **Step 4: Create `__init__.py` files**

```python
# three_layer/__init__.py
# -*- coding: utf-8 -*-
"""Three-layer data structure scaffolding."""
```

```python
# tests/test_three_layer/__init__.py
```

- [ ] **Step 5: Generate batch_tree_2025.json**

```bash
cd scripts/data_integration && python -m three_layer.batch_tree
```

Expected: `three_layer_output/batch_tree_2025.json` created.

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_batch_tree.py -v
```

Expected: All 9 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/data_integration/three_layer/ scripts/data_integration/three_layer_output/ scripts/data_integration/tests/test_three_layer/
git commit -m "feat: add batch_tree_2025.json with 39-node hierarchy from 招生考试报"
```

---

### Task 2: batch_mapping.py — 录取批次+招生类型 → batchNodeId

**Files:**
- Create: `scripts/data_integration/three_layer/batch_mapping.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_batch_mapping.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_three_layer/test_batch_mapping.py
# -*- coding: utf-8 -*-
"""Tests for batch column values → batchNodeId mapping."""
import pytest

from three_layer.batch_mapping import resolve_batch_node_id, BatchMappingError


# -- 正常映射（覆盖全部 33 个 has_data 叶子） --

@pytest.mark.parametrize("batch,etype,expected", [
    # 本科提前批次
    ("本科提前批(国家专项)", "国家专项计划", "bktqp_gjzx"),
    ("本科提前批A段", "军事类",        "bktqp_a_js"),
    ("本科提前批A段", "公安类、司法类", "bktqp_a_gasf"),
    ("本科提前批A段", "航海类",        "bktqp_a_hh"),
    ("本科提前批A段", "消防救援",      "bktqp_a_xfjy"),
    ("本科提前批A段", "高校综合评价",   "bktqp_a_zhpj"),
    ("本科提前批(高校专项)", "高校专项计划", "bktqp_gxzx"),
    ("本科提前批B段", "国家公费师范生",     "bktqp_b_gjgfsf"),
    ("本科提前批B段", "国家优师专项",       "bktqp_b_gjyszx"),
    ("本科提前批B段", "农村订单定向医学生",  "bktqp_b_ncddyx"),
    ("本科提前批B段", "省级公费师范生",     "bktqp_b_sjgfsf"),
    ("本科提前批B段", "地方优师计划",       "bktqp_b_dfyszx"),
    ("本科提前批B段", "乡村振兴计划",       "bktqp_b_xczx"),
    ("本科提前批B段", "其他",               "bktqp_b_qt"),
    # 本科批次
    ("本科批A段", "国家专项计划", "bkp_a_gjzx"),
    ("本科批A段", "地方专项计划", "bkp_a_dfzx"),
    ("本科批(高校专项)", "高校专项计划", "bkp_gxzx"),
    ("本科批B段", "普通类本科",                                "bkp_b_pt"),
    ("本科批B段", "本科层次职业教育人才培养改革试点",             "bkp_b_bkzyjy"),
    ("本科批B段", "民族班",                                    "bkp_b_mzb"),
    ("本科批B段", "非西藏生源定向西藏就业",                      "bkp_b_fxzyx"),
    ("本科批B段", "部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科", "bkp_b_yk"),
    ("本科批(区域教育均衡发展专项)", "区域教育均衡发展专项计划", "bkp_qyjh"),
    ("本科批(省属高校少数民族预科)", "省属高校少数民族预科",     "bkp_sxyk"),
    # 高职(专科)提前批次
    ("高职(专科)提前批", "定向培养军士",   "zktqp_dxpyjs"),
    ("高职(专科)提前批", "公安类、司法类", "zktqp_gasf"),
    ("高职(专科)提前批", "航海类",        "zktqp_hh"),
    # 高职(专科)批次
    ("高职(专科)批", "普通类高职(专科)", "zkp_pt"),
])
def test_resolve_known_mappings(batch, etype, expected):
    assert resolve_batch_node_id(batch, etype) == expected


def test_unknown_mapping_raises():
    with pytest.raises(BatchMappingError):
        resolve_batch_node_id("不存在的批次", "不存在的类型")


def test_coverage_matches_data():
    """Mapping table should cover exactly the 28 (batch, etype) combos in data."""
    from three_layer.batch_mapping import BATCH_MAPPING
    assert len(BATCH_MAPPING) == 28
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_batch_mapping.py -v
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement batch_mapping.py**

```python
# three_layer/batch_mapping.py
# -*- coding: utf-8 -*-
"""Map raw (录取批次, 招生类型) column values to batch tree node IDs.

This is the bridge between the flat 专业招生主表 and the hierarchical
batch_tree_2025.json. Each (batch, enrollmentType) pair maps to exactly
one leaf node ID.
"""
from __future__ import annotations


class BatchMappingError(KeyError):
    """Unknown (录取批次, 招生类型) combination."""
    pass


# key: (录取批次 as in Col05, 招生类型 as in Col09)
# value: batchNodeId in batch_tree_2025.json
BATCH_MAPPING: dict[tuple[str, str], str] = {
    # ── 本科提前批次 ──
    ("本科提前批(国家专项)", "国家专项计划"):     "bktqp_gjzx",
    ("本科提前批A段", "军事类"):                  "bktqp_a_js",
    ("本科提前批A段", "公安类、司法类"):           "bktqp_a_gasf",
    ("本科提前批A段", "航海类"):                  "bktqp_a_hh",
    ("本科提前批A段", "消防救援"):                "bktqp_a_xfjy",
    ("本科提前批A段", "高校综合评价"):             "bktqp_a_zhpj",
    ("本科提前批(高校专项)", "高校专项计划"):      "bktqp_gxzx",
    ("本科提前批B段", "国家公费师范生"):           "bktqp_b_gjgfsf",
    ("本科提前批B段", "国家优师专项"):             "bktqp_b_gjyszx",
    ("本科提前批B段", "农村订单定向医学生"):       "bktqp_b_ncddyx",
    ("本科提前批B段", "省级公费师范生"):           "bktqp_b_sjgfsf",
    ("本科提前批B段", "地方优师计划"):             "bktqp_b_dfyszx",
    ("本科提前批B段", "乡村振兴计划"):             "bktqp_b_xczx",
    ("本科提前批B段", "其他"):                    "bktqp_b_qt",
    # ── 本科批次 ──
    ("本科批A段", "国家专项计划"):                "bkp_a_gjzx",
    ("本科批A段", "地方专项计划"):                "bkp_a_dfzx",
    ("本科批(高校专项)", "高校专项计划"):          "bkp_gxzx",
    ("本科批B段", "普通类本科"):                  "bkp_b_pt",
    ("本科批B段", "本科层次职业教育人才培养改革试点"): "bkp_b_bkzyjy",
    ("本科批B段", "民族班"):                      "bkp_b_mzb",
    ("本科批B段", "非西藏生源定向西藏就业"):       "bkp_b_fxzyx",
    ("本科批B段", "部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科"): "bkp_b_yk",
    ("本科批(区域教育均衡发展专项)", "区域教育均衡发展专项计划"): "bkp_qyjh",
    ("本科批(省属高校少数民族预科)", "省属高校少数民族预科"):     "bkp_sxyk",
    # ── 高职(专科)提前批次 ──
    ("高职(专科)提前批", "定向培养军士"):          "zktqp_dxpyjs",
    ("高职(专科)提前批", "公安类、司法类"):        "zktqp_gasf",
    ("高职(专科)提前批", "航海类"):               "zktqp_hh",
    # ── 高职(专科)批次 ──
    ("高职(专科)批", "普通类高职(专科)"):          "zkp_pt",
}


def resolve_batch_node_id(batch: str, enrollment_type: str) -> str:
    """Resolve a (录取批次, 招生类型) pair to its batch tree node ID.

    Raises BatchMappingError if the combination is unknown.
    """
    key = (batch, enrollment_type)
    if key not in BATCH_MAPPING:
        raise BatchMappingError(
            f"Unknown (录取批次={batch!r}, 招生类型={enrollment_type!r}). "
            f"Not in BATCH_MAPPING ({len(BATCH_MAPPING)} entries)."
        )
    return BATCH_MAPPING[key]
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_batch_mapping.py -v
```

Expected: All 30 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/batch_mapping.py scripts/data_integration/tests/test_three_layer/test_batch_mapping.py
git commit -m "feat: add batch mapping module (28 combos → batchNodeId)"
```

---

### Task 3: schemas.py — 三层 JSON Schema

**Files:**
- Create: `scripts/data_integration/three_layer/schemas.py`
- Create: `scripts/data_integration/tests/test_three_layer/test_schemas.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_three_layer/test_schemas.py
# -*- coding: utf-8 -*-
"""Tests for JSON schema definitions."""
import pytest
import jsonschema

from three_layer.schemas import (
    BATCH_TREE_SCHEMA,
    SCHOOL_REGISTRY_SCHEMA,
    ENROLLMENT_MAJOR_SCHEMA,
    YEARLY_DATA_SCHEMA,
)


def test_batch_tree_schema_validates_good_tree():
    """batch_tree_2025.json should pass schema validation."""
    import json
    from pathlib import Path
    tree_path = Path(__file__).resolve().parents[2] / "three_layer_output" / "batch_tree_2025.json"
    with open(tree_path, "r", encoding="utf-8") as f:
        tree = json.load(f)
    jsonschema.validate(tree, BATCH_TREE_SCHEMA)


def test_batch_tree_schema_rejects_bad_meta():
    bad = {"year": "not_int", "province": "四川", "tree": []}
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, BATCH_TREE_SCHEMA)


def test_school_registry_schema_validates_sample():
    sample = {
        "meta": {"count": 1, "source": "test", "year": 2025},
        "schools": {
            "0001": {
                "name": "北京大学",
                "location": {"province": "北京", "city": "海淀区"},
                "basic": {"type": "综合", "nature": "公办"},
            }
        },
    }
    jsonschema.validate(sample, SCHOOL_REGISTRY_SCHEMA)


def test_yearly_data_schema_without_supplementary():
    sample = {"plan": 3, "enrolled": 2, "min": 690, "minRank": 80}
    jsonschema.validate(sample, YEARLY_DATA_SCHEMA)


def test_yearly_data_schema_with_supplementary():
    sample = {
        "plan": 3, "enrolled": 2, "min": 690, "minRank": 80,
        "supplementary": [
            {"round": 2, "plan": 5, "enrolled": 4, "min": 620, "minRank": 5800},
        ],
    }
    jsonschema.validate(sample, YEARLY_DATA_SCHEMA)


def test_supplementary_round_not_sequential():
    """round 可以不连续（如只有 round 2）。"""
    sample = {
        "plan": 3, "enrolled": 2,
        "supplementary": [{"round": 3, "plan": 2}],
    }
    jsonschema.validate(sample, YEARLY_DATA_SCHEMA)


def test_enrollment_major_schema():
    sample = {
        "code": "01",
        "name": "数学类",
        "fullName": "数学类(含...)",
        "category": "数学类",
        "discipline": "理学",
        "duration": 4,
        "tuition": 5000,
        "yearly": {
            "2025": {"plan": 3},
            "2024": {"plan": 2, "enrolled": 2, "min": 690, "minRank": 80},
        },
    }
    jsonschema.validate(sample, ENROLLMENT_MAJOR_SCHEMA)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd scripts/data_integration && python -m pytest tests/test_three_layer/test_schemas.py -v
```

- [ ] **Step 3: Implement schemas.py**

```python
# three_layer/schemas.py
# -*- coding: utf-8 -*-
"""JSON Schema definitions for the three-layer data model.

Schemas:
- BATCH_TREE_SCHEMA      → batch_tree_2025.json
- SCHOOL_REGISTRY_SCHEMA  → school_registry.json
- ENROLLMENT_MAJOR_SCHEMA → single major entry in enrollments.json
- YEARLY_DATA_SCHEMA      → yearly data block (with optional supplementary)
"""

SUPPLEMENTARY_ROUND_SCHEMA = {
    "type": "object",
    "required": ["round", "plan"],
    "properties": {
        "round":   {"type": "integer", "minimum": 1},
        "plan":    {"type": "integer", "minimum": 0},
        "enrolled": {"type": ["integer", "null"]},
        "min":      {"type": ["integer", "null"]},
        "minRank":  {"type": ["integer", "null"]},
        "avg":      {"type": ["number", "null"]},
        "avgRank":  {"type": ["integer", "null"]},
        "max":      {"type": ["integer", "null"]},
        "maxRank":  {"type": ["integer", "null"]},
    },
    "additionalProperties": False,
}

YEARLY_DATA_SCHEMA = {
    "type": "object",
    "properties": {
        "plan":     {"type": ["integer", "null"]},
        "enrolled": {"type": ["integer", "null"]},
        "min":      {"type": ["integer", "null"]},
        "minRank":  {"type": ["integer", "null"]},
        "avg":      {"type": ["number", "null"]},
        "avgRank":  {"type": ["integer", "null"]},
        "max":      {"type": ["integer", "null"]},
        "maxRank":  {"type": ["integer", "null"]},
        "supplementary": {
            "type": "array",
            "items": SUPPLEMENTARY_ROUND_SCHEMA,
        },
    },
    "additionalProperties": False,
}

ENROLLMENT_MAJOR_SCHEMA = {
    "type": "object",
    "required": ["code", "name", "category", "discipline", "yearly"],
    "properties": {
        "code":       {"type": "string"},
        "name":       {"type": "string"},
        "fullName":   {"type": ["string", "null"]},
        "category":   {"type": ["string", "null"]},
        "discipline": {"type": ["string", "null"]},
        "majorNote":  {"type": ["string", "null"]},
        "isNew":      {"type": ["boolean", "null"]},
        "duration":   {"type": ["integer", "null"]},
        "tuition":    {"type": ["integer", "number", "null"]},
        "oldBatch":   {"type": ["string", "null"]},
        "oldBatch2":  {"type": ["string", "null"]},
        "quality":    {"type": "object"},
        "yearly": {
            "type": "object",
            "patternProperties": {
                r"^\d{4}$": YEARLY_DATA_SCHEMA,
            },
            "additionalProperties": False,
        },
    },
}

_BATCH_NODE_SCHEMA = {
    "type": "object",
    "required": ["id", "name"],
    "properties": {
        "id":             {"type": "string"},
        "name":           {"type": "string"},
        "order":          {"type": "integer"},
        "subjects":       {"type": "array", "items": {"type": "string"}},
        "enrollmentType": {"type": "string"},
        "dataStatus":     {"enum": ["has_data", "no_data"]},
        "volunteer":      {"type": "object"},
        "children":       {"type": "array", "items": {"$ref": "#/$defs/batchNode"}},
    },
}

BATCH_TREE_SCHEMA = {
    "type": "object",
    "required": ["year", "province", "tree"],
    "properties": {
        "year":          {"type": "integer"},
        "province":      {"type": "string"},
        "examReform":    {"type": "string"},
        "volunteerUnit": {"type": "string"},
        "source":        {"type": "string"},
        "scope":         {"type": "array", "items": {"type": "string"}},
        "tree":          {"type": "array", "items": {"$ref": "#/$defs/batchNode"}},
    },
    "$defs": {
        "batchNode": _BATCH_NODE_SCHEMA,
    },
}

SCHOOL_REGISTRY_SCHEMA = {
    "type": "object",
    "required": ["meta", "schools"],
    "properties": {
        "meta": {
            "type": "object",
            "required": ["count", "source", "year"],
            "properties": {
                "count":  {"type": "integer"},
                "source": {"type": "string"},
                "year":   {"type": "integer"},
            },
        },
        "schools": {
            "type": "object",
            "patternProperties": {
                r"^\d{4}$": {
                    "type": "object",
                    "required": ["name", "location", "basic"],
                },
            },
        },
    },
}
```

- [ ] **Step 4: Install jsonschema if needed, run tests**

```bash
cd scripts/data_integration && pip install jsonschema -q && python -m pytest tests/test_three_layer/test_schemas.py -v
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/data_integration/three_layer/schemas.py scripts/data_integration/tests/test_three_layer/test_schemas.py
git commit -m "feat: add JSON schemas for three-layer data model"
```

---

### Task 4: validate_structure.py — 结构校验脚本

**Files:**
- Create: `scripts/data_integration/three_layer/validate_structure.py`

- [ ] **Step 1: Write the validation script**

```python
# three_layer/validate_structure.py
# -*- coding: utf-8 -*-
"""Validate structural integrity of three-layer data files.

Run after generating any layer to check:
1. batch_tree_2025.json passes schema + leaf count
2. All batchNodeIds in BATCH_MAPPING exist in batch_tree
3. BATCH_MAPPING covers all (录取批次, 招生类型) combos in 专业招生主表

Usage:
  python -m three_layer.validate_structure           # check tree + mapping only
  python -m three_layer.validate_structure --data     # also verify against xlsx
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import jsonschema

from three_layer.batch_tree import OUTPUT_DIR
from three_layer.batch_mapping import BATCH_MAPPING
from three_layer.schemas import BATCH_TREE_SCHEMA

MASTER_TABLE = Path("data/03_专家版主表/output/专业招生主表.xlsx")


def _collect_leaves(nodes: list) -> list:
    leaves = []
    for n in nodes:
        if "children" in n and n["children"]:
            leaves.extend(_collect_leaves(n["children"]))
        else:
            leaves.append(n)
    return leaves


def _collect_all_ids(nodes: list) -> set:
    ids = set()
    for n in nodes:
        ids.add(n["id"])
        if "children" in n and n["children"]:
            ids.update(_collect_all_ids(n["children"]))
    return ids


def check_tree() -> list[str]:
    """Validate batch_tree_2025.json."""
    errors = []
    path = OUTPUT_DIR / "batch_tree_2025.json"
    if not path.exists():
        return [f"MISSING: {path}"]

    with open(path, "r", encoding="utf-8") as f:
        tree = json.load(f)

    try:
        jsonschema.validate(tree, BATCH_TREE_SCHEMA)
    except jsonschema.ValidationError as e:
        errors.append(f"SCHEMA: {e.message}")

    leaves = _collect_leaves(tree["tree"])
    if len(leaves) != 39:
        errors.append(f"LEAF_COUNT: expected 39, got {len(leaves)}")

    ids = _collect_all_ids(tree["tree"])
    if len(ids) != len(list(_flat_ids(tree["tree"]))):
        errors.append("DUPLICATE_IDS found")

    return errors


def _flat_ids(nodes):
    for n in nodes:
        yield n["id"]
        if "children" in n and n["children"]:
            yield from _flat_ids(n["children"])


def check_mapping_vs_tree() -> list[str]:
    """Every batchNodeId in BATCH_MAPPING must exist in batch_tree."""
    errors = []
    path = OUTPUT_DIR / "batch_tree_2025.json"
    if not path.exists():
        return ["SKIP: batch_tree not found"]

    with open(path, "r", encoding="utf-8") as f:
        tree = json.load(f)

    tree_ids = _collect_all_ids(tree["tree"])
    for (batch, etype), node_id in BATCH_MAPPING.items():
        if node_id not in tree_ids:
            errors.append(f"ORPHAN: ({batch}, {etype}) → {node_id} not in tree")

    return errors


def check_mapping_vs_data() -> list[str]:
    """Every (录取批次, 招生类型) in 专业招生主表 must be in BATCH_MAPPING."""
    errors = []
    if not MASTER_TABLE.exists():
        return [f"SKIP: {MASTER_TABLE} not found"]

    import openpyxl
    wb = openpyxl.load_workbook(MASTER_TABLE, read_only=True)
    ws = wb.active
    missing = set()
    for row in ws.iter_rows(min_row=2, values_only=True):
        batch = str(row[5]) if row[5] else ""
        etype = str(row[9]) if row[9] else ""
        key = (batch, etype)
        if key not in BATCH_MAPPING:
            missing.add(key)
    wb.close()

    for k in sorted(missing):
        errors.append(f"UNMAPPED: {k}")
    return errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", action="store_true",
                        help="Also verify mapping against 专业招生主表.xlsx")
    args = parser.parse_args()

    all_errors = []

    print("Checking batch_tree_2025.json...")
    errs = check_tree()
    all_errors.extend(errs)
    print(f"  {'PASS' if not errs else f'FAIL ({len(errs)} errors)'}")

    print("Checking BATCH_MAPPING vs tree...")
    errs = check_mapping_vs_tree()
    all_errors.extend(errs)
    print(f"  {'PASS' if not errs else f'FAIL ({len(errs)} errors)'}")

    if args.data:
        print("Checking BATCH_MAPPING vs 专业招生主表...")
        errs = check_mapping_vs_data()
        all_errors.extend(errs)
        print(f"  {'PASS' if not errs else f'FAIL ({len(errs)} errors)'}")

    if all_errors:
        print(f"\n{len(all_errors)} error(s):")
        for e in all_errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("\nAll checks passed.")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Run structure-only validation**

```bash
cd scripts/data_integration && python -m three_layer.validate_structure
```

Expected: All checks passed.

- [ ] **Step 3: Run with --data flag to verify against real xlsx**

```bash
cd scripts/data_integration && python -m three_layer.validate_structure --data
```

Expected: All checks passed (28 BATCH_MAPPING entries cover all combos in 专业招生主表).

- [ ] **Step 4: Commit**

```bash
git add scripts/data_integration/three_layer/validate_structure.py
git commit -m "feat: add structural validation for batch tree and mapping"
```
