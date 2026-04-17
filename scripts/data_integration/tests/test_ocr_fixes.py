# -*- coding: utf-8 -*-
"""Tests for P3.4 ocr_fixes utilities."""
from scripts.data_integration.lib.ocr_fixes import (
    normalize_chars,
    fix_college_code,
    fix_major_code,
    detect_multiline_memo_continuation,
)


def test_normalize_chars_brackets_unified():
    # Half-width → full-width Chinese
    assert normalize_chars("abc(def)ghi") == "abc（def）ghi"


def test_normalize_chars_whitespace():
    assert normalize_chars("  a   b  c  ") == "a b c"


def test_normalize_chars_none_passthrough():
    assert normalize_chars(None) is None


def test_normalize_chars_preserves_chinese():
    assert normalize_chars("电子商务（网站运营）") == "电子商务（网站运营）"


def test_fix_college_code_pad_leading_zero():
    new, reason = fix_college_code("382")
    assert new == "0382"
    assert reason == "pad_zero:382→0382"


def test_fix_college_code_already_valid():
    new, reason = fix_college_code("0382")
    assert new == "0382"
    assert reason is None


def test_fix_college_code_letter_confusion():
    # O/l/S mistaken for digits in a mostly-digit context
    new, reason = fix_college_code("O123")
    assert new == "0123"
    assert reason and "char_confusion" in reason


def test_fix_college_code_legit_alphanumeric_not_touched():
    # 2-char alphanumeric (e.g. "2K", "1A") is a real special-batch code, not malformed.
    new, reason = fix_college_code("2K")
    # We cannot "fix" a 2-char code to 4 digits — preserve + flag
    assert new == "2K"
    assert reason == "flag:short_alphanum"


def test_fix_college_code_none():
    new, reason = fix_college_code(None)
    assert new is None
    assert reason is None


def test_fix_major_code_bracket_suffix_stripped():
    # '47 [V]' is OCR garbage from rendering artifacts; strip trailing bracket + letter tag
    new, reason = fix_major_code("47 [V]")
    assert new == "47"
    assert reason and "strip_bracket_tag" in reason


def test_fix_major_code_preserves_normal():
    assert fix_major_code("C9") == ("C9", None)
    assert fix_major_code("01") == ("01", None)


def test_detect_multiline_memo_continuation():
    # Memo ending with ） but no opening ( → continuation from previous row
    assert detect_multiline_memo_continuation("男生身高172cm，色盲、色弱。）") is True
    # Balanced brackets → not continuation
    assert detect_multiline_memo_continuation("（泉州校区）包含专业") is False
    # No brackets
    assert detect_multiline_memo_continuation("普通备注文字") is False
