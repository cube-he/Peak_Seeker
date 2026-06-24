"""
86-col master xlsx → JSON converter for the 2026 go-live.

Reads 四川-2026-专家版数据_批次标准化.xlsx (Sheet1, 86 cols) BY COLUMN NAME
(not positional index) and produces JSON compatible with import_to_db.ts:
  - majors_enriched.json
  - enrollment_plans_enriched.json   (year=2026 + historical 2025/2024/2023)
  - admission_records_filled.json    (2025/2024/2023)

Universities still come from 院校信息表.xlsx via xlsx_to_json.convert_universities.

Fails fast if a required column is missing (vs the old positional converter that
silently mis-read columns). See design:
  docs/superpowers/specs/2026-06-24-86col-converter-design.md
"""

# Columns that MUST exist; absence means the input is not the expected 86-col master.
REQUIRED_COLS = [
    "科类", "批次", "招生类型", "院校代码", "专业组代码", "专业代码", "专业名称",
    "本科/专科", "计划人数", "专业组计划人数",
    "录取人数1", "最低分1", "最低位次1", "计划人数结果1",
]


def build_header_index(header) -> dict:
    """Map column name → index from the header row; fail fast if a required column is missing."""
    H = {name: i for i, name in enumerate(header) if name is not None}
    missing = [c for c in REQUIRED_COLS if c not in H]
    if missing:
        raise ValueError(f"主表缺少必需列: {missing}")
    return H


def row_to_dict(row, H) -> dict:
    """Project a row tuple to a {column-name: value} dict using the header index."""
    return {name: row[i] for name, i in H.items()}


# --- value helpers ---------------------------------------------------------

def _str(val):
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _int(val):
    if val is None:
        return None
    try:
        return int(float(str(val)))
    except (ValueError, TypeError):
        return None


def _bool_from_str(val) -> bool:
    return _str(val) == "是"


def _any_not_none(*vals) -> bool:
    return any(v is not None for v in vals)


def _norm_level(val) -> str:
    """本/专科层级：职业本科 → 本科（下游本/专二分一致）。"""
    s = _str(val) or "本科"
    return "本科" if s == "职业本科" else s


# --- majors ----------------------------------------------------------------

def convert_majors(rows) -> list:
    """Deduplicate majors by (专业名称, level). See spec『majors_enriched』mapping."""
    seen, out = set(), []
    for r in rows:
        name = _str(r.get("专业名称"))
        if not name:
            continue
        level = _norm_level(r.get("本科/专科"))
        key = (name, level)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "name": name,
            "code": _str(r.get("专业代码")),
            "category": _str(r.get("门类")),
            "level": level,
            "discipline": _str(r.get("专业类")),
            "type": None,
            "notes": _str(r.get("专业备注")),
            "majorLevel": _str(r.get("专业水平")),
            "softRating": _str(r.get("软科评级")),
        })
    return out


# --- group name (directed / special groups only) ---------------------------

# 定向/专项类招生：组的可读标识(定向县/专项类型)在 专业备注 里；普通类组无 prose 名(= 生产 group_name 96% 空)
_DIRECTED_KEYWORDS = ("专项", "定向", "优师", "公费", "民族")


def extract_group_name(r) -> str | None:
    """定向/专项组：返回 专业备注 里的定向县/专项标识；普通类返回 None。best-effort，上线前对生产 group_name 样式校准。"""
    recruit = _str(r.get("招生类型")) or ""
    if not any(k in recruit for k in _DIRECTED_KEYWORDS):
        return None
    return _str(r.get("专业备注"))


# --- enrollment plans (2026 + historical 2025/2024/2023) -------------------

def convert_plans_row(r) -> list:
    """One master row → enrollment plan dicts: 2026 (always) + 2025/2024/2023 (if 计划人数结果N present).

    See spec『enrollment_plans』mapping. Historical years carry per-major planCount
    (计划人数结果1/2/3), fixing the old 2024/2023 group-grain defect.
    """
    shared = {
        "universityEnrollCode": _str(r.get("院校代码")),
        "majorName": _str(r.get("专业名称")),
        "majorCode": _str(r.get("专业代码")),
        "groupCode": _str(r.get("专业组代码")),
        "groupName": extract_group_name(r),
        "groupMajors": None,
        "subjects": _str(r.get("科类")),
        "batch": _str(r.get("批次")),
        "recruitType": _str(r.get("招生类型")),
        "province": "四川",
        "level": _norm_level(r.get("本科/专科")),
        "subjectRequirements": _str(r.get("选科要求")),
        "isNew": _bool_from_str(r.get("是否新增")),
        "oldBatch": _str(r.get("老批次1")),
        "disciplineEval": _str(r.get("学科评估")),
        "isNationalFeature": False,          # 新主表无 国家特色专业 列
        "majorRanking": None,                # 新主表无 专业排名 列
        "majorHonor": None,                  # 新主表无 专业荣誉 列
        "localMasterPoint": _str(r.get("本专业硕士点")),
        "localDoctoralPoint": _str(r.get("本专业博士点")),
        "softRating": _str(r.get("软科评级")),
        "planNotes": _str(r.get("专业备注")),
    }

    plans = [{
        **shared,
        "year": 2026,
        "planCount": _int(r.get("计划人数")),
        "groupPlanCount": _int(r.get("专业组计划人数")),
        "tuition": _int(r.get("学费")),
        "duration": _str(r.get("学制")),
    }]

    # 历史计划：per-major planCount 来自 计划人数结果1/2/3；缺即跳过该年。groupPlanCount/tuition/duration 不可得。
    for year, col in ((2025, "计划人数结果1"), (2024, "计划人数结果2"), (2023, "计划人数结果3")):
        pc = _int(r.get(col))
        if pc is None:
            continue
        plans.append({
            **shared, "year": year, "planCount": pc,
            "groupPlanCount": None, "tuition": None, "duration": None,
        })

    return plans
