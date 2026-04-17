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


def test_load_01_drops_empty_placeholder_rows_by_default(tmp_path):
    """ISSUE-011: 2025 minScore==0 且 enterNum==0 的占位记录默认丢弃。

    2025 实际数据中此类行 ~26K，若不过滤会在 outer join 中污染 right_only。
    """
    import json
    p = tmp_path / "mini_empty.json"
    p.write_text(json.dumps([
        {
            "collegeCode": "100001", "collegeName": "X 大学",
            "professionEnrollCode": "01", "professionName": "真实专业",
            "batch": "本科A", "course": "物理",
            "uMinScore": 0, "uAvgScore": 0, "uMaxScore": 0,
            "minScore": 620, "avgScore": 625, "maxScore": 628,
            "uMinRank": 0, "minRank": 300,
            "uEnterNum": 0, "enterNum": 5, "planNum": 5,
        },
        {
            "collegeCode": "100002", "collegeName": "Y 大学",
            "professionEnrollCode": "02", "professionName": "占位专业",
            "batch": "专科", "course": "物理",
            "uMinScore": 0, "uAvgScore": 0, "uMaxScore": 0,
            "minScore": 0, "avgScore": 0, "maxScore": 0,
            "uMinRank": 0, "minRank": 0,
            "uEnterNum": 0, "enterNum": 0, "planNum": 1,
        },
    ], ensure_ascii=False), encoding="utf-8")
    df = load_01_major_scores(p, year=2025)
    assert len(df) == 1
    assert df.iloc[0]["院校代码_国标"] == "100001"


def test_load_01_keeps_empty_rows_when_drop_empty_false(tmp_path):
    """drop_empty=False 保留占位行（给审计路径用）。"""
    import json
    p = tmp_path / "mini_empty.json"
    p.write_text(json.dumps([
        {
            "collegeCode": "100002", "collegeName": "Y 大学",
            "professionEnrollCode": "02", "professionName": "占位专业",
            "batch": "专科", "course": "物理",
            "uMinScore": 0, "uAvgScore": 0, "uMaxScore": 0,
            "minScore": 0, "avgScore": 0, "maxScore": 0,
            "uMinRank": 0, "minRank": 0,
            "uEnterNum": 0, "enterNum": 0, "planNum": 1,
        },
    ], ensure_ascii=False), encoding="utf-8")
    df = load_01_major_scores(p, year=2025, drop_empty=False)
    assert len(df) == 1


def test_load_01_2024_drop_empty_uses_uMinScore(tmp_path):
    """2024 口径：drop_empty 基于 uMinScore==0 且 uEnterNum==0。"""
    import json
    p = tmp_path / "mini_empty_2024.json"
    p.write_text(json.dumps([
        {
            "collegeCode": "100001", "collegeName": "X 大学",
            "professionEnrollCode": "01", "professionName": "真实",
            "batch": "本一", "course": "理科",
            "uMinScore": 630, "uAvgScore": 635, "uMaxScore": 640,
            "uMinRank": 400, "uEnterNum": 5, "planNum": 5,
        },
        {
            "collegeCode": "100002", "collegeName": "Y 大学",
            "professionEnrollCode": "02", "professionName": "占位",
            "batch": "专科", "course": "理科",
            "uMinScore": 0, "uAvgScore": 0, "uMaxScore": 0,
            "uMinRank": 0, "uEnterNum": 0, "planNum": 1,
        },
    ], ensure_ascii=False), encoding="utf-8")
    df = load_01_major_scores(p, year=2024)
    assert len(df) == 1
    assert df.iloc[0]["院校代码_国标"] == "100001"


def test_load_01_converts_score_rank_zeros_to_nan(tmp_path):
    """ISSUE-014: 01 分数/位次字段值为 0 归一成 NaN（非真实成绩，避免假 anomaly）。
    但 录取人数/计划人数 的 0 保留（"计划未录取"是真实信号）。"""
    import json
    p = tmp_path / "mini_zeros.json"
    p.write_text(json.dumps([
        {
            "collegeCode": "100001", "collegeName": "X",
            "professionEnrollCode": "01", "professionName": "真实",
            "batch": "本科A", "course": "物理",
            "uMinScore": 0, "uAvgScore": 0, "uMaxScore": 0,
            "minScore": 600, "avgScore": 0, "maxScore": 620,  # 平均分 0 → NaN
            "uMinRank": 0, "minRank": 500, "avgRank": 0, "maxRank": 400,  # 平均位次 0 → NaN
            "uEnterNum": 0, "enterNum": 0, "planNum": 3,  # 录取人数 0 保留
        },
    ], ensure_ascii=False), encoding="utf-8")
    df = load_01_major_scores(p, year=2025)
    row = df.iloc[0]
    assert row["最低分"] == 600
    assert pd.isna(row["平均分"])      # 0 → NaN
    assert row["最高分"] == 620
    assert pd.isna(row["平均位次"])    # 0 → NaN
    assert row["最低位次"] == 500
    assert row["最高位次"] == 400
    assert row["录取人数"] == 0        # 0 保留（非分数字段）
    assert row["计划人数"] == 3


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
            "uEnterNum": 3, "planNum": 3,
        }
    ], ensure_ascii=False), encoding="utf-8")
    df = load_01_major_scores(p, year=2024)
    assert df.iloc[0]["院校代码_国标"] == "10003"  # 5 位保留，未被 zfill 到 6 位
