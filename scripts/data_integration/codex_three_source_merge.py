# -*- coding: utf-8 -*-
"""Codex independent three-source data merge.

Inputs are limited to:
  data/01_核心录取数据
  data/02_全国基础库
  data/03_专家版主表

The script deliberately does not read data/03_专家版主表/output or data/_pipeline.
It produces a comparable Codex output set under data/codex_three_source_merge.
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = DATA / "codex_three_source_merge"


def data_dir(prefix: str) -> Path:
    return next(p for p in DATA.iterdir() if p.is_dir() and p.name.startswith(prefix))


DIR01 = data_dir("01_")
DIR02 = data_dir("02_")
DIR03 = data_dir("03_")


def clean_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value).strip()
    if text == "" or text.lower() in {"nan", "none", "null", "<na>"}:
        return None
    return text


def clean_text(value: Any) -> str | None:
    value = clean_value(value)
    return None if value is None else str(value).strip()


def to_int(value: Any) -> int | None:
    value = clean_value(value)
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if text.endswith(".0"):
        text = text[:-2]
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    return None


def to_float(value: Any) -> float | None:
    value = clean_value(value)
    if value is None:
        return None
    text = str(value).strip().replace(",", "").replace("%", "")
    try:
        return float(text)
    except ValueError:
        return None


def zfill_code(value: Any, width: int = 4) -> str | None:
    text = clean_text(value)
    if text is None:
        return None
    text = text[:-2] if text.endswith(".0") else text
    if re.fullmatch(r"\d+", text):
        return text.zfill(width)
    return text


def norm_name(value: Any) -> str | None:
    text = clean_text(value)
    if text is None:
        return None
    text = re.sub(r"\s+", "", text)
    text = text.replace("（", "(").replace("）", ")")
    return text


def first_non_empty(series: pd.Series) -> Any:
    for value in series:
        value = clean_value(value)
        if value is not None:
            return value
    return None


def find_file(directory: Path, required: list[str], suffix: str = ".xlsx") -> Path:
    candidates = []
    for path in directory.glob(f"*{suffix}"):
        if all(token in path.name for token in required):
            candidates.append(path)
    if not candidates:
        raise FileNotFoundError(f"No file in {directory} contains {required}")
    return sorted(candidates, key=lambda p: (len(p.name), p.name))[0]


def read_excel_header_detect(path: Path, required_cols: list[str], **kwargs: Any) -> pd.DataFrame:
    """Read an Excel file whose real header may be on row 0, 1, 2, or 3."""
    for header in range(0, 5):
        try:
            df = pd.read_excel(path, header=header, dtype=str, **kwargs)
        except Exception:
            continue
        cols = {str(c).strip() for c in df.columns}
        if all(col in cols for col in required_cols):
            return df
    return pd.read_excel(path, dtype=str, **kwargs)


def select_expert_source() -> tuple[Path, pd.DataFrame]:
    """Select the best non-output expert workbook from 03_专家版主表."""
    required = {"院校", "院校代码", "专业组代码", "专业代码", "专业", "批次", "科目"}
    best: tuple[int, Path, pd.DataFrame] | None = None
    for path in DIR03.glob("*.xlsx"):
        if path.parent.name == "output":
            continue
        try:
            xl = pd.ExcelFile(path)
        except Exception:
            continue
        if "四川" not in xl.sheet_names:
            continue
        try:
            df = pd.read_excel(path, sheet_name="四川", dtype=str)
        except Exception:
            continue
        cols = {str(c).strip() for c in df.columns}
        if not required.issubset(cols) or len(df) < 40000:
            continue
        score = len(df.columns)
        if "合并整理" in path.name:
            score += 100
        if "清洗后_修改" in path.name:
            score += 80
        if "清洗后" in path.name:
            score += 60
        if best is None or score > best[0]:
            best = (score, path, df)
    if best is None:
        raise RuntimeError("No usable expert source found in 03_专家版主表 outside output/")
    return best[1], best[2]


def col(row: pd.Series, *names: str) -> Any:
    for name in names:
        if name in row.index:
            value = clean_value(row[name])
            if value is not None:
                return value
    return None


def build_batch_tree() -> dict[str, Any]:
    def leaf(node_id: str, name: str, enrollment_type: str, order: int,
             subjects: list[str] | None = None, status: str = "has_data") -> dict[str, Any]:
        return {
            "id": node_id,
            "name": name,
            "order": order,
            "subjects": subjects or ["物理", "历史"],
            "enrollmentType": enrollment_type,
            "dataStatus": status,
        }

    return {
        "year": 2025,
        "province": "四川",
        "examReform": "新高考",
        "volunteerUnit": "院校专业组",
        "source": "2025年招生考试报·高考指南目录结构",
        "tree": [
            {
                "id": "bktqp",
                "name": "本科提前批次",
                "order": 1,
                "children": [
                    {**leaf("bktqp_gjzx", "国家专项计划", "国家专项计划", 1), "volunteer": {"mode": "parallel", "count": 2}},
                    {"id": "bktqp_a", "name": "A段", "order": 2, "volunteer": {"mode": "sequential_1_2", "count": 3}, "children": [
                        leaf("bktqp_a_js", "军事类", "军事类", 1),
                        leaf("bktqp_a_fxjs", "飞行技术", "飞行技术", 2, ["物理"], "no_data"),
                        leaf("bktqp_a_gasf", "公安类、司法类", "公安类、司法类", 3),
                        leaf("bktqp_a_hh", "航海类", "航海类", 4),
                        leaf("bktqp_a_xfjy", "消防救援", "消防救援", 5),
                        leaf("bktqp_a_zhpj", "高校综合评价", "高校综合评价", 6),
                        leaf("bktqp_a_qt", "其他", "其他", 7, ["物理"], "no_data"),
                    ]},
                    {**leaf("bktqp_gxzx", "高校专项计划", "高校专项计划", 3), "volunteer": {"mode": "sequential", "count": 1}},
                    {"id": "bktqp_b", "name": "B段", "order": 4, "volunteer": {"mode": "parallel", "count": 30}, "children": [
                        leaf("bktqp_b_gjgfsf", "国家公费师范生", "国家公费师范生", 1),
                        leaf("bktqp_b_gjyszx", "国家优师专项", "国家优师专项", 2),
                        leaf("bktqp_b_ncddyx", "农村订单定向医学生", "农村订单定向医学生", 3),
                        leaf("bktqp_b_sjgfsf", "省级公费师范生", "省级公费师范生", 4),
                        leaf("bktqp_b_dfyszx", "地方优师计划", "地方优师计划", 5),
                        leaf("bktqp_b_xczx", "乡村振兴计划", "乡村振兴计划", 6),
                        leaf("bktqp_b_qt", "其他", "其他", 7),
                    ]},
                ],
            },
            {
                "id": "bkp",
                "name": "本科批次",
                "order": 2,
                "children": [
                    {"id": "bkp_a", "name": "A段", "order": 1, "volunteer": {"mode": "parallel", "count": 20}, "children": [
                        leaf("bkp_a_gjzx", "国家专项计划", "国家专项计划", 1),
                        leaf("bkp_a_dfzx", "地方专项计划", "地方专项计划", 2),
                    ]},
                    {**leaf("bkp_gxzx", "高校专项计划", "高校专项计划", 2), "volunteer": {"mode": "sequential_1_1", "count": 2}},
                    {**leaf("bkp_gspyd", "高水平运动队", "高水平运动队", 3, status="no_data"), "volunteer": {"mode": "sequential", "count": 1}},
                    {"id": "bkp_b", "name": "B段", "order": 4, "volunteer": {"mode": "parallel", "count": 45}, "children": [
                        leaf("bkp_b_pt", "普通类本科", "普通类本科", 1),
                        leaf("bkp_b_bkzyjy", "本科层次职业教育人才培养改革试点", "本科层次职业教育人才培养改革试点", 2),
                        leaf("bkp_b_mzb", "民族班", "民族班", 3),
                        leaf("bkp_b_fxzyx", "非西藏生源定向西藏就业", "非西藏生源定向西藏就业", 4),
                        leaf("bkp_b_qtdx", "其他定向招生", "其他定向招生", 5, ["物理"], "no_data"),
                        leaf("bkp_b_yk", "少数民族预科", "部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科", 6),
                    ]},
                    {"id": "bkp_smzyy", "name": "原少数民族语言授课为主", "order": 5, "volunteer": {"mode": "parallel", "count": 20}, "children": [
                        leaf("bkp_smzyy_bk", "本科", "少数民族语言授课为主·本科", 1, status="no_data"),
                        leaf("bkp_smzyy_yk", "预科", "少数民族语言授课为主·预科", 2, status="no_data"),
                    ]},
                    {**leaf("bkp_jsmzyw", "原加授少数民族语文", "加授少数民族语文", 6, status="no_data"), "volunteer": {"mode": "parallel", "count": 6}},
                    {**leaf("bkp_qyjh", "区域教育均衡发展专项计划", "区域教育均衡发展专项计划", 7), "volunteer": {"mode": "parallel", "count": 20}},
                    {**leaf("bkp_sxyk", "省属高校少数民族预科", "省属高校少数民族预科", 8), "volunteer": {"mode": "parallel", "count": 20}},
                ],
            },
            {"id": "zktqp", "name": "高职(专科)提前批次", "order": 3, "volunteer": {"mode": "sequential_1_2", "count": 3}, "children": [
                leaf("zktqp_dxpyjs", "定向培养军士", "定向培养军士", 1),
                leaf("zktqp_gasf", "公安类、司法类", "公安类、司法类", 2),
                leaf("zktqp_hh", "航海类", "航海类", 3),
            ]},
            {"id": "zkp", "name": "高职(专科)批次", "order": 4, "children": [
                {**leaf("zkp_pt", "普通类高职(专科)", "普通类高职(专科)", 1), "volunteer": {"mode": "parallel", "count": 45}},
                {**leaf("zkp_smzyy", "原少数民族语言授课为主", "少数民族语言授课为主", 2, status="no_data"), "volunteer": {"mode": "parallel", "count": 6}},
                {**leaf("zkp_jsmzyw", "原加授少数民族语文", "加授少数民族语文", 3, status="no_data"), "volunteer": {"mode": "parallel", "count": 6}},
            ]},
        ],
    }


def normalize_batch(batch: Any) -> str | None:
    text = clean_text(batch)
    if text is None:
        return None
    text = text.replace("（", "(").replace("）", ")").replace("批次", "批")
    text = text.replace("本科B", "本科批B段").replace("本科A", "本科批A段")
    text = text.replace("本科批B批", "本科批B段").replace("本科批A批", "本科批A段")
    text = text.replace("本科提前A", "本科提前批A段").replace("本科提前B", "本科提前批B段")
    text = text.replace("本科批A段(国家专项)", "本科批A段")
    text = text.replace("本科批A段(地方专项)", "本科批A段")
    text = text.replace("专科提前批", "高职(专科)提前批")
    if text in {"专科批", "高职专科批", "高职(专科)批次"}:
        return "高职(专科)批"
    return text


def normalize_enrollment_type(batch: str | None, value: Any) -> str | None:
    raw_batch = clean_text(batch)
    if raw_batch:
        if "高校专项" in raw_batch:
            return "高校专项计划"
        if "国家专项" in raw_batch:
            return "国家专项计划"
        if "地方专项" in raw_batch:
            return "地方专项计划"
        if "区域教育均衡发展专项" in raw_batch:
            return "区域教育均衡发展专项计划"
        if "省属高校少数民族预科" in raw_batch:
            return "省属高校少数民族预科"

    text = clean_text(value)
    discipline_like = {
        "综合", "理工", "工科", "工业", "师范", "财经", "医药", "农林", "语言", "政法",
        "艺术", "体育", "民族", "航空", "其他", "军事",
    }
    if text in discipline_like or (text and any(part in discipline_like for part in text.split())):
        text = None
    if text:
        text = text.replace("（", "(").replace("）", ")")
        text = text.replace("普通", "普通类本科" if batch and "本科" in batch else "普通类高职(专科)")
        text = text.replace("综合", "普通类本科" if batch and "本科" in batch else "普通类高职(专科)")
        if text == "国家专项":
            text = "国家专项计划"
        if text == "地方专项":
            text = "地方专项计划"
        if text == "高校专项":
            text = "高校专项计划"
        return text
    if batch in {"本科批B段", "本科批"}:
        return "普通类本科"
    if batch == "高职(专科)批":
        return "普通类高职(专科)"
    if batch == "高职(专科)提前批":
        return None
    if batch and "高校专项" in batch:
        return "高校专项计划"
    if batch and "国家专项" in batch:
        return "国家专项计划"
    return None


BATCH_NODE_MAP = {
    ("本科提前批(国家专项)", "国家专项计划"): "bktqp_gjzx",
    ("本科提前批A段", "军事类"): "bktqp_a_js",
    ("本科提前批A段", "公安类、司法类"): "bktqp_a_gasf",
    ("本科提前批A段", "航海类"): "bktqp_a_hh",
    ("本科提前批A段", "消防救援"): "bktqp_a_xfjy",
    ("本科提前批A段", "高校综合评价"): "bktqp_a_zhpj",
    ("本科提前批(高校专项)", "高校专项计划"): "bktqp_gxzx",
    ("本科提前批B段", "国家公费师范生"): "bktqp_b_gjgfsf",
    ("本科提前批B段", "国家优师专项"): "bktqp_b_gjyszx",
    ("本科提前批B段", "农村订单定向医学生"): "bktqp_b_ncddyx",
    ("本科提前批B段", "省级公费师范生"): "bktqp_b_sjgfsf",
    ("本科提前批B段", "地方优师计划"): "bktqp_b_dfyszx",
    ("本科提前批B段", "乡村振兴计划"): "bktqp_b_xczx",
    ("本科提前批B段", "其他"): "bktqp_b_qt",
    ("本科批A段", "国家专项计划"): "bkp_a_gjzx",
    ("本科批A段", "地方专项计划"): "bkp_a_dfzx",
    ("本科批(高校专项)", "高校专项计划"): "bkp_gxzx",
    ("本科批B段", "普通类本科"): "bkp_b_pt",
    ("本科批B段", "本科层次职业教育人才培养改革试点"): "bkp_b_bkzyjy",
    ("本科批B段", "民族班"): "bkp_b_mzb",
    ("本科批B段", "非西藏生源定向西藏就业"): "bkp_b_fxzyx",
    ("本科批B段", "部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科"): "bkp_b_yk",
    ("本科批(区域教育均衡发展专项)", "区域教育均衡发展专项计划"): "bkp_qyjh",
    ("本科批(省属高校少数民族预科)", "省属高校少数民族预科"): "bkp_sxyk",
    ("高职(专科)提前批", "定向培养军士"): "zktqp_dxpyjs",
    ("高职(专科)提前批", "公安类、司法类"): "zktqp_gasf",
    ("高职(专科)提前批", "航海类"): "zktqp_hh",
    ("高职(专科)批", "普通类高职(专科)"): "zkp_pt",
}


def resolve_batch_node(batch: str | None, enrollment_type: str | None) -> str | None:
    if batch is None:
        return None
    if batch == "本科批" and enrollment_type == "普通类本科":
        batch = "本科批B段"
    return BATCH_NODE_MAP.get((batch, enrollment_type or ""))


def load_base_sources() -> dict[str, pd.DataFrame]:
    sources: dict[str, pd.DataFrame] = {}
    sources["school_db"] = pd.read_excel(find_file(DIR02, ["院校库", "全国"]), dtype=str)
    sources["satisfaction"] = pd.read_excel(find_file(DIR02, ["院校满意度"]), dtype=str)
    sources["charter"] = pd.read_excel(find_file(DIR02, ["招生章程"]), dtype=str)
    sources["discipline_eval"] = pd.read_excel(find_file(DIR02, ["学科评估"]), dtype=str)
    sources["major_catalog"] = pd.read_excel(find_file(DIR02, ["专业库", "全国"]), dtype=str)
    sources["major_detail"] = pd.read_excel(find_file(DIR02, ["专业库详情"]), dtype=str)
    registry_path = find_file(DIR02, ["全国高校完整名录"])
    sources["registry"] = read_excel_header_detect(registry_path, ["学校名称"])
    return sources


def build_school_registry(expert: pd.DataFrame, sources: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, dict[str, Any]]:
    expert = expert.copy()
    expert["_school_code"] = expert["院校代码"].map(zfill_code)
    expert["_school_name"] = expert["院校"].map(clean_text)
    groups = []
    for code, g in expert.dropna(subset=["_school_code"]).groupby("_school_code", sort=True):
        row: dict[str, Any] = {"院校代码": code, "院校名称": first_non_empty(g["_school_name"])}
        for source_col, final_col in [
            ("院校省份", "院校省份"), ("所在省", "院校省份"), ("省份", "院校省份"),
            ("院校城市", "院校城市"), ("城市", "院校城市"),
            ("城市等级", "城市等级"), ("城市水平", "城市等级"),
            ("院校类型", "院校类型"), ("类型", "院校类型"),
            ("办学性质", "办学性质"), ("公私性质", "办学性质"),
            ("隶属部门", "隶属部门"), ("隶属单位", "隶属部门"),
            ("院校标签", "院校标签"), ("院校档次", "院校档次"),
            ("院校背景", "院校背景"), ("院校层级", "院校层级"),
            ("是否双一流", "是否双一流"), ("变迁史", "变迁史"),
            ("更名合并情况", "更名合并情况"), ("院校排名", "院校排名"),
            ("硕士点数量", "硕士点数量"), ("硕士点数", "硕士点数量"),
            ("博士点数量", "博士点数量"), ("博士点数", "博士点数量"),
            ("硕士点专业", "硕士点专业"), ("博士点专业", "博士点专业"),
            ("本校硕士", "本校硕士"), ("本校博士", "本校博士"),
            ("保研率", "保研率"), ("转专业情况", "转专业情况"), ("转专业", "转专业情况"),
            ("招生简章", "招生简章"),
        ]:
            if source_col in g.columns and final_col not in row:
                row[final_col] = first_non_empty(g[source_col])
        groups.append(row)
    registry = pd.DataFrame(groups)
    registry["_norm_name"] = registry["院校名称"].map(norm_name)

    match_stats: dict[str, Any] = {}

    def merge_one(source_key: str, source_name_col: str, fields: list[str], suffix: str) -> None:
        nonlocal registry
        src = sources[source_key].copy()
        if source_name_col not in src.columns:
            match_stats[source_key] = {"error": f"missing {source_name_col}"}
            return
        src["_norm_name"] = src[source_name_col].map(norm_name)
        src = src.dropna(subset=["_norm_name"]).drop_duplicates("_norm_name")
        keep = ["_norm_name"] + [c for c in fields if c in src.columns]
        before_cols = set(registry.columns)
        registry = registry.merge(src[keep], on="_norm_name", how="left", suffixes=("", suffix))
        matched = registry[keep[1]].notna().sum() if len(keep) > 1 else 0
        match_stats[source_key] = {
            "matched_schools": int(matched),
            "total_schools": int(len(registry)),
            "match_rate": round(matched / len(registry), 4) if len(registry) else 0,
            "added_columns": [c for c in registry.columns if c not in before_cols],
        }

    merge_one("school_db", "中文名称", [
        "代码", "国标代码", "Logo地址", "Banner地址", "办学性质", "学历层次", "隶属部门", "院校类型",
        "院校特色", "省份代码", "省份名称", "城市", "热度", "综合排名", "武书连排名", "软科排名",
        "校友会排名", "QS排名", "USNews排名", "教育部排名", "综合评分", "男生比例", "女生比例",
        "建校年份", "硕士点数量", "博士点数量", "保研率", "升学率", "双一流学科数",
        "国家级数量", "省级数量", "A类学科数", "双一流专业", "特色专业",
    ], "_02院校库")
    merge_one("satisfaction", "院校名称", [
        "阳光高考ID", "综合满意度", "综合评价人数", "综合1星", "综合2星", "综合3星", "综合4星", "综合5星",
        "生活满意度", "生活1星", "生活2星", "生活3星", "生活4星", "生活5星",
        "环境满意度", "环境1星", "环境2星", "环境3星", "环境4星", "环境5星", "来源网址",
    ], "_02满意度")
    merge_one("charter", "学校名称", [
        "阳光高考ID", "有章程", "调档比例", "专业分配规则", "同分规则", "外语要求", "单科要求",
        "体检限制", "加分政策", "学费", "转专业限制", "服从调剂", "来源网址", "采集时间",
    ], "_02章程")
    merge_one("registry", "学校名称", [
        "阳光高考ID", "学校官网", "招生网址", "招办电话", "双一流",
    ], "_02名录")

    eval_df = sources["discipline_eval"].copy()
    if "院校名称" in eval_df.columns:
        eval_df["_norm_name"] = eval_df["院校名称"].map(norm_name)
        grades = eval_df.dropna(subset=["_norm_name", "层级"]).groupby("_norm_name")["层级"].apply(
            lambda s: ", ".join(f"{k}:{v}" for k, v in Counter(s).items())
        ).reset_index(name="学科评估摘要_02")
        registry = registry.merge(grades, on="_norm_name", how="left")

    registry = registry.drop(columns=["_norm_name"])
    return registry, match_stats


def load_official_scores() -> pd.DataFrame:
    rows = []
    for path in DIR01.glob("专业分数线_*.xlsx"):
        df = pd.read_excel(path, dtype=str)
        for _, row in df.iterrows():
            rows.append({
                "source_file": path.name,
                "year": to_int(col(row, "年份")),
                "school_enroll_code": zfill_code(col(row, "招生代码")),
                "national_school_code": clean_text(col(row, "院校代码")),
                "school_name": clean_text(col(row, "院校名称")),
                "batch_raw": clean_text(col(row, "批次")),
                "batch_norm": normalize_batch(col(row, "批次")),
                "subject": clean_text(col(row, "科类")),
                "major_enroll_code": zfill_code(col(row, "专业招生代码"), 2),
                "major_code_national": clean_text(col(row, "专业代码")),
                "major_name": clean_text(col(row, "专业名称")),
                "plan": to_int(col(row, "计划人数")),
                "admitted": to_int(col(row, "录取人数")),
                "filing_line": to_int(col(row, "投档线")),
                "max_score": to_int(col(row, "最高分")),
                "min_score": to_int(col(row, "最低分")),
                "avg_score": to_float(col(row, "平均分")),
                "max_rank": to_int(col(row, "最高位次")),
                "min_rank": to_int(col(row, "最低位次")),
                "avg_rank": to_int(col(row, "平均位次")),
                "raw_id": clean_text(col(row, "ID")),
            })
    return pd.DataFrame(rows)


def merge_official_2025(expert: pd.DataFrame, official: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    df = expert.copy()
    df["_school_code"] = df["院校代码"].map(zfill_code)
    df["_major_code"] = df["专业代码"].map(lambda x: zfill_code(x, 2))
    df["_subject"] = df["科目"].map(clean_text)
    df["_batch_norm"] = df["批次"].map(normalize_batch)

    off25 = official[official["year"] == 2025].copy()
    off25 = off25.dropna(subset=["school_enroll_code", "major_enroll_code", "subject"])
    key_cols = ["school_enroll_code", "major_enroll_code", "subject"]
    off25 = off25.sort_values(["min_score"], na_position="last").drop_duplicates(key_cols, keep="first")
    merged = df.merge(
        off25[key_cols + ["batch_norm", "plan", "admitted", "min_score", "min_rank", "avg_score", "max_score", "max_rank", "raw_id"]],
        left_on=["_school_code", "_major_code", "_subject"],
        right_on=key_cols,
        how="left",
        suffixes=("", "_01_2025"),
    )
    matched = merged["raw_id"].notna().sum()
    stats = {
        "expert_rows": int(len(df)),
        "official_2025_rows": int(len(off25)),
        "matched_by_school_major_subject": int(matched),
        "match_rate": round(matched / len(df), 4) if len(df) else 0,
    }
    return merged, stats


def build_admission_master(merged: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    rows = []
    unmatched_batch = Counter()
    for idx, row in merged.iterrows():
        batch_raw = clean_text(col(row, "批次"))
        batch = normalize_batch(batch_raw)
        enrollment_type = normalize_enrollment_type(batch_raw, col(row, "招生类型", "类型"))
        node_id = resolve_batch_node(batch, enrollment_type)
        if node_id is None:
            unmatched_batch[(batch or "", enrollment_type or "")] += 1
        rows.append({
            "record_id": f"codex03-{idx + 1:06d}",
            "source03_row": int(idx + 2),
            "school_code": zfill_code(col(row, "院校代码")),
            "school_name": clean_text(col(row, "院校")),
            "subject": clean_text(col(row, "科目")),
            "batch_raw": batch_raw,
            "batch_norm": batch,
            "enrollment_type": enrollment_type,
            "batch_node_id": node_id,
            "group_code": clean_text(col(row, "专业组代码")),
            "major_code": clean_text(col(row, "专业代码")),
            "major_name": clean_text(col(row, "专业")),
            "major_category": clean_text(col(row, "专业类")),
            "discipline": clean_text(col(row, "门类")),
            "major_note": clean_text(col(row, "专业备注")),
            "school_note": clean_text(col(row, "院校备注")),
            "subject_requirement": clean_text(col(row, "选科要求")),
            "is_new": clean_text(col(row, "是否新增")),
            "duration": to_int(col(row, "学制")),
            "tuition": to_int(col(row, "学费")),
            "plan_2025_03": to_int(col(row, "计划人数")),
            "group_plan_2025_03": to_int(col(row, "25专业组计划")),
            "min_2025_03": to_int(col(row, "25最低分", "最低分")),
            "min_rank_2025_03": to_int(col(row, "25最低位次", "最低位次")),
            "avg_2025_03": to_float(col(row, "25平均分")),
            "max_2025_03": to_int(col(row, "25最高分")),
            "admitted_2025_03": to_int(col(row, "25录取人数", "录取人数")),
            "official_2025_id": clean_text(col(row, "raw_id")),
            "plan_2025_01": to_int(col(row, "plan")),
            "admitted_2025_01": to_int(col(row, "admitted")),
            "min_2025_01": to_int(col(row, "min_score")),
            "min_rank_2025_01": to_int(col(row, "min_rank")),
            "avg_2025_01": to_float(col(row, "avg_score")),
            "max_2025_01": to_int(col(row, "max_score")),
            "max_rank_2025_01": to_int(col(row, "max_rank")),
            "old_batch_2024": clean_text(col(row, "老批次")),
            "plan_2024_03": to_int(col(row, "24计划人数")),
            "admitted_2024_03": to_int(col(row, "24录取人数")),
            "min_2024_03": to_int(col(row, "24最低分")),
            "min_rank_2024_03": to_int(col(row, "24最低分位次")),
            "avg_2024_03": to_float(col(row, "24平均分")),
            "max_2024_03": to_int(col(row, "24最高分")),
            "old_batch_2023": clean_text(col(row, "老批次2")),
            "plan_2023_03": to_int(col(row, "23计划人数")),
            "admitted_2023_03": to_int(col(row, "23录取人数")),
            "min_2023_03": to_int(col(row, "23最低分")),
            "min_rank_2023_03": to_int(col(row, "23最低分位次")),
            "avg_2023_03": to_float(col(row, "23平均分")),
            "max_2023_03": to_int(col(row, "23最高分")),
            "admitted_2022_03": to_int(col(row, "22录取人数")),
            "min_2022_03": to_int(col(row, "22最低分")),
            "min_rank_2022_03": to_int(col(row, "22最低分位次")),
            "avg_2022_03": to_float(col(row, "22平均分")),
            "max_2022_03": to_int(col(row, "22最高分")),
            "ruanke_rating": clean_text(col(row, "软科评级")),
            "ruanke_rank": to_int(col(row, "软科排名")),
            "discipline_eval": clean_text(col(row, "学科评估")),
            "major_level": clean_text(col(row, "专业水平")),
            "national_featured": clean_text(col(row, "是否国家特色")),
            "major_rank": to_int(col(row, "专业排名")),
            "major_honor": clean_text(col(row, "专业荣誉")),
            "source": "03专家版主表;01核心录取数据(2025精确码校验)",
        })
    master = pd.DataFrame(rows)
    key_cols = ["school_code", "group_code", "major_code", "batch_norm", "subject"]
    duplicate_keys = int(master.duplicated(key_cols, keep=False).sum())
    quality = {
        "rows": int(len(master)),
        "unique_school_count": int(master["school_code"].nunique()),
        "batch_node_matched": int(master["batch_node_id"].notna().sum()),
        "batch_node_unmatched": int(master["batch_node_id"].isna().sum()),
        "batch_node_match_rate": round(master["batch_node_id"].notna().sum() / len(master), 4) if len(master) else 0,
        "unmatched_batch_top": [
            {"batch": k[0], "enrollment_type": k[1], "count": v}
            for k, v in unmatched_batch.most_common(30)
        ],
        "official_2025_exact_matches": int(master["official_2025_id"].notna().sum()),
        "duplicate_key_rows": duplicate_keys,
    }
    return master, quality


def build_major_catalog(sources: dict[str, pd.DataFrame]) -> pd.DataFrame:
    catalog = sources["major_catalog"].copy()
    detail = sources["major_detail"].copy()
    if "代码" in catalog.columns:
        catalog = catalog.rename(columns={"代码": "专业代码", "名称": "专业名称"})
    if {"专业代码", "专业名称"}.issubset(detail.columns):
        detail_keep = [c for c in [
            "专业代码", "专业名称", "学历层次", "学科门类", "学科类", "学生规模", "男生比例", "女生比例",
            "综合满意度", "就业满意度", "专业简介", "就业方向", "考研方向", "数据来源",
        ] if c in detail.columns]
        catalog = catalog.merge(detail[detail_keep].drop_duplicates("专业代码"), on=["专业代码"], how="left", suffixes=("", "_详情"))
    return catalog


def write_outputs(
    source_path: Path,
    expert: pd.DataFrame,
    registry: pd.DataFrame,
    base_stats: dict[str, Any],
    official: pd.DataFrame,
    official_stats: dict[str, Any],
    master: pd.DataFrame,
    master_quality: dict[str, Any],
    major_catalog: pd.DataFrame,
) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    batch_tree = build_batch_tree()
    (OUT / "batch_tree_2025.json").write_text(json.dumps(batch_tree, ensure_ascii=False, indent=2), encoding="utf-8")
    registry.to_json(OUT / "school_registry.json", orient="records", force_ascii=False, indent=2)
    official.to_csv(OUT / "official_scores_long.csv", index=False, encoding="utf-8-sig")
    major_catalog.to_csv(OUT / "major_catalog_enriched.csv", index=False, encoding="utf-8-sig")
    master.to_csv(OUT / "admission_master_codex.csv", index=False, encoding="utf-8-sig")
    master.head(500).to_json(OUT / "admission_master_sample_500.json", orient="records", force_ascii=False, indent=2)

    lineage = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "inputs": {
            "03_expert_main": str(source_path.relative_to(ROOT)),
            "01_core_admission_dir": str(DIR01.relative_to(ROOT)),
            "02_national_base_dir": str(DIR02.relative_to(ROOT)),
            "forbidden_inputs": ["data/03_专家版主表/output", "data/_pipeline"],
        },
        "field_policy": {
            "03": "招生事实主源，保留专家版非空值",
            "01": "官方录取/计划数据，用于2025精确码校验与独立长表",
            "02": "院校、专业、章程、满意度、学科评估等基础元数据补充",
        },
        "base_match_stats": base_stats,
        "official_match_stats": official_stats,
        "master_quality": master_quality,
    }
    (OUT / "lineage.json").write_text(json.dumps(lineage, ensure_ascii=False, indent=2), encoding="utf-8")

    report = [
        "# Codex 三源独立整合报告",
        "",
        f"- 生成时间: {lineage['generated_at']}",
        f"- 03专家版主源: `{lineage['inputs']['03_expert_main']}`",
        "- 明确未读取: `data/03_专家版主表/output`, `data/_pipeline`",
        "",
        "## 产物",
        "",
        "- `batch_tree_2025.json`: 2025四川新高考批次树",
        "- `school_registry.json`: 03院校去重 + 02基础库补充",
        "- `admission_master_codex.csv`: 03招生主表 + 01官方2025精确码校验字段",
        "- `official_scores_long.csv`: 01专业分数线2022-2025标准长表",
        "- `major_catalog_enriched.csv`: 02专业库基础信息",
        "- `lineage.json`: 字段来源和匹配统计",
        "",
        "## 核心统计",
        "",
        f"- 专家版输入行数: {len(expert):,}",
        f"- 输出招生事实行数: {len(master):,}",
        f"- 院校注册数: {len(registry):,}",
        f"- 01官方专业分数线长表行数: {len(official):,}",
        f"- 2025官方精确匹配: {official_stats['matched_by_school_major_subject']:,}/{official_stats['expert_rows']:,} ({official_stats['match_rate']:.2%})",
        f"- 批次树节点命中: {master_quality['batch_node_matched']:,}/{master_quality['rows']:,} ({master_quality['batch_node_match_rate']:.2%})",
        "",
        "## 02基础库匹配率",
        "",
    ]
    for key, stat in base_stats.items():
        if "matched_schools" in stat:
            report.append(f"- {key}: {stat['matched_schools']:,}/{stat['total_schools']:,} ({stat['match_rate']:.2%})")
        else:
            report.append(f"- {key}: {stat}")
    report.extend(["", "## 批次未命中Top", ""])
    for item in master_quality["unmatched_batch_top"][:20]:
        report.append(f"- {item['batch']} / {item['enrollment_type']}: {item['count']}")
    (OUT / "quality_report.md").write_text("\n".join(report) + "\n", encoding="utf-8")


def main() -> None:
    source_path, expert = select_expert_source()
    sources = load_base_sources()
    registry, base_stats = build_school_registry(expert, sources)
    official = load_official_scores()
    merged, official_stats = merge_official_2025(expert, official)
    master, master_quality = build_admission_master(merged)
    major_catalog = build_major_catalog(sources)
    write_outputs(source_path, expert, registry, base_stats, official, official_stats, master, master_quality, major_catalog)
    print(json.dumps({
        "output": str(OUT),
        "expert_source": str(source_path),
        "expert_rows": len(expert),
        "registry_rows": len(registry),
        "master_rows": len(master),
        "official_rows": len(official),
        "official_2025_match_rate": official_stats["match_rate"],
        "batch_node_match_rate": master_quality["batch_node_match_rate"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
