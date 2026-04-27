# -*- coding: utf-8 -*-
"""Layer 1: 批次树生成器 — 2025 四川新高考。

生成完整的 37 叶节点批次树，作为三层数据结构的主干：
  - Layer 1: batch_tree (本文件)
  - Layer 2: batch_mapping（志愿填报表格映射）
  - Layer 3: enrollment_data（录取数据，通过 batchNodeId 引用 Layer 1）

设计来源：2025 四川省招生考试报，逐批次核对。
Design doc: docs/superpowers/specs/2026-04-27-three-layer-data-structure-design.md
"""
from __future__ import annotations

import json
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


# ---------------------------------------------------------------------------
# 常量：subjects 简写
# ---------------------------------------------------------------------------
_BOTH = ["物理", "历史"]
_PHY = ["物理"]


# ---------------------------------------------------------------------------
# 辅助：构造叶节点
# ---------------------------------------------------------------------------

def _leaf(
    node_id: str,
    name: str,
    etype: str,
    order: int,
    subjects: list[str] | None = None,
    data: str = "has_data",
) -> dict:
    """构造一个叶节点 dict。

    Args:
        node_id:  全局唯一 ID（snake_case，层级用 _ 分隔）
        name:     中文名称（与招生考试报一致）
        etype:    enrollmentType 字符串
        order:    投档顺序序号（同级内）
        subjects: 适用科目列表；默认 ["物理", "历史"]
        data:     "has_data" 或 "no_data"
    """
    return {
        "id": node_id,
        "name": name,
        "enrollmentType": etype,
        "order": order,
        "subjects": subjects if subjects is not None else _BOTH,
        "dataStatus": data,
    }


# ---------------------------------------------------------------------------
# 各顶层批次构建函数
# ---------------------------------------------------------------------------

def _本科提前批次() -> dict:
    return {
        "id": "bktqp",
        "name": "本科提前批次",
        "order": 1,
        "children": [
            {
                **_leaf("bktqp_gjzx", "国家专项计划", "国家专项计划", 1),
                "volunteerSettings": {"mode": "parallel", "count": 2},
            },
            {
                "id": "bktqp_a",
                "name": "A段",
                "order": 2,
                "volunteerSettings": {
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
                "volunteerSettings": {"mode": "sequential", "count": 1, "desc": "1个顺序志愿"},
            },
            {
                "id": "bktqp_b",
                "name": "B段",
                "order": 4,
                "volunteerSettings": {"mode": "parallel", "count": 30},
                "children": [
                    _leaf("bktqp_b_gjgfsf", "国家公费师范生",   "国家公费师范生",   1),
                    _leaf("bktqp_b_gjyszx", "国家优师专项",     "国家优师专项",     2),
                    _leaf("bktqp_b_ncddyx", "农村订单定向医学生", "农村订单定向医学生", 3),
                    _leaf("bktqp_b_sjgfsf", "省级公费师范生",   "省级公费师范生",   4),
                    _leaf("bktqp_b_dfyszx", "地方优师计划",     "地方优师计划",     5),
                    _leaf("bktqp_b_xczx",   "乡村振兴计划",     "乡村振兴计划",     6),
                    _leaf("bktqp_b_qt",     "其他",             "其他",             7),
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
                "volunteerSettings": {"mode": "parallel", "count": 20},
                "children": [
                    _leaf("bkp_a_gjzx", "国家专项计划", "国家专项计划", 1),
                    _leaf("bkp_a_dfzx", "地方专项计划", "地方专项计划", 2),
                ],
            },
            {
                **_leaf("bkp_gxzx", "高校专项计划", "高校专项计划", 2),
                "volunteerSettings": {
                    "mode": "sequential_1_1",
                    "count": 2,
                    "desc": "2个志愿(1个第一志愿+1个第二志愿)",
                },
            },
            {
                **_leaf("bkp_gspyd", "高水平运动队", "高水平运动队", 3, data="no_data"),
                "volunteerSettings": {"mode": "sequential", "count": 1},
            },
            {
                "id": "bkp_b",
                "name": "B段",
                "order": 4,
                "volunteerSettings": {"mode": "parallel", "count": 45},
                "children": [
                    _leaf("bkp_b_pt",     "普通类本科",
                          "普通类本科", 1),
                    _leaf("bkp_b_bkzyjy",
                          "本科层次职业教育人才培养改革试点",
                          "本科层次职业教育人才培养改革试点", 2),
                    _leaf("bkp_b_mzb",    "民族班",
                          "民族班", 3),
                    _leaf("bkp_b_fxzyx",  "非西藏生源定向西藏就业",
                          "非西藏生源定向西藏就业", 4),
                    _leaf("bkp_b_qtdx",   "其他定向招生",
                          "其他定向招生", 5, _PHY, "no_data"),
                    _leaf("bkp_b_yk",
                          "部委属和外省属高校少数民族预科、边防军人子女预科、"
                          "四川大学国防科研试验基地预科",
                          "部委属和外省属高校少数民族预科、边防军人子女预科、"
                          "四川大学国防科研试验基地预科",
                          6),
                ],
            },
            # 原"少数民族语言授课为主" — 本科/预科 两个子节点，均无数据
            {
                "id": "bkp_smzyy",
                "name": '原"少数民族语言授课为主"',
                "order": 5,
                "volunteerSettings": {"mode": "parallel", "count": 20},
                "children": [
                    _leaf("bkp_smzyy_bk", "本科", "少数民族语言授课为主·本科", 1, data="no_data"),
                    _leaf("bkp_smzyy_yk", "预科", "少数民族语言授课为主·预科", 2, data="no_data"),
                ],
            },
            {
                **_leaf("bkp_jsmzyw", '原"加授少数民族语文"',
                        "加授少数民族语文", 6, data="no_data"),
                "volunteerSettings": {"mode": "parallel", "count": 6},
            },
            {
                **_leaf("bkp_qyjh", "区域教育均衡发展专项计划",
                        "区域教育均衡发展专项计划", 7),
                "volunteerSettings": {"mode": "parallel", "count": 20},
            },
            {
                **_leaf("bkp_sxyk", "省属高校少数民族预科",
                        "省属高校少数民族预科", 8),
                "volunteerSettings": {"mode": "parallel", "count": 20},
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
                "volunteerSettings": {"mode": "parallel", "count": 45},
            },
            {
                **_leaf("zkp_smzyy", '原"少数民族语言授课为主"',
                        "少数民族语言授课为主·专科", 2, data="no_data"),
                "volunteerSettings": {"mode": "parallel", "count": 6},
            },
            {
                **_leaf("zkp_jsmzyw", '原"加授少数民族语文"',
                        "加授少数民族语文·专科", 3, data="no_data"),
                "volunteerSettings": {"mode": "parallel", "count": 6},
            },
        ],
    }


# ---------------------------------------------------------------------------
# 主函数
# ---------------------------------------------------------------------------

def build_batch_tree() -> dict:
    """构建并返回 2025 四川新高考完整批次树（根节点 dict）。

    使用 tree[] 键存放顶层批次列表，与 JSON 输出格式保持一致。
    """
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


# ---------------------------------------------------------------------------
# CLI: 生成 JSON 文件
# ---------------------------------------------------------------------------

def _main() -> None:
    """生成 batch_tree_2025.json 并写入 three_layer_output/。"""
    tree = build_batch_tree()
    OUTPUT_DIR.mkdir(exist_ok=True)
    out_path = OUTPUT_DIR / "batch_tree_2025.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(tree, f, ensure_ascii=False, indent=2)
    print(f"Written: {out_path}")


if __name__ == "__main__":
    _main()
