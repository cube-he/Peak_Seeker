# 专家版主表 × 全国基础库 数据合并 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以专家版 output/ 为基底，合入基础库补充字段 + 校验准确性，覆盖产出可部署数据。

**Architecture:** 单脚本 `merge_base_library.py` 分函数处理各数据源，通过院校名称 left join 合入基础库字段，输出覆盖 output/ + 校验报告到 08_数据治理记录/。

**Tech Stack:** Python 3, pandas 2.3.3, openpyxl 3.1.5

**路径约定：**
```
BASE = C:/Users/Administrator/Documents/志愿填报/高考志愿/data
EXPERT = {BASE}/03_专家版主表/output
BASELIB = {BASE}/02_全国基础库
REPORT = {BASE}/08_数据治理记录
SCRIPT = {BASE}/03_专家版主表/scripts/merge_base_library.py
```

---

### Task 1: 脚本骨架 + 名称映射表

**Files:**
- Create: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 创建脚本骨架，包含路径常量、名称映射表和数据加载函数**

```python
"""专家版主表 × 全国基础库 数据合并脚本

将 02_全国基础库/ 的补充字段合入 03_专家版主表/output/院校信息表，
同时产出学科评估独立表和数据校验报告。
"""
import pandas as pd
from pathlib import Path

BASE = Path(r"C:\Users\Administrator\Documents\志愿填报\高考志愿\data")
EXPERT = BASE / "03_专家版主表" / "output"
BASELIB = BASE / "02_全国基础库"
REPORT = BASE / "08_数据治理记录"

# 29所更名院校映射：专家版名称 → 基础库名称
# left=专家版, right=基础库各表中可能出现的名称
NAME_MAP = {
    "应急管理大学": "华北科技学院",
    # 其余映射在 Step 3 补全
}


def load_expert():
    """加载专家版院校信息表"""
    df = pd.read_excel(EXPERT / "院校信息表.xlsx")
    print(f"专家版院校信息表: {df.shape[0]}行, {df.shape[1]}列")
    return df


def load_base_sources():
    """加载所有基础库数据源，返回 dict"""
    sources = {}
    sources["院校库"] = pd.read_excel(BASELIB / "院校库_全国.xlsx")
    sources["名录"] = pd.read_excel(BASELIB / "全国高校完整名录_阳光高考.xlsx", header=2)
    sources["章程"] = pd.read_excel(BASELIB / "招生章程结构化_全国_2025.xlsx")
    sources["满意度"] = pd.read_excel(BASELIB / "院校满意度_全国_阳光高考.xlsx")
    sources["学科评估"] = pd.read_excel(BASELIB / "学科评估_全国.xlsx")
    for k, v in sources.items():
        print(f"{k}: {v.shape[0]}行, {v.shape[1]}列")
    return sources


def normalize_name(df, name_col, name_map):
    """统一院校名称：将基础库中的旧名映射为专家版名称"""
    reverse_map = {v: k for k, v in name_map.items()}
    df[name_col] = df[name_col].map(lambda x: reverse_map.get(x, x))
    return df


def left_join(expert_df, source_df, source_name_col, columns, suffixes=("", "_drop")):
    """以专家版为基准 left join 基础库数据源"""
    source_df = normalize_name(source_df.copy(), source_name_col, NAME_MAP)
    subset = source_df[[source_name_col] + columns].drop_duplicates(subset=[source_name_col])
    merged = expert_df.merge(
        subset, left_on="院校名称", right_on=source_name_col,
        how="left", suffixes=suffixes
    )
    if source_name_col != "院校名称":
        merged.drop(columns=[source_name_col], inplace=True, errors="ignore")
    matched = merged[columns[0]].notna().sum()
    print(f"  合入 {len(columns)} 列, 匹配 {matched}/{len(expert_df)} ({matched/len(expert_df)*100:.1f}%)")
    return merged


if __name__ == "__main__":
    print("=" * 60)
    print("专家版主表 × 全国基础库 数据合并")
    print("=" * 60)
```

- [ ] **Step 2: 运行脚本验证骨架可执行**

```bash
cd "C:/Users/Administrator/Documents/志愿填报/高考志愿/data"
python 03_专家版主表/scripts/merge_base_library.py
```

Expected: 打印标题行，无报错。

- [ ] **Step 3: 补全名称映射表**

