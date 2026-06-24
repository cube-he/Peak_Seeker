# 86 列主表 converter Implementation Plan（子项目 B）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans / TDD task-by-task. Steps use checkbox (`- [ ]`).

**Goal:** 新写按列名读的 `xlsx_to_json_2026.py`，把 86 列主表「四川-2026-专家版数据_批次标准化.xlsx」转成 import_to_db.ts 消费的 JSON（enrollment_plans 含 year=2026 + 历史，admission_records 2025/24/23，majors），缺关键列即 fail-fast；补 schema↔migration 对齐迁移；弃用旧 index.ts 路径。

**Architecture:** 新增独立 Python 脚本（不动 xlsx_to_json.py 的旧逻辑）；converter 函数吃 `dict`(列名→值)，与列序解耦；universities 仍由旧 `convert_universities(院校信息表.xlsx)` 提供（main 复用 import）。import_to_db.ts 不改。

**Tech Stack:** Python + openpyxl + pytest（复用 test_xlsx_to_json.py 范式）；Prisma migration。

参考设计：`docs/superpowers/specs/2026-06-24-86col-converter-design.md`（含完整 86 列→字段映射表，本计划不重复，按表实现）。

---

## File Structure

- 新建：`scripts/data-processing/xlsx_to_json_2026.py`（converter）
- 新建：`scripts/data-processing/test_xlsx_to_json_2026.py`（pytest）
- 新建：`apps/server/prisma/migrations/<ts>_align_enrollment_admission_keys/migration.sql`（对齐迁移）
- 新建：`scripts/import-data/DEPRECATED.md`
- 修改：根 `package.json`（移除/注释 `import:data`）
- 不改：`import_to_db.ts`、`xlsx_to_json.py`（universities 部分复用）

**converter 公开函数**（均吃 dict，便于测试）：
`REQUIRED_COLS`、`build_header_index(header)->dict`、`row_to_dict(row,H)->dict`、`convert_majors(rows)->list`、`convert_plans_row(r)->list`、`convert_admissions_row(r)->list`、`extract_group_name(r)->str|None`、`main()`。

辅助：`_str/_int/_bool_from_str`（'是'→True）复用 xlsx_to_json.py 的语义（可 import 或复制）。`MASTER = data/03_专家版主表/output/四川-2026-专家版数据_批次标准化.xlsx`。

---

## Task 1: build_header_index + fail-fast

**Files:** Create `xlsx_to_json_2026.py`、`test_xlsx_to_json_2026.py`

- [ ] **Step 1: 失败测试**

```python
import pytest
from xlsx_to_json_2026 import build_header_index, REQUIRED_COLS

HEADER = ["科类","批次","招生类型","院校代码","院校名称","专业组代码","专业代码","专业全称","专业名称","专业备注","其他备注","选科要求","专业层次","计划人数","学费","学制","招生考试报页码","组内专业","专业组计划人数","组内专业数","专业组干净度","门类","专业类","26年预估位次","是否新增","专业组录取人数1","专业组最低分1","专业组最低位次1","录取人数1","最低分1","最低位次1","平均分1","平均位次1","最高分1","最高位次1","老批次1","计划人数结果1","录取人数2","最低分2","最低位次2","平均分2","平均位次2","老批次2","计划人数结果2","录取人数3","最低分3","最低位次3","平均分3","平均位次3","最高分3","最高位次3","老批次3","计划人数结果3","所在省","城市","城市水平标签","院校标签","院校水平","更名合并转设","隶属单位","类型","公私性质","本科/专科","保研率","院校排名","转专业情况","全校硕士专业数","全校硕士专业","全校博士专业数","全校博士专业","录取规则","招生章程","软科评级","软科排名","学科评估","专业水平","本专业硕士点","本专业博士点","投档顺序","志愿设置","25所在组代码","25老组投档线","25老组投档位次","25老组专业数","25老组专业构成","专业组是否改变"]

def test_header_index_maps_names():
    H = build_header_index(tuple(HEADER))
    assert H["计划人数"] == 13
    assert H["专业组计划人数"] == 18

def test_missing_required_column_raises():
    bad = [c for c in HEADER if c != "院校代码"]
    with pytest.raises(ValueError, match="院校代码"):
        build_header_index(tuple(bad))
```

