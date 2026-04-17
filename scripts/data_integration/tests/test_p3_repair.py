# -*- coding: utf-8 -*-
"""Tests for P3.4 repair pipeline."""
import pandas as pd

from scripts.data_integration.p3_repair import parse_folder_metadata, repair_df


def test_parse_folder_metadata_basic():
    m = parse_folder_metadata("3335_2023_文科_专科批_征集志愿_第一次")
    assert m["id"] == "3335"
    assert m["year"] == "2023"
    assert m["科类"] == "文科"
    assert m["大批次"] == "专科批"
    assert m["数据类型"] == "征集志愿"
    assert m["轮次"] == "第一次"
    assert m["子类型"] == ""


def test_parse_folder_metadata_with_subtype():
    m = parse_folder_metadata("3855_2024_文理综合_专科批_军事+公安+司法_征集志愿_第二次")
    assert m["大批次"] == "专科批"
    assert m["子类型"] == "军事+公安+司法"
    assert m["轮次"] == "第二次"


def test_repair_df_brackets_normalized():
    df = pd.DataFrame({
        "院校代码": ["0382"],
        "专业代码": ["01"],
        "专业名称": ["金融类(西校区)"],
        "专业备注": [None],
    })
    new_df, log = repair_df(df, "test.xlsx")
    assert new_df.iloc[0]["专业名称"] == "金融类（西校区）"
    assert any(r["fix_type"] == "normalize_chars" for r in log)


def test_repair_df_major_code_strips_tag():
    df = pd.DataFrame({
        "院校代码": ["0382"],
        "专业代码": ["47 [V]"],
        "专业名称": ["test"],
        "专业备注": [None],
    })
    new_df, log = repair_df(df, "test.xlsx")
    assert new_df.iloc[0]["专业代码"] == "47"
    assert any("strip_bracket_tag" in r["fix_type"] for r in log)


def test_repair_df_college_code_padding():
    df = pd.DataFrame({
        "院校代码": ["382"],
        "专业代码": ["01"],
        "专业名称": ["x"],
        "专业备注": [None],
    })
    new_df, log = repair_df(df, "test.xlsx")
    assert new_df.iloc[0]["院校代码"] == "0382"


def test_repair_df_multiline_memo_flag():
    df = pd.DataFrame({
        "院校代码": ["0382", "0382"],
        "专业代码": ["01", "02"],
        "专业名称": ["x", "y"],
        "专业备注": ["正常（完整）", "身高172cm，色盲、色弱。）"],  # 2nd row: unbalanced
    })
    new_df, log = repair_df(df, "test.xlsx")
    assert bool(new_df.iloc[0]["flag_multiline_memo"]) is False
    assert bool(new_df.iloc[1]["flag_multiline_memo"]) is True