用 Python 找出专家版中与各基础库无法匹配的院校名称：

```python
# 临时代码，加在 if __name__ 块中
expert = load_expert()
sources = load_base_sources()

expert_names = set(expert["院校名称"])
for key, src in sources.items():
    name_col = {"院校库": "中文名称", "名录": "学校名称", "章程": "学校名称",
                "满意度": "院校名称", "学科评估": "院校名称"}[key]
    src_names = set(src[name_col].dropna())
    unmatched = expert_names - src_names
    if unmatched:
        print(f"\n{key} 未匹配 ({len(unmatched)}):")
        for n in sorted(unmatched)[:40]:
            print(f"  {n}")
```

运行后，根据输出将所有更名院校的映射关系补全到 `NAME_MAP` 字典。逐对确认旧名新名关系。

- [ ] **Step 4: 验证映射后匹配率**

补全 NAME_MAP 后再运行一次，确认未匹配数降至最低（预期各源 <5 所未匹配，主要是极新院校基础库尚无数据）。

- [ ] **Step 5: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: scaffold merge script with name mapping"
```

---

### Task 2: 双一流修补

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加双一流修补函数**

```python
def fix_shuangyiliu(expert_df, minglu_df):
    """用名录的双一流标记修补专家版空值"""
    minglu = normalize_name(minglu_df.copy(), "学校名称", NAME_MAP)
    syl_map = minglu.set_index("学校名称")["双一流"].to_dict()

    before_count = expert_df["是否双一流"].notna().sum()
    mask = expert_df["是否双一流"].isna() | (expert_df["是否双一流"] == "")
    expert_df.loc[mask, "是否双一流"] = expert_df.loc[mask, "院校名称"].map(
        lambda n: "是" if syl_map.get(n) == True else expert_df.loc[expert_df["院校名称"] == n, "是否双一流"].values[0]
    )
    # 更简洁的方式：
    for idx in expert_df[mask].index:
        name = expert_df.at[idx, "院校名称"]
        if syl_map.get(name) == True:
            expert_df.at[idx, "是否双一流"] = "是"

    after_count = expert_df["是否双一流"].notna().sum()
    fixed_count = after_count - before_count
    print(f"双一流修补: {before_count} → {after_count} (补全 {fixed_count} 所)")

    # 返回修补记录供校验报告使用
    records = []
    for idx in expert_df[mask].index:
        name = expert_df.at[idx, "院校名称"]
        if syl_map.get(name) == True:
            records.append({"院校名称": name, "修补前": None, "修补后": "是", "来源": "全国高校完整名录"})
    return expert_df, pd.DataFrame(records)
```

- [ ] **Step 2: 在 main 中调用并运行验证**

```python
# 在 if __name__ 块中
expert = load_expert()
sources = load_base_sources()
expert, syl_records = fix_shuangyiliu(expert, sources["名录"])
print(f"双一流修补记录: {len(syl_records)}条")
print(f"修补后双一流总数: {(expert['是否双一流'] == '是').sum()}")
```

Expected: 修补约60所，总数应接近162所（阳光高考标准）。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: add shuangyiliu fix from national registry"
```

---

### Task 3: 合入满意度数据

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加满意度合入函数**

```python
def merge_satisfaction(expert_df, myd_df):
    """合入院校满意度: 综合/生活/环境满意度"""
    cols = ["综合满意度", "生活满意度", "环境满意度"]
    return left_join(expert_df, myd_df, "院校名称", cols)
```

- [ ] **Step 2: 在 main 中调用并验证**

```python
print("\n--- 合入满意度 ---")
expert = merge_satisfaction(expert, sources["满意度"])
# 抽样验证
sample = expert[expert["院校名称"] == "四川大学"][["院校名称", "综合满意度", "生活满意度", "环境满意度"]]
print(sample)
```

Expected: 匹配率 ~99.6%，四川大学有满意度数值。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: merge satisfaction scores"
```

---

### Task 4: 合入招生章程结构化数据

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加章程合入函数**

```python
def merge_charter(expert_df, charter_df):
    """合入招生章程结构化: 调档比例、专业分配规则、同分规则、体检限制、服从调剂、转专业限制(官方)"""
    cols = ["调档比例", "专业分配规则", "同分规则", "体检限制", "服从调剂", "转专业限制"]
    merged = left_join(expert_df, charter_df, "学校名称", cols)
    # 转专业限制来自章程，与专家版"转专业情况"(学生口碑)互补，重命名避免混淆
    merged.rename(columns={"转专业限制": "转专业限制_章程"}, inplace=True)
    return merged
