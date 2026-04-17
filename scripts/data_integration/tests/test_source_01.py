from pathlib import Path
import pandas as pd
from scripts.data_integration.lib.source_01 import load_01_major_scores

FIXTURES = Path(__file__).parent / "fixtures"


def test_load_01_2024_basic_fields():
    df = load_01_major_scores(FIXTURES / "mini_01_2024.json", year=2024)
    assert len(df) == 3
    assert "院校代码_国标" in df.columns
    assert "专业代码" in df.columns
    assert "最低分" in df.columns
    assert "最低位次" in df.columns
    row0 = df.iloc[0]
    assert row0["院校代码_国标"] == "100001"
    assert row0["最低分"] == 680
    assert row0["批次"] == "本一"
    assert row0["科目"] == "理科"


def test_load_01_2024_preserves_nulls():
    df = load_01_major_scores(FIXTURES / "mini_01_2024.json", year=2024)
    row1 = df[df["院校代码_国标"] == "100002"].iloc[0]
    assert pd.isna(row1["平均分"])
    assert pd.isna(row1["平均位次"])


def test_load_01_adds_year_column():
    df = load_01_major_scores(FIXTURES / "mini_01_2024.json", year=2024)
    assert (df["数据年份"] == 2024).all()


def test_load_01_2025_uses_minScore_not_uMinScore():
    """2025: ISSUE-001 字段翻转，必须从 minScore 取分，uMinScore 必须被丢弃。"""
    df = load_01_major_scores(FIXTURES / "mini_01_2025.json", year=2025)
    assert df.iloc[0]["最低分"] == 690
    assert df.iloc[0]["最高分"] == 700
    assert "uMinScore" not in df.columns
    # 位次仍从 uMinRank 取
    assert df.iloc[0]["最低位次"] == 400


def test_load_01_2025_batch_and_course_terminology():
    """2025 批次用"本科A/B"、科目用"物理/历史"（尚未归一化，P2.2 再做）。"""
    df = load_01_major_scores(FIXTURES / "mini_01_2025.json", year=2025)
    assert df.iloc[0]["批次"] == "本科A"
    assert df.iloc[1]["科目"] == "历史"


def test_load_01_preserves_5digit_college_code(tmp_path):
    """国标代码实际混合 5 位和 6 位；不得 zfill(6) 破坏 5 位码（如清华 10003）。"""
    import json
    p = tmp_path / "mini_5digit.json"
    p.write_text(json.dumps([
        {
            "collegeCode": "10003",
            "collegeName": "清华大学",
            "professionEnrollCode": "01",
            "professionName": "计算机类",
            "batch": "本一",
            "course": "理科",
            "uMinScore": 700, "uAvgScore": 705, "uMaxScore": 710,
            "uMinRank": 50, "uAvgRank": 40, "uMaxRank": 30,
            "enrollCount": 3, "planCount": 3,
        }
    ], ensure_ascii=False), encoding="utf-8")
    df = load_01_major_scores(p, year=2024)
    assert df.iloc[0]["院校代码_国标"] == "10003"  # 5 位保留，未被 zfill 到 6 位
