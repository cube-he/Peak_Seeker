"""Tests for xlsx_to_json_2026.py — 86-col master converter (read by column name)."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import pytest

from xlsx_to_json_2026 import build_header_index, REQUIRED_COLS

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
