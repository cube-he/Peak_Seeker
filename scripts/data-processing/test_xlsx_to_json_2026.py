"""Tests for xlsx_to_json_2026.py — 86-col master converter (read by column name)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from xlsx_to_json_2026 import (
    build_header_index,
    REQUIRED_COLS,
    convert_majors,
    extract_group_name,
    convert_plans_row,
)

# 86-column header of 四川-2026-专家版数据_批次标准化.xlsx (Sheet1), in order.
HEADER = [
    "科类", "批次", "招生类型", "院校代码", "院校名称", "专业组代码", "专业代码", "专业全称",
    "专业名称", "专业备注", "其他备注", "选科要求", "专业层次", "计划人数", "学费", "学制",
    "招生考试报页码", "组内专业", "专业组计划人数", "组内专业数", "专业组干净度", "门类", "专业类",
    "26年预估位次", "是否新增", "专业组录取人数1", "专业组最低分1", "专业组最低位次1", "录取人数1",
    "最低分1", "最低位次1", "平均分1", "平均位次1", "最高分1", "最高位次1", "老批次1", "计划人数结果1",
    "录取人数2", "最低分2", "最低位次2", "平均分2", "平均位次2", "老批次2", "计划人数结果2",
    "录取人数3", "最低分3", "最低位次3", "平均分3", "平均位次3", "最高分3", "最高位次3", "老批次3",
    "计划人数结果3", "所在省", "城市", "城市水平标签", "院校标签", "院校水平", "更名合并转设",
    "隶属单位", "类型", "公私性质", "本科/专科", "保研率", "院校排名", "转专业情况", "全校硕士专业数",
    "全校硕士专业", "全校博士专业数", "全校博士专业", "录取规则", "招生章程", "软科评级", "软科排名",
    "学科评估", "专业水平", "本专业硕士点", "本专业博士点", "投档顺序", "志愿设置", "25所在组代码",
    "25老组投档线", "25老组投档位次", "25老组专业数", "25老组专业构成", "专业组是否改变",
]


def test_header_index_maps_names():
    H = build_header_index(tuple(HEADER))
    assert H["计划人数"] == 13
    assert H["专业组计划人数"] == 18
    assert H["科类"] == 0
    assert H["专业组是否改变"] == 85


def test_missing_required_column_raises():
    bad = [c for c in HEADER if c != "院校代码"]
    with pytest.raises(ValueError, match="院校代码"):
        build_header_index(tuple(bad))


def test_majors_dedupe_and_level():
    rows = [
        {"专业名称": "环境科学", "专业代码": "41", "门类": "工学", "专业类": "环境科学与工程类",
         "本科/专科": "本科", "专业备注": "x", "专业水平": "A+", "软科评级": "A"},
        {"专业名称": "环境科学", "专业代码": "41", "门类": "工学", "专业类": "环境科学与工程类",
         "本科/专科": "本科", "专业备注": "x", "专业水平": "A+", "软科评级": "A"},
        {"专业名称": "护理", "专业代码": "50", "门类": "医学", "专业类": "护理学类",
         "本科/专科": "职业本科", "专业备注": None, "专业水平": None, "软科评级": None},
    ]
    majors = convert_majors(rows)
    assert len(majors) == 2  # 环境科学 去重
    huli = [m for m in majors if m["name"] == "护理"][0]
    assert huli["level"] == "本科"  # 职业本科 → 本科
    assert huli["discipline"] == "护理学类"
    assert huli["category"] == "医学"


def test_group_name_directed():
    r = {"专业备注": "(凉山州)(区域教育均衡发展专项计划)", "招生类型": "区域教育均衡发展专项计划"}
    assert extract_group_name(r) == "(凉山州)(区域教育均衡发展专项计划)"


def test_group_name_normal_is_none():
    r = {"专业备注": "(中外合作办学)", "招生类型": "普通类本科"}
    assert extract_group_name(r) is None


def _plan_row(**ov):
    base = {
        "院校代码": "0001", "专业名称": "环境科学", "专业代码": "41", "专业组代码": "102",
        "科类": "物理", "批次": "本科批B段", "招生类型": "普通类本科", "本科/专科": "本科",
        "选科要求": "化学", "是否新增": "否", "老批次1": "本科一批", "学科评估": "A",
        "本专业硕士点": "是", "本专业博士点": None, "软科评级": "A", "专业备注": "(中外合作办学)",
        "计划人数": 3, "专业组计划人数": 20, "学费": 5000, "学制": 4,
        "计划人数结果1": 3, "计划人数结果2": 2, "计划人数结果3": None,
    }
    base.update(ov)
    return base


def test_plans_2026_plus_history():
    plans = convert_plans_row(_plan_row())
    years = sorted(p["year"] for p in plans)
    assert years == [2024, 2025, 2026]  # 计划人数结果3 为空 → 无 2023
    p26 = [p for p in plans if p["year"] == 2026][0]
    assert p26["planCount"] == 3 and p26["groupPlanCount"] == 20 and p26["tuition"] == 5000
    assert p26["subjects"] == "物理" and p26["recruitType"] == "普通类本科"
    assert p26["universityEnrollCode"] == "0001" and p26["groupCode"] == "102"
    assert p26["planNotes"] == "(中外合作办学)"  # 中外合作回填用
    assert p26["isNationalFeature"] is False and p26["groupName"] is None
    p25 = [p for p in plans if p["year"] == 2025][0]
    assert p25["planCount"] == 3 and p25["groupPlanCount"] is None


def test_plans_only_2026_when_history_empty():
    plans = convert_plans_row(_plan_row(计划人数结果1=None, 计划人数结果2=None, 计划人数结果3=None))
    assert [p["year"] for p in plans] == [2026]
