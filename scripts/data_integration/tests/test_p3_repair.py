# -*- coding: utf-8 -*-
"""Tests for P3.4 repair pipeline."""
import pandas as pd

from pathlib import Path

from scripts.data_integration.p3_repair import (
    _select_preferred_engine,
    parse_folder_metadata,
    repair_df,
)


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


def test_repair_df_forward_fills_college_code():
    """Continuation rows (with 专业代码 but empty 院校代码) get forward-filled."""
    df = pd.DataFrame({
        "院校代码": ["0382", None, None, "1161"],
        "院校名称": ["学院A", None, None, "学院B"],
        "专业代码": ["01", "02", "03", "01"],
        "专业名称": ["p1", "p2", "p3", "q1"],
        "专业备注": [None, None, None, None],
    })
    new_df, log = repair_df(df, "test.xlsx")
    # rows 1,2 should be filled with 0382 / 学院A; row 3 keeps its own
    assert new_df.iloc[1]["院校代码"] == "0382"
    assert new_df.iloc[2]["院校代码"] == "0382"
    assert new_df.iloc[3]["院校代码"] == "1161"
    assert new_df.iloc[1]["院校名称"] == "学院A"
    # fix log should contain forward_fill_college entries
    assert any(r["fix_type"] == "forward_fill_college" for r in log)


def test_repair_df_forward_fill_does_not_fill_real_blank_row():
    """If both 院校代码 and 专业代码 empty, it's a separator/blank row — don't fill."""
    df = pd.DataFrame({
        "院校代码": ["0382", None],
        "院校名称": ["学院A", None],
        "专业代码": ["01", None],
        "专业名称": ["p1", None],
        "专业备注": [None, None],
    })
    new_df, log = repair_df(df, "test.xlsx")
    # row 1: 专业代码 also empty → don't forward-fill 院校代码
    assert pd.isna(new_df.iloc[1]["院校代码"]) or new_df.iloc[1]["院校代码"] is None


def test_select_preferred_engine_mimo_wins_over_claude_and_duoyin():
    folder = Path("/tmp/fake_folder")
    base = "3335_2023_文科_专科批_征集志愿_第一次"
    files = [
        folder / f"{base}_mimo-v2-omni.xlsx",
        folder / f"{base}_claude.xlsx",
        folder / f"{base}_多引擎.xlsx",
    ]
    out = _select_preferred_engine(files)
    assert out[files[0]] == "keep"
    assert "duplicate_engine" in out[files[1]]
    assert "duplicate_engine" in out[files[2]]


def test_select_preferred_engine_claude_wins_over_duoyin_when_no_mimo():
    """When mimo absent, claude should be preferred over 多引擎 (which has metadata-row bug)."""
    folder = Path("/tmp/fake_folder")
    base = "4414_2025_物历综合_本科批次_B段_征集志愿_第三次"
    files = [
        folder / f"{base}_claude.xlsx",
        folder / f"{base}_多引擎.xlsx",
    ]
    out = _select_preferred_engine(files)
    assert out[files[0]] == "keep"
    assert "duplicate_engine" in out[files[1]]
    assert "kept _claude.xlsx" in out[files[1]]


def test_select_preferred_engine_independent_folders_not_grouped():
    """Files from different folders shouldn't interfere."""
    f1 = Path("/tmp/a") / "x_mimo-v2-omni.xlsx"
    f2 = Path("/tmp/b") / "y_claude.xlsx"
    out = _select_preferred_engine([f1, f2])
    assert out[f1] == "keep"
    assert out[f2] == "keep"


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