```

- [ ] **Step 2: 运行验证**

```python
print("\n--- 合入招生章程 ---")
expert = merge_charter(expert, sources["章程"])
print(f"调档比例非空: {expert['调档比例'].notna().sum()}")
print(f"专业分配规则非空: {expert['专业分配规则'].notna().sum()}")
```

Expected: 调档比例 ~38.8%, 专业分配规则 ~81.1%。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: merge structured charter fields"
```

---

### Task 5: 合入名录联系方式

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加名录合入函数**

```python
def merge_registry(expert_df, minglu_df):
    """合入全国高校名录: 阳光高考ID、官网、招生网址、招办电话"""
    cols = ["阳光高考ID", "学校官网", "招生网址", "招办电话"]
    return left_join(expert_df, minglu_df, "学校名称", cols)
```

- [ ] **Step 2: 运行验证**

```python
print("\n--- 合入名录 ---")
expert = merge_registry(expert, sources["名录"])
print(f"阳光高考ID非空: {expert['阳光高考ID'].notna().sum()}")
print(f"招办电话非空: {expert['招办电话'].notna().sum()}")
```

Expected: 匹配率 ~99.6%。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: merge registry contact info"
```

---

### Task 6: 合入院校库补充字段

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加院校库合入函数**

```python
def merge_school_db(expert_df, yxk_df):
    """合入院校库: 升学率、建校年份、男女比例、各排名体系、保研率对照"""
    cols = ["升学率", "建校年份", "男生比例", "女生比例", "QS排名", "USNews排名", "校友会排名", "保研率"]
    merged = left_join(expert_df, yxk_df, "中文名称", cols, suffixes=("", "_基础库"))
    # 保研率来自基础库，与专家版"保研率"并列对照
    # left_join 自动处理了 suffixes，专家版保研率保持原名，基础库的变为"保研率_基础库"
    return merged
```

- [ ] **Step 2: 运行验证**

```python
print("\n--- 合入院校库 ---")
expert = merge_school_db(expert, sources["院校库"])
sample = expert[expert["院校名称"] == "清华大学"][
    ["院校名称", "保研率", "保研率_基础库", "升学率", "QS排名", "建校年份"]
]
print(sample)
```

Expected: 清华大学 保研率_基础库=76, 升学率=79, QS=2, 建校年份=1911。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: merge school db supplementary fields"
```

---

### Task 7: 学科评估独立表 + 聚合摘要

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加学科评估处理函数**

```python
def build_discipline_eval(expert_df, eval_df):
    """
    1. 筛选专家版院校相关的学科评估记录，输出独立表
    2. 按院校聚合评估等级摘要，合入院校信息表
    """
    eval_df = normalize_name(eval_df.copy(), "院校名称", NAME_MAP)
    expert_names = set(expert_df["院校名称"])

    # 筛选独立表
    filtered = eval_df[eval_df["院校名称"].isin(expert_names)].copy()
    indep_table = filtered[["院校名称", "代码", "名称", "层级", "评估类型名称"]].rename(columns={
        "代码": "学科代码",
        "名称": "学科名称",
        "层级": "评估等级",
        "评估类型名称": "评估轮次",
    })
    print(f"学科评估独立表: {len(indep_table)}行, 覆盖 {indep_table['院校名称'].nunique()} 所院校")

    # 聚合摘要：按院校统计各等级数量
    grade_order = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-"]
    def summarize(group):
        counts = group["评估等级"].value_counts()
        parts = []
        for g in grade_order:
            if g in counts.index:
                parts.append(f"{g}:{counts[g]}")
        return ", ".join(parts) if parts else None

    summary = indep_table.groupby("院校名称").apply(summarize).reset_index()
    summary.columns = ["院校名称", "学科评估摘要"]

    expert_df = expert_df.merge(summary, on="院校名称", how="left")
    matched = expert_df["学科评估摘要"].notna().sum()
    print(f"学科评估摘要合入: {matched} 所院校有评估数据")

    return expert_df, indep_table
```

- [ ] **Step 2: 运行验证**