- [ ] **Step 2: 看失败** — `cd scripts/data-processing && python -m pytest test_xlsx_to_json_2026.py -q` → ImportError/未定义。

- [ ] **Step 3: 实现**

```python
REQUIRED_COLS = [
    "科类", "批次", "招生类型", "院校代码", "专业组代码", "专业代码", "专业名称",
    "本科/专科", "计划人数", "专业组计划人数",
    # admission/historical 关键列
    "录取人数1", "最低分1", "最低位次1", "计划人数结果1",
]

def build_header_index(header) -> dict:
    H = {name: i for i, name in enumerate(header) if name is not None}
    missing = [c for c in REQUIRED_COLS if c not in H]
    if missing:
        raise ValueError(f"主表缺少必需列: {missing}")
    return H

def row_to_dict(row, H) -> dict:
    return {name: row[i] for name, i in H.items()}
```

- [ ] **Step 4: 看通过** — pytest 绿。
- [ ] **Step 5: Commit** `feat(data): 86-col converter — header index + fail-fast`

---

## Task 2: convert_majors（去重 + level 归一）

- [ ] **Step 1: 失败测试**

```python
from xlsx_to_json_2026 import convert_majors

def test_majors_dedupe_and_level():
    rows = [
        {"专业名称":"环境科学","专业代码":"41","门类":"工学","专业类":"环境科学与工程类","本科/专科":"本科","专业备注":"x","专业水平":"A+","软科评级":"A"},
        {"专业名称":"环境科学","专业代码":"41","门类":"工学","专业类":"环境科学与工程类","本科/专科":"本科","专业备注":"x","专业水平":"A+","软科评级":"A"},
        {"专业名称":"护理","专业代码":"50","门类":"医学","专业类":"护理学类","本科/专科":"职业本科","专业备注":None,"专业水平":None,"软科评级":None},
    ]
    majors = convert_majors(rows)
    assert len(majors) == 2  # 环境科学去重
    huli = [m for m in majors if m["name"]=="护理"][0]
    assert huli["level"] == "本科"  # 职业本科→本科
    assert huli["discipline"] == "护理学类"
```

- [ ] **Step 2: 看失败**
- [ ] **Step 3: 实现**（映射见 spec『majors_enriched』表；level=本科/专科 列，职业本科→本科；去重键 (name, level)）

```python
def _norm_level(v):
    s = _str(v) or "本科"
    return "本科" if s == "职业本科" else s

def convert_majors(rows) -> list:
    seen, out = set(), []
    for r in rows:
        name = _str(r.get("专业名称"))
        if not name: continue
        level = _norm_level(r.get("本科/专科"))
        key = (name, level)
        if key in seen: continue
        seen.add(key)
        out.append({
            "name": name, "code": _str(r.get("专业代码")),
            "category": _str(r.get("门类")), "level": level,
            "discipline": _str(r.get("专业类")), "type": None,
            "notes": _str(r.get("专业备注")), "majorLevel": _str(r.get("专业水平")),
            "softRating": _str(r.get("软科评级")),
        })
    return out
```

- [ ] **Step 4: 看通过**  - [ ] **Step 5: Commit** `feat(data): convert_majors with dedupe + level normalize`

---

## Task 3: convert_plans_row（2026 + 历史 2025/24/23）

- [ ] **Step 1: 失败测试**

