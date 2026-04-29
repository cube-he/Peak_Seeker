# 03/H 源补充 enrollments.json Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 H 源（`2026四川高考志愿_清洗后_修改.xlsx`，48132 行 × 87 列）补充 enrollments.json 的空缺字段，重点填充 25 年 group-level 投档分（当前 0%）、各年 avgRank/maxRank（当前 ~0%）、以及其他历年分数缺口。

**Architecture:** 沿用 `supplement_from_03.py`（03/A）的框架——5 字段精确匹配 + 名称置信度降级，新建 `supplement_from_03h.py`。H 的批次字段只需 6 条映射（提前批不在 enrollments 中），无歧义。回填只写空位，不覆盖已有值，冲突输出 CSV。

**Tech Stack:** Python 3 + openpyxl + 现有 `three_layer/` 模块（`field_comparator.compare_string`, `conflict_reporter.ConflictReporter`）

**Spec:** brainstorming 阶段口头确认，无单独 spec 文件

---

## Task 1：创建 supplement_from_03h.py

**Files:**
- Create: `scripts/data_integration/three_layer/supplement_from_03h.py`

- [ ] **Step 1: 写入完整脚本**

```python
# -*- coding: utf-8 -*-
"""Supplement enrollments.json with fields from 03/H (清洗后修改版).

H source: data/03_专家版主表/2026四川高考志愿_清洗后_修改.xlsx (48132 rows × 87 cols)

Key contributions over A:
  - Group-level: 25投档最低分/位次 (Col21-22), 25专业组录取人数/最低分/位次 (Col23-25)
  - Group-level: 24专业组最低分/位次/录取人数 (Col33-35)
  - Major-level: various avgRank/maxRank across years (currently ~0%)
  - Major-level: additional yearly scores where A was sparse
  - Quality: 软科评级/排名, 学科评估, 专业水平, 硕博点 etc.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
import openpyxl

from three_layer.field_comparator import compare_string
from three_layer.conflict_reporter import ConflictReporter, ConflictRecord

DATA_03 = Path(__file__).resolve().parents[3] / "data" / "03_专家版主表"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"

# H batch (Col13) → batchNodeId. Only 6 batches exist in enrollments.
_H_BATCH_MAP = {
    "本科批B段": "bkp_b",
    "专科批": "zkp",
    "本科批A段(国家专项)": "bkp_a_gjzx",
    "本科批(高校专项)": "bkp_gxzx",
    "本科批A段(地方专项)": "bkp_a_dfzx",
    "本科批(区域教育均衡发展专项)": "bkp_qyjh",
}

# H column index → field mapping
# Group-level yearly fields (keyed by groupCode, shared across majors in same group)
_H_GROUP_FIELDS = {
    # 2025
    21: ("2025", "filingMin"),
    22: ("2025", "filingMinRank"),
    23: ("2025", "groupEnrolled"),
    24: ("2025", "groupMin"),
    25: ("2025", "groupMinRank"),
    # 2024
    33: ("2024", "batchMin"),
    34: ("2024", "batchMinRank"),
    35: ("2024", "batchEnrolled"),
}

# Major-level yearly fields
_H_YEARLY_FIELDS = {
    # 2025
    17: ("2025", "plan"),
    26: ("2025", "enrolled"),
    27: ("2025", "min"),
    28: ("2025", "minRank"),
    29: ("2025", "avg"),
    30: ("2025", "avgRank"),
    31: ("2025", "max"),
    32: ("2025", "maxRank"),
    # 2024
    36: ("2024", "enrolled"),
    37: ("2024", "min"),
    38: ("2024", "minRank"),
    39: ("2024", "avg"),
    40: ("2024", "avgRank"),
    41: ("2024", "max"),
    42: ("2024", "maxRank"),
    # 2023
    43: ("2023", "enrolled"),
    44: ("2023", "min"),
    45: ("2023", "minRank"),
    46: ("2023", "avg"),
    47: ("2023", "avgRank"),
    48: ("2023", "max"),
    49: ("2023", "maxRank"),
    # 2022
    50: ("2022", "enrolled"),
    51: ("2022", "min"),
    52: ("2022", "minRank"),
    53: ("2022", "avg"),
    54: ("2022", "avgRank"),
    55: ("2022", "max"),
    56: ("2022", "maxRank"),
}

# Major-level quality fields
_H_QUALITY_FIELDS = {
    71: "assessment",      # 学科评估等级
    72: "rating",          # 软科评级
    73: "rank",            # 软科排名
    74: "assessment",      # 学科评估（与71重复? 取非空）
    75: "level",           # 专业水平
    76: "isNationalFeatured",  # 是否国家特色
    77: "majorRank",       # 专业排名
    78: "honor",           # 专业荣誉
    85: "masterPoint",     # 本专业硕士点
    86: "doctoralPoint",   # 本专业博士点
}


def _safe(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


def _safe_num(v) -> int | float | None:
    """Parse numeric value, return None if not a number."""
    if v is None:
        return None
    s = str(v).strip()
    if not s:
        return None
    try:
        f = float(s)
        return int(f) if f == int(f) else f
    except (ValueError, OverflowError):
        return None


def _load_source_h() -> tuple[dict, dict, dict]:
    """Load Source H indexed by 5-field key.

    Returns:
      exact_index: (school, subject, batchNodeId, groupCode, profCode) → row_data
      candidate_index: (school, subject, batchNodeId) → [row_data]
      group_index: (school, subject, batchNodeId, groupCode) → group_fields
    """
    path = DATA_03 / "2026四川高考志愿_清洗后_修改.xlsx"
    wb = openpyxl.load_workbook(path, read_only=True)
    ws = wb.active

    exact_index = {}
    candidate_index = defaultdict(list)
    group_index = {}
    skipped_batch = 0

    for row in ws.iter_rows(min_row=2, values_only=True):
        code = str(row[1]).strip().zfill(4) if row[1] else ""
        subject = _safe(row[10])
        prof_code = _safe(row[6])
        batch_raw = _safe(row[13]) or ""
        group_code = _safe(row[2]) or ""
        prof_name = _safe(row[5])
        if not code or not subject or not prof_code:
            continue

        node_id = _H_BATCH_MAP.get(batch_raw)
        if not node_id:
            skipped_batch += 1
            continue

        # Collect all fields from this row
        row_data = {
            "profName": prof_name,
            "profCode": prof_code,
            "groupCode": group_code,
        }

        # Major yearly
        for col_idx, (year, field) in _H_YEARLY_FIELDS.items():
            val = _safe_num(row[col_idx])
            if val is not None:
                row_data.setdefault("yearly", {}).setdefault(year, {})[field] = val

        # Quality
        for col_idx, qfield in _H_QUALITY_FIELDS.items():
            val = _safe(row[col_idx])
            if val:
                # 去重: Col71 和 Col74 都映射 assessment，取非空
                if qfield not in row_data.setdefault("quality", {}):
                    row_data["quality"][qfield] = val

        # 5-field exact key
        exact_key = (code, subject, node_id, group_code, prof_code)
        if exact_key not in exact_index:
            exact_index[exact_key] = row_data

        # Candidate index for confidence matching
        cand_key = (code, subject, node_id)
        candidate_index[cand_key].append(row_data)

        # Group-level fields (same group shares these values)
        grp_key = (code, subject, node_id, group_code)
        if grp_key not in group_index:
            grp_fields = {}
            for col_idx, (year, field) in _H_GROUP_FIELDS.items():
                val = _safe_num(row[col_idx])
                if val is not None:
                    grp_fields.setdefault(year, {})[field] = val
            if grp_fields:
                group_index[grp_key] = grp_fields

    wb.close()

    print(f"  Skipped (batch not in enrollments): {skipped_batch}")
    return exact_index, candidate_index, group_index


def supplement():
    """Supplement enrollments.json from Source H."""
    enroll_path = OUTPUT_DIR / "enrollments.json"
    with open(enroll_path, "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    print("Loading Source H...")
    exact_index, candidate_index, group_index = _load_source_h()
    print(f"  Exact index: {len(exact_index)} entries")
    print(f"  Candidate index: {len(candidate_index)} combos")
    print(f"  Group index: {len(group_index)} groups")

    stats = {
        "exact_match": 0,
        "confidence_match": 0,
        "no_match": 0,
        "fields_filled": defaultdict(int),
        "conflicts": 0,
        "groups_filled": defaultdict(int),
    }

    for school_code, subjects in enrollments["data"].items():
        for subject, enroll_list in subjects.items():
            for enroll in enroll_list:
                node_id = enroll.get("batchNodeId", "")

                for group in enroll["groups"]:
                    group_code = group.get("groupCode") or ""

                    # --- Group-level fill ---
                    grp_key = (school_code, subject, node_id, group_code)
                    grp_src = group_index.get(grp_key)
                    if grp_src:
                        gy = group.setdefault("groupYearly", {})
                        for year, fields in grp_src.items():
                            yr_dict = gy.setdefault(year, {})
                            for field, val in fields.items():
                                if yr_dict.get(field) is None:
                                    yr_dict[field] = val
                                    stats["groups_filled"][f"groupYearly.{year}.{field}"] += 1
                                elif yr_dict[field] != val:
                                    stats["conflicts"] += 1

                    # --- Major-level fill ---
                    for major in group["majors"]:
                        prof_code = major.get("code", "")
                        major_name = major.get("name", "")

                        # Phase 1: Exact 5-field match
                        exact_key = (school_code, subject, node_id, group_code, prof_code)
                        src = exact_index.get(exact_key)

                        if src:
                            stats["exact_match"] += 1
                        else:
                            # Phase 2: Confidence match
                            candidates = candidate_index.get((school_code, subject, node_id), [])
                            best_score = 0.0
                            best_src = None
                            for c in candidates:
                                name_sim = compare_string(major_name, c.get("profName", ""))
                                if name_sim > best_score:
                                    best_score = name_sim
                                    best_src = c
                            if best_score >= 0.90:
                                src = best_src
                                stats["confidence_match"] += 1
                            else:
                                stats["no_match"] += 1
                                continue

                        # Fill yearly scores
                        src_yearly = src.get("yearly", {})
                        for year, fields in src_yearly.items():
                            yr_dict = major.setdefault("yearly", {}).setdefault(year, {})
                            for field, val in fields.items():
                                if yr_dict.get(field) is None:
                                    yr_dict[field] = val
                                    stats["fields_filled"][f"yearly.{year}.{field}"] += 1
                                elif yr_dict[field] != val:
                                    stats["conflicts"] += 1

                        # Fill quality
                        src_quality = src.get("quality", {})
                        quality = major.setdefault("quality", {})
                        for qf, qv in src_quality.items():
                            if not quality.get(qf):
                                if qf == "rank" and str(qv).isdigit():
                                    quality[qf] = int(qv)
                                else:
                                    quality[qf] = qv
                                stats["fields_filled"][f"quality.{qf}"] += 1
                            elif str(quality[qf]) != str(qv):
                                stats["conflicts"] += 1

    # Save
    with open(enroll_path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)

    print(f"\n=== H Supplement Summary ===")
    print(f"  exact_match: {stats['exact_match']}")
    print(f"  confidence_match: {stats['confidence_match']}")
    print(f"  no_match: {stats['no_match']}")
    print(f"  conflicts: {stats['conflicts']}")
    print(f"\n  Group fields filled:")
    for f, c in sorted(stats["groups_filled"].items()):
        print(f"    {f}: +{c}")
    print(f"\n  Major fields filled:")
    for f, c in sorted(stats["fields_filled"].items()):
        print(f"    {f}: +{c}")


if __name__ == "__main__":
    supplement()
```