```python
print("\n--- 学科评估 ---")
expert, eval_table = build_discipline_eval(expert, sources["学科评估"])
# 抽样
print(expert[expert["院校名称"] == "四川大学"][["院校名称", "学科评估摘要"]].to_string())
print(eval_table[eval_table["院校名称"] == "四川大学"].head(10))
```

Expected: 四川大学有多个学科评估记录，摘要格式如 "A+:1, A:1, A-:3, B+:10, ..."。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: build discipline eval table and summary"
```

---

### Task 8: 更新字段溯源表

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加字段溯源更新函数**

```python
def update_traceability(expert_df):
    """读取现有字段溯源表，追加新增字段的溯源记录"""
    trace = pd.read_excel(EXPERT / "字段溯源表.xlsx")

    new_fields = [
        ("综合满意度", "院校信息表", "院校满意度_全国_阳光高考", "综合满意度", "", "left join 院校名称", ""),
        ("生活满意度", "院校信息表", "院校满意度_全国_阳光高考", "生活满意度", "", "left join 院校名称", ""),
        ("环境满意度", "院校信息表", "院校满意度_全国_阳光高考", "环境满意度", "", "left join 院校名称", ""),
        ("调档比例", "院校信息表", "招生章程结构化_全国_2025", "调档比例", "", "left join 学校名称", "2025年章程"),
        ("专业分配规则", "院校信息表", "招生章程结构化_全国_2025", "专业分配规则", "", "left join 学校名称", ""),
        ("同分规则", "院校信息表", "招生章程结构化_全国_2025", "同分规则", "", "left join 学校名称", ""),
        ("体检限制", "院校信息表", "招生章程结构化_全国_2025", "体检限制", "", "left join 学校名称", ""),
        ("服从调剂", "院校信息表", "招生章程结构化_全国_2025", "服从调剂", "", "left join 学校名称", ""),
        ("转专业限制_章程", "院校信息表", "招生章程结构化_全国_2025", "转专业限制", "", "left join 学校名称", "与转专业情况(学生口碑)互补"),
        ("阳光高考ID", "院校信息表", "全国高校完整名录_阳光高考", "阳光高考ID", "", "left join 学校名称", "桥接键"),
        ("学校官网", "院校信息表", "全国高校完整名录_阳光高考", "学校官网", "", "left join 学校名称", ""),
        ("招生网址", "院校信息表", "全国高校完整名录_阳光高考", "招生网址", "", "left join 学校名称", ""),
        ("招办电话", "院校信息表", "全国高校完整名录_阳光高考", "招办电话", "", "left join 学校名称", ""),
        ("升学率", "院校信息表", "院校库_全国", "升学率", "", "left join 中文名称", ""),
        ("建校年份", "院校信息表", "院校库_全国", "建校年份", "", "left join 中文名称", ""),
        ("男生比例", "院校信息表", "院校库_全国", "男生比例", "", "left join 中文名称", ""),
        ("女生比例", "院校信息表", "院校库_全国", "女生比例", "", "left join 中文名称", ""),
        ("QS排名", "院校信息表", "院校库_全国", "QS排名", "", "left join 中文名称", ""),
        ("USNews排名", "院校信息表", "院校库_全国", "USNews排名", "", "left join 中文名称", ""),
        ("校友会排名", "院校信息表", "院校库_全国", "校友会排名", "", "left join 中文名称", ""),
        ("保研率_基础库", "院校信息表", "院校库_全国", "保研率", "", "left join 中文名称, suffixed", "与专家版保研率并列对照"),
        ("学科评估摘要", "院校信息表", "学科评估_全国", "层级(聚合)", "", "groupby+聚合后 left join", "格式: A+:N, A:N, ..."),
        ("是否双一流", "院校信息表", "全国高校完整名录_阳光高考", "双一流", "专家版原值", "空值修补", "仅修补原值为空的行"),
    ]

    new_rows = pd.DataFrame(new_fields, columns=trace.columns)
    trace = pd.concat([trace, new_rows], ignore_index=True)
    print(f"字段溯源表: {len(trace)}行 (新增 {len(new_fields)} 条)")
    return trace
```

- [ ] **Step 2: 运行验证**

```python
print("\n--- 更新字段溯源表 ---")
trace = update_traceability(expert)
print(trace.tail(5))
```

Expected: 溯源表从101行增至约124行。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: update field traceability table"
```