```python
from xlsx_to_json_2026 import convert_plans_row

def _plan_row(**ov):
    base = {"院校代码":"0001","专业名称":"环境科学","专业代码":"41","专业组代码":"102",
            "科类":"物理","批次":"本科批B段","招生类型":"普通类本科","本科/专科":"本科",
            "选科要求":"化学","是否新增":"否","老批次1":"本科一批","学科评估":"A",
            "本专业硕士点":"是","本专业博士点":None,"软科评级":"A","专业备注":"(中外合作办学)",
            "计划人数":3,"专业组计划人数":20,"学费":5000,"学制":4,
            "计划人数结果1":3,"计划人数结果2":2,"计划人数结果3":None}
    base.update(ov); return base

def test_plans_2026_plus_history():
    plans = convert_plans_row(_plan_row())
    years = sorted(p["year"] for p in plans)
    assert years == [2024, 2025, 2026]  # 结果3 为空→无2023
    p26 = [p for p in plans if p["year"]==2026][0]
    assert p26["planCount"]==3 and p26["groupPlanCount"]==20 and p26["tuition"]==5000
    assert p26["subjects"]=="物理" and p26["recruitType"]=="普通类本科"
    assert p26["planNotes"]=="(中外合作办学)"  # 中外合作回填用
    p25 = [p for p in plans if p["year"]==2025][0]
    assert p25["planCount"]==3 and p25["groupPlanCount"] is None
```

- [ ] **Step 2: 看失败**
- [ ] **Step 3: 实现**（shared 字段见 spec『enrollment_plans shared』表；2026 用 计划人数+专业组计划人数+学费+学制；2025/24/23 用 计划人数结果1/2/3，groupPlanCount/tuition/duration=None，结果列为空则跳过该年；universityEnrollCode=院校代码、subjects=科类、level 归一、planNotes=专业备注、groupName=extract_group_name(r)、isNationalFeature/majorRanking/majorHonor=False/None）

- [ ] **Step 4: 看通过**  - [ ] **Step 5: Commit** `feat(data): convert_plans_row — 2026 + historical years`

---

## Task 4: convert_admissions_row（2025 全层 / 2024-2023 专业层）

- [ ] **Step 1: 失败测试**

```python
from xlsx_to_json_2026 import convert_admissions_row

def _adm_row(**ov):
    base = {"院校代码":"0001","专业名称":"环境科学","专业代码":"41","专业组代码":"102",
            "科类":"物理","批次":"本科批B段","招生类型":"普通类本科","本科/专科":"本科",
            "专业组录取人数1":50,"专业组最低分1":600,"专业组最低位次1":12000,
            "录取人数1":3,"最低分1":605,"最低位次1":10000,"平均分1":610,"平均位次1":9000,"最高分1":620,"最高位次1":7000,
            "录取人数2":2,"最低分2":598,"最低位次2":13000,"平均分2":602,"平均位次2":11000,
            "录取人数3":None,"最低分3":None,"最低位次3":None,"平均分3":None,"平均位次3":None,"最高分3":None,"最高位次3":None}
    base.update(ov); return base

def test_admissions_years_and_levels():
    recs = convert_admissions_row(_adm_row())
    years = sorted(r["year"] for r in recs)
    assert years == [2024, 2025]  # 2023 全空→跳过
    r25 = [r for r in recs if r["year"]==2025][0]
    assert r25["groupMinRank"]==12000 and r25["majorMinRank"]==10000 and r25["groupAdmissionCount"]==50
    r24 = [r for r in recs if r["year"]==2024][0]
    assert r24["majorMinRank"]==13000 and r24.get("groupMinRank") is None
```

- [ ] **Step 2: 看失败**
- [ ] **Step 3: 实现**（映射见 spec『admission_records』表：2025 含 group 级(专业组录取人数1/最低分1/位次1)+major 级(录取人数1..最高位次1)；2024 仅 major 级(录取人数2..平均位次2)；2023 major 级(录取人数3..最高位次3)；某年所有值全 None 则跳过。shared：universityEnrollCode/majorName/majorCode/groupCode/subjects=科类/batch/recruitType/province='四川'/level）

- [ ] **Step 4: 看通过**  - [ ] **Step 5: Commit** `feat(data): convert_admissions_row — 2025/2024/2023 split`

---

## Task 5: extract_group_name（定向/专项组）

- [ ] **Step 1: 失败测试**

