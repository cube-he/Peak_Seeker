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