- [ ] **Step 2: 运行**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python -c "import sys; sys.path.insert(0, 'scripts/data_integration'); from three_layer.supplement_from_03h import supplement; supplement()"
```

预期输出：
- exact_match ≈ 44000+（H 与 enrollments 高度重合）
- confidence_match < 100
- no_match < 1000（主要是 bkp_gspyd 等 H 无对应批次的记录）
- 重点关注 `groupYearly.2025.filingMin` 等从 0% 开始的字段

- [ ] **Step 3: 验证字段覆盖率变化**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
python -c "
import json, sys
sys.stdout.reconfigure(encoding='utf-8')
data = json.load(open('scripts/data_integration/three_layer_output/enrollments.json','r',encoding='utf-8'))
total = 0
total_groups = 0
field_stats = {}
group_stats = {}
for sc, subjs in data['data'].items():
    for subj, enrls in subjs.items():
        for enrl in enrls:
            for g in enrl.get('groups', []):
                total_groups += 1
                gy = g.get('groupYearly', {})
                for yr, yd in (gy or {}).items():
                    for k, v in (yd or {}).items():
                        fk = f'groupYearly.{yr}.{k}'
                        group_stats.setdefault(fk, 0)
                        if v is not None: group_stats[fk] += 1
                for m in g.get('majors', []):
                    total += 1
                    for k, v in m.items():
                        if k == 'yearly':
                            for yr, yd in (v or {}).items():
                                for yk, yv in (yd or {}).items():
                                    fk = f'yearly.{yr}.{yk}'
                                    field_stats.setdefault(fk, 0)
                                    if yv is not None: field_stats[fk] += 1
print(f'Majors: {total}, Groups: {total_groups}')
print('\\n--- Group fields ---')
for k in sorted(group_stats.keys()):
    print(f'  {k}: {group_stats[k]}/{total_groups} ({group_stats[k]/total_groups*100:.1f}%)')
print('\\n--- Yearly fields (sample) ---')
for k in sorted(field_stats.keys()):
    if 'avgRank' in k or 'maxRank' in k or 'filingMin' in k:
        print(f'  {k}: {field_stats[k]}/{total} ({field_stats[k]/total*100:.1f}%)')
"
```

关注：groupYearly.2025.filingMin 从 0% 提升、各年 avgRank/maxRank 从 ~0% 提升。

- [ ] **Step 4: Commit**

```bash
cd C:/Users/Administrator/Documents/VolunteerHelper
git add scripts/data_integration/three_layer/supplement_from_03h.py scripts/data_integration/three_layer_output/enrollments.json
git commit -m "feat: supplement enrollments from 03/H with group-level + yearly scores

H source (87 cols) fills:
- groupYearly.2025: filingMin/Rank, groupEnrolled/Min/MinRank (from 0%)
- groupYearly.2024: batchMin/Rank/Enrolled
- yearly.*.avgRank/maxRank (from ~0%)
- quality fields supplement"
```

---

## 自检

- [x] Spec 覆盖：group-level 2025 投档分 + 2024 专业组 + major-level yearly + quality，全部覆盖
- [x] 占位符扫描：无 TBD/TODO
- [x] 类型一致性：字段名与 enrollments.json 现有结构完全一致（`groupYearly.2025.filingMin` 等已在 schema 定义中）
- [x] 不覆盖已有值，冲突只计数（可扩展输出 CSV）