---

### Task 9: 校验报告生成

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加校验报告生成函数**

```python
def generate_report(expert_df, sources, syl_records, name_map):
    """生成比对校验报告 Excel，含4个Sheet"""
    REPORT.mkdir(parents=True, exist_ok=True)
    report_path = REPORT / "基础库比对校验报告_2026-04-16.xlsx"

    with pd.ExcelWriter(report_path, engine="openpyxl") as writer:
        # Sheet1: 名称映射表
        map_df = pd.DataFrame([
            {"专家版名称": k, "基础库名称": v} for k, v in name_map.items()
        ])
        map_df.to_excel(writer, sheet_name="名称映射表", index=False)

        # Sheet2: 双一流修补记录
        syl_records.to_excel(writer, sheet_name="双一流修补记录", index=False)

        # Sheet3: 各字段匹配率统计
        new_cols = [
            "综合满意度", "生活满意度", "环境满意度",
            "调档比例", "专业分配规则", "同分规则", "体检限制", "服从调剂", "转专业限制_章程",
            "阳光高考ID", "学校官网", "招生网址", "招办电话",
            "升学率", "建校年份", "男生比例", "女生比例",
            "QS排名", "USNews排名", "校友会排名", "保研率_基础库",
            "学科评估摘要",
        ]
        total = len(expert_df)
        stats = []
        for col in new_cols:
            if col in expert_df.columns:
                non_null = expert_df[col].notna().sum()
                stats.append({
                    "字段": col,
                    "非空数": non_null,
                    "总行数": total,
                    "匹配率": f"{non_null / total * 100:.1f}%",
                })
        stats_df = pd.DataFrame(stats)
        stats_df.to_excel(writer, sheet_name="字段匹配率统计", index=False)

        # Sheet4: 重叠字段差异明细（保研率对比）
        diff_rows = expert_df[
            expert_df["保研率"].notna() & expert_df["保研率_基础库"].notna()
        ][["院校名称", "保研率", "保研率_基础库"]].copy()
        diff_rows["差异"] = diff_rows.apply(
            lambda r: str(r["保研率"]).replace("%", "") != str(r["保研率_基础库"]), axis=1
        )
        diff_rows = diff_rows[diff_rows["差异"]]
        diff_rows.to_excel(writer, sheet_name="重叠字段差异明细", index=False)

    print(f"\n校验报告已生成: {report_path}")
    print(f"  名称映射: {len(map_df)}条")
    print(f"  双一流修补: {len(syl_records)}条")
    print(f"  字段统计: {len(stats_df)}项")
    print(f"  保研率差异: {len(diff_rows)}条")
```

- [ ] **Step 2: 运行验证**

```python
print("\n--- 生成校验报告 ---")
generate_report(expert, sources, syl_records, NAME_MAP)
```

Expected: 在 `08_数据治理记录/` 下生成 xlsx 文件，含4个Sheet。

- [ ] **Step 3: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: generate validation report"
```

---

### Task 10: 输出写入 + 完整流程串联

**Files:**
- Modify: `03_专家版主表/scripts/merge_base_library.py`

- [ ] **Step 1: 添加输出写入函数和完整 main 流程**

```python
def save_outputs(expert_df, eval_table, trace_df):
    """覆盖写入 output 目录"""
    expert_df.to_excel(EXPERT / "院校信息表.xlsx", index=False, engine="openpyxl")
    print(f"院校信息表已写入: {expert_df.shape[0]}行, {expert_df.shape[1]}列")

    eval_table.to_excel(EXPERT / "学科评估表.xlsx", index=False, engine="openpyxl")
    print(f"学科评估表已写入: {eval_table.shape[0]}行")

    trace_df.to_excel(EXPERT / "字段溯源表.xlsx", index=False, engine="openpyxl")
    print(f"字段溯源表已写入: {trace_df.shape[0]}行")


