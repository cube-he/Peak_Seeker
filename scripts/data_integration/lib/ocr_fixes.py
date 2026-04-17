# -*- coding: utf-8 -*-
"""
P3.4 — OCR 修复工具函数。
独立于 I/O，便于测试与复用。
"""
from __future__ import annotations

import re
from typing import Optional, Tuple


# --- 字符标准化层 ---

_BRACKET_HALF_TO_FULL = str.maketrans({"(": "（", ")": "）"})


def normalize_chars(text):
    """Unify brackets (half-width → full-width Chinese) and whitespace.

    简繁转换不在此处；历史数据主体已是简体。
    """
    if text is None:
        return None
    s = str(text)
    s = s.translate(_BRACKET_HALF_TO_FULL)
    s = re.sub(r"\s+", " ", s).strip()
    return s


# --- 代码层 ---

_LETTER_TO_DIGIT = str.maketrans({"O": "0", "o": "0", "l": "1", "I": "1", "S": "5", "Z": "2"})


def fix_college_code(code) -> Tuple[Optional[str], Optional[str]]:
    """Return (new_code, reason_or_None).

    规则:
      - None / empty → 原值
      - 4 位纯数字 → 不动
      - <4 位 纯数字 → 补前导 0
      - 含字母混淆 (O/l/S...) 且其它为数字 → 替换字母
      - 2 位 字母数字混合 (2K, 1A, 0T) → 保留但 flag
      - 其它 → flag
    """
    if code is None:
        return None, None
    s = str(code).strip()
    if not s:
        return s, None
    # Strip trailing '.0' from pandas float coercion (defensive; loader should handle)
    if s.endswith(".0") and s[:-2].isdigit():
        s = s[:-2]

    # Character confusion first — translate then check
    translated = s.translate(_LETTER_TO_DIGIT)
    if translated != s and translated.isdigit():
        # Apply pad if needed after translation
        if len(translated) < 4:
            padded = translated.zfill(4)
            return padded, f"char_confusion+pad:{s}→{padded}"
        if len(translated) == 4:
            return translated, f"char_confusion:{s}→{translated}"

    # Pure digit cases
    if s.isdigit():
        if len(s) == 4:
            return s, None
        if len(s) < 4:
            padded = s.zfill(4)
            return padded, f"pad_zero:{s}→{padded}"
        # >4 digits: too long, flag
        return s, f"flag:too_long_{len(s)}_digits"

    # Short alphanumeric (2K, 1A, 0T) — legit special-batch code
    if len(s) <= 3 and s.isalnum():
        return s, "flag:short_alphanum"

    # Otherwise: keep and flag
    return s, "flag:unknown_pattern"


def fix_major_code(code) -> Tuple[Optional[str], Optional[str]]:
    """专业代码: 字符集应为 数字 + 大写字母。
    已知 OCR 渲染尾部可能带 [V] / [R] 等 tag，strip 之。
    """
    if code is None:
        return None, None
    s = str(code).strip()
    if not s:
        return s, None

    # Strip ' [X]' or '[X]' tag at end
    m = re.match(r"^(\S+)\s*\[[A-Za-z0-9]\]\s*$", s)
    if m:
        clean = m.group(1)
        return clean, f"strip_bracket_tag:{s}→{clean}"

    return s, None


# --- 结构层 ---

def detect_multiline_memo_continuation(text) -> bool:
    """memo 结尾含 ） 但前半无 （ → 跨行续写。"""
    if text is None:
        return False
    s = str(text)
    open_cn = s.count("（")
    close_cn = s.count("）")
    open_en = s.count("(")
    close_en = s.count(")")
    # More closes than opens → continuation
    return (close_cn > open_cn) or (close_en > open_en)