```python
from xlsx_to_json_2026 import extract_group_name

def test_group_name_directed():
    r = {"专业备注":"(凉山州)(区域教育均衡发展专项计划)","招生类型":"区域教育均衡发展专项计划"}
    assert extract_group_name(r) == "(凉山州)(区域教育均衡发展专项计划)"

def test_group_name_normal_is_none():
    r = {"专业备注":"(中外合作办学)","招生类型":"普通类本科"}
    assert extract_group_name(r) is None
```

- [ ] **Step 2: 看失败**
- [ ] **Step 3: 实现**（仅当 招生类型 含 '专项'/'定向'/'优师'/'公费' 等定向类、或 专业备注 含 州/县+专项 标识时，返回 专业备注 里的定向片段；普通类返回 None。上线前对比生产 group_name 样式微调，先用此 best-effort 规则）

- [ ] **Step 4: 看通过**  - [ ] **Step 5: Commit** `feat(data): extract_group_name for directed/special groups`

---

## Task 6: main() 串联 + 端到端计数校验

- [ ] **Step 1:** 实现 main()：openpyxl 读 MASTER → header → build_header_index → 逐行 row_to_dict → 收集 majors(去重)/plans/records → 复用 `xlsx_to_json.convert_universities(院校信息表.xlsx)` → write 4 个 JSON 到 out-dir。打印各计数 + 院校代码未命中清单。
- [ ] **Step 2:** 跑真实文件：`python xlsx_to_json_2026.py --out-dir=output_2026`
- [ ] **Step 3: 断言计数**（端到端，非单测）：enrollment_plans year=2026 ≈ 51878；2025/2024/2023 ≈ 36772/30746/28823（= 计划人数结果1/2/3 填充数）；admission 2025 ≈ 录取人数1 填充数(36772 行级，注意 admission 是专业级)；majors 去重数合理；universities 命中率 100%（打印未命中）。
- [ ] **Step 4: Commit** `feat(data): xlsx_to_json_2026 main + end-to-end counts`

---

## Task 7: schema↔migration 对齐迁移

- [ ] **Step 1:** 生产只读核结构：`ssh ... mysql -e "SHOW CREATE TABLE enrollment_plans\G; SHOW CREATE TABLE admission_records\G"`，记录真实列与唯一键。
- [ ] **Step 2:** 写幂等 migration `apps/server/prisma/migrations/<ts>_align_enrollment_admission_keys/migration.sql`：对缺失列 `ADD COLUMN IF NOT EXISTS recruit_type/major_code/major_name/group_code ...`、`CREATE UNIQUE INDEX IF NOT EXISTS` 8 字段键，与 schema.prisma:639/703 对齐。
- [ ] **Step 3: 本地验证**：干净测试库 `prisma migrate deploy` → `SHOW CREATE TABLE` 结构与生产一致、与 schema 一致。
- [ ] **Step 4: Commit** `fix(db): align enrollment/admission 8-col key migration with prod`

---

## Task 8: 弃用旧 index.ts 路径

- [ ] **Step 1:** 根 `package.json` 注释/移除 `"import:data": "cd scripts/import-data && tsx index.ts"`。
- [ ] **Step 2:** 新建 `scripts/import-data/DEPRECATED.md`：说明 source-of-truth 是 `scripts/data-processing/import_to_db.ts`（8 字段全键），index.ts/generate-sql.ts 用旧 4 字段键、与现 schema 不符，勿用。
- [ ] **Step 3: Commit** `chore(data): deprecate legacy import-data path`

---

## 完成后验证

- [ ] pytest 全绿：`cd scripts/data-processing && python -m pytest test_xlsx_to_json_2026.py -q`。
- [ ] 端到端计数符合预期（Task 6）。
- [ ] migration 在干净库可重建（Task 7）。
- [ ] ⚠️ 入库前提：仅在 A 部署上线后，方可用本 converter 产出导入生产（先 A 再导 2026 计划，见 [[sourceyear_coupling_blocker]]）。本子项目只产 JSON + 改管线，不直接 import 生产。