if __name__ == "__main__":
    print("=" * 60)
    print("专家版主表 × 全国基础库 数据合并")
    print("=" * 60)

    # 1. 加载数据
    expert = load_expert()
    sources = load_base_sources()

    # 2. 双一流修补
    print("\n--- 双一流修补 ---")
    expert, syl_records = fix_shuangyiliu(expert, sources["名录"])

    # 3. 合入满意度
    print("\n--- 合入满意度 ---")
    expert = merge_satisfaction(expert, sources["满意度"])

    # 4. 合入招生章程
    print("\n--- 合入招生章程 ---")
    expert = merge_charter(expert, sources["章程"])

    # 5. 合入名录
    print("\n--- 合入名录 ---")
    expert = merge_registry(expert, sources["名录"])

    # 6. 合入院校库
    print("\n--- 合入院校库 ---")
    expert = merge_school_db(expert, sources["院校库"])

    # 7. 学科评估
    print("\n--- 学科评估 ---")
    expert, eval_table = build_discipline_eval(expert, sources["学科评估"])

    # 8. 更新溯源表
    print("\n--- 更新字段溯源表 ---")
    trace = update_traceability(expert)

    # 9. 校验报告
    print("\n--- 生成校验报告 ---")
    generate_report(expert, sources, syl_records, NAME_MAP)

    # 10. 写入输出
    print("\n--- 写入输出 ---")
    save_outputs(expert, eval_table, trace)

    # 最终验证
    print("\n" + "=" * 60)
    print("完成! 最终院校信息表:")
    print(f"  行数: {expert.shape[0]} (应为2238)")
    print(f"  列数: {expert.shape[1]}")
    print(f"  新增列: {expert.shape[1] - 26}")
    print("=" * 60)
```

- [ ] **Step 2: 完整运行脚本并验证**

```bash
python 03_专家版主表/scripts/merge_base_library.py
```

验证项：
- 院校信息表行数仍为2238（left join不应改变行数）
- 列数约50
- 学科评估表已生成
- 字段溯源表已更新
- 校验报告已生成

- [ ] **Step 3: 打开输出文件抽样检查**

```python
# 快速验证脚本
import pandas as pd
df = pd.read_excel(r"C:\Users\Administrator\Documents\志愿填报\高考志愿\data\03_专家版主表\output\院校信息表.xlsx")
print(f"Shape: {df.shape}")
print(f"Columns: {df.columns.tolist()}")
# 抽查985院校
for name in ["清华大学", "北京大学", "四川大学", "电子科技大学"]:
    row = df[df["院校名称"] == name]
    print(f"\n{name}:")
    print(f"  双一流={row['是否双一流'].values[0]}, 满意度={row['综合满意度'].values[0]}")
    print(f"  QS={row['QS排名'].values[0]}, 建校={row['建校年份'].values[0]}")
    print(f"  学科评估={row['学科评估摘要'].values[0]}")
```

- [ ] **Step 4: Commit**

```bash
git add 03_专家版主表/scripts/merge_base_library.py
git commit -m "feat: complete merge pipeline with output and validation"
```

---

### Task 11: 更新数据采集规划方案

**Files:**
- Modify: `09_业务文档/数据采集规划方案.md`

- [ ] **Step 1: 在数据采集规划方案的"六、专家版主表数据整合"章节末尾追加合并记录**

在文件末尾添加：

```markdown
### 6.8 基础库数据比对合并 ✅ (2026-04-16)

- **目标**：用全国基础库权威数据补充院校信息表字段、校验准确性
- **方法**：Python pandas left join，以院校名称为关联键
- **名称映射**：29所更名院校通过硬编码映射表处理
- **合入数据源及字段**：
  - 院校满意度 → 综合/生活/环境满意度（3列）
  - 招生章程结构化 → 调档比例、专业分配规则、同分规则、体检限制、服从调剂、转专业限制_章程（6列）
  - 全国高校名录 → 阳光高考ID、学校官网、招生网址、招办电话（4列）
  - 院校库 → 升学率、建校年份、男女比例、QS/USNews/校友会排名、保研率_基础库（8列）
  - 学科评估 → 学科评估摘要（1列，聚合）
- **修补**：双一流标记补全约60所漏标院校
- **产出**：
  - 院校信息表: 2,238行 → ~50列（新增~24列）
  - 学科评估表: 新增独立表（一对多关系）
  - 字段溯源表: 新增23条溯源记录
  - 校验报告: `08_数据治理记录/基础库比对校验报告_2026-04-16.xlsx`
- **脚本**：`03_专家版主表/scripts/merge_base_library.py`
```

- [ ] **Step 2: Commit**

```bash
git add 09_业务文档/数据采集规划方案.md
git commit -m "docs: record base library merge in data collection plan"
```
