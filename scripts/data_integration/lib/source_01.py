"""01 核心录取数据 读取器。

Why a separate module: 01 的 json schema 与 03 不同（英文字段 + 2025 字段翻转），
需要统一归一化到 03 口径后才能 outer join。
"""
from __future__ import annotations
import json
from pathlib import Path
import pandas as pd

# 字段映射：01 英文字段 → 03 中文字段（2022-2024 默认）
_FIELD_MAP_DEFAULT = {
    "collegeCode": "院校代码_国标",
    "collegeName": "院校名称_01",
    "professionEnrollCode": "专业代码",
    "professionName": "专业名称_01",
    "batch": "批次",
    "course": "科目",
    "uMinScore": "最低分",
    "uAvgScore": "平均分",
    "uMaxScore": "最高分",
    "uMinRank": "最低位次",
    "uAvgRank": "平均位次",
    "uMaxRank": "最高位次",
    "enrollCount": "录取人数",
    "planCount": "计划人数",
    "uZjText": "征集标志",
    "pressureScore": "压力线",
    "collegeType": "办学性质",
    "collegeCategory": "院校分类",
}

# 2025 专用映射（字段翻转）：从 minScore/avgScore/maxScore 取分
# uMinScore/uAvgScore/uMaxScore 在 2025 中全为 0，先 drop 再映射
_FIELD_MAP_2025 = {
    **_FIELD_MAP_DEFAULT,
    "minScore": "最低分",
    "avgScore": "平均分",
    "maxScore": "最高分",
}


def load_01_major_scores(path: str | Path, year: int) -> pd.DataFrame:
    """Load 01 专业分数线 json and normalize to 03 schema.

    Why year param drives field selection: ISSUE-001 documents that 2025 data
    flipped score fields — uMinScore became always 0 and real scores moved to
    minScore. Passing year at load-time avoids ambiguity during downstream join.
    """
    path = Path(path)
    raw = json.loads(path.read_text(encoding="utf-8"))
    df = pd.DataFrame(raw)
    field_map = _FIELD_MAP_2025 if int(year) == 2025 else _FIELD_MAP_DEFAULT

    # 2025: drop stale uMinScore/uAvgScore/uMaxScore (all zeros) before rename
    # so they don't collide with the real minScore/avgScore/maxScore mapping
    if int(year) == 2025:
        for drop_col in ("uMinScore", "uAvgScore", "uMaxScore"):
            if drop_col in df.columns:
                df = df.drop(columns=[drop_col])

    # Only rename columns that actually exist — handles partial schemas gracefully
    actual_map = {k: v for k, v in field_map.items() if k in df.columns}
    df = df.rename(columns=actual_map)

    # Normalize 院校代码_国标 to string preserving original digit count.
    # 注：国标代码实际混合 5 位和 6 位（如清华 10003 / 北京邮电宏福校区 100132）；
    # 编码映射表_招生代码_国标代码.csv 保留原始长度，zfill(6) 会破坏匹配。
    if "院校代码_国标" in df.columns:
        df["院校代码_国标"] = df["院校代码_国标"].astype(str).str.strip()

    df["数据年份"] = int(year)
    return df
