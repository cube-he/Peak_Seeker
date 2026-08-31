"""Pure helpers for parsing an admission-result screenshot OCR response.

The parser deliberately returns only admission fields. Candidate identity fields and
raw OCR text must never be exposed by this module because admission screenshots may
contain an exam number or an identity-card number.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Sequence, Tuple


MAX_ADMISSION_UPLOAD_BYTES = 20 * 1024 * 1024

ADMISSION_RESULT_FIELDS = (
    "batchName",
    "examType",
    "levelName",
    "universityCode",
    "universityName",
    "groupCode",
    "majorCode",
    "majorName",
    "queryTime",
)

_LABELS: Dict[str, Tuple[str, ...]] = {
    "batchName": ("批次名称", "录取批次", "批次"),
    "examType": ("科类名称", "选科类别", "科类"),
    "levelName": ("层次名称", "录取层次", "层次"),
    "university": ("院校名称", "录取院校"),
    "groupCode": ("院校专业组", "专业组代码", "专业组号", "专业组"),
    "major": ("专业名称", "录取专业"),
    "queryTime": ("查询时间", "查询日期"),
}

_SENSITIVE_LABELS = (
    "姓名",
    "考生号",
    "准考证号",
    "证件号码",
    "证件号",
    "身份证号码",
    "身份证号",
)

_NAME_LABELS = ("考生姓名", "姓名")

_WARNING_FIELD_NAMES = {
    "batchName": "录取批次",
    "examType": "科类",
    "levelName": "层次",
    "university": "录取院校",
    "groupCode": "专业组号",
    "major": "录取专业",
    "queryTime": "查询时间",
}


@dataclass(frozen=True)
class _OcrItem:
    page: int
    x1: float
    y1: float
    x2: float
    y2: float
    text: str
    confidence: float

    @property
    def xc(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def yc(self) -> float:
        return (self.y1 + self.y2) / 2

    @property
    def height(self) -> float:
        return max(1.0, self.y2 - self.y1)


def detect_supported_upload_suffix(content: bytes) -> Optional[str]:
    """Return a canonical suffix for a supported image/PDF magic header."""
    if not content:
        return None

    header = content[:1024]
    if header.lstrip(b"\x00\t\r\n ").startswith(b"%PDF-"):
        return ".pdf"
    if content.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if content.startswith((b"GIF87a", b"GIF89a")):
        return ".gif"
    if len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return ".webp"
    if content.startswith(b"BM"):
        return ".bmp"
    return None


def _norm_text(value: Any) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", str(value or ""))).strip()


def _clamp_confidence(value: Any) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return 0.0
    return max(0.0, min(1.0, number))


def _box_bounds(box: Any, fallback_y: float) -> Tuple[float, float, float, float]:
    try:
        xs = [float(point[0]) for point in box]
        ys = [float(point[1]) for point in box]
        if not xs or not ys:
            raise ValueError("empty box")
        return min(xs), min(ys), max(xs), max(ys)
    except (TypeError, ValueError, IndexError):
        # Some OCR providers may omit coordinates. Keep their reading order while
        # assigning a synthetic row; inline label/value parsing still works.
        return 0.0, fallback_y, 1.0, fallback_y + 1.0


def _to_items(ocr_pages: Sequence[Sequence[Tuple[Any, str, float]]]) -> List[_OcrItem]:
    items: List[_OcrItem] = []
    for page_number, page in enumerate(ocr_pages, start=1):
        for index, raw in enumerate(page):
            if not isinstance(raw, (list, tuple)) or len(raw) < 2:
                continue
            text = _norm_text(raw[1])
            if not text:
                continue
            x1, y1, x2, y2 = _box_bounds(raw[0], float(index * 2))
            confidence = _clamp_confidence(raw[2] if len(raw) >= 3 else 0.0)
            items.append(_OcrItem(page_number, x1, y1, x2, y2, text, confidence))
    return sorted(items, key=lambda item: (item.page, item.y1, item.x1))


def _strip_value_prefix(value: str) -> str:
    return re.sub(r"^[\s:：|丨,，;；\-—]+", "", _norm_text(value)).strip()


def _looks_like_known_label(text: str) -> bool:
    normalized = _norm_text(text)
    return any(
        re.fullmatch(re.escape(label) + r"\s*[:：]?", normalized) is not None
        for labels in _LABELS.values()
        for label in labels
    )


def _contains_sensitive_label(text: str) -> bool:
    return any(label in text for label in _SENSITIVE_LABELS)


def _starts_with_label(text: str, aliases: Sequence[str]) -> bool:
    """Return whether an OCR item starts with one of the supplied labels."""
    normalized = _norm_text(text)
    for alias in sorted(aliases, key=len, reverse=True):
        label_index = normalized.find(alias)
        if label_index < 0:
            continue
        prefix = re.sub(r"^[\s|丨,，;；\-—]+", "", normalized[:label_index])
        if not prefix:
            return True
    return False


def _is_row_label(text: str) -> bool:
    aliases = tuple(alias for values in _LABELS.values() for alias in values)
    return _starts_with_label(text, aliases) or _contains_sensitive_label(text)


def _weighted_confidence(items: Sequence[_OcrItem]) -> float:
    if not items:
        return 0.0
    total_weight = sum(max(1, len(item.text)) for item in items)
    return sum(item.confidence * max(1, len(item.text)) for item in items) / total_weight


def _candidate_is_on_another_label_row(
    label_item: _OcrItem,
    candidate: _OcrItem,
    items: Sequence[_OcrItem],
) -> bool:
    row_tolerance = max(8.0, candidate.height * 0.85)
    return any(
        item is not label_item
        and item is not candidate
        and item.page == label_item.page
        and _is_row_label(item.text)
        and abs(item.yc - candidate.yc) <= row_tolerance
        for item in items
    )


def _right_side_value(label_item: _OcrItem, items: Sequence[_OcrItem]) -> Tuple[str, float]:
    row_tolerance = max(8.0, label_item.height * 0.85)
    horizontal_tolerance = max(8.0, label_item.height * 0.4)
    row_items = [
        item
        for item in items
        if item is not label_item
        and item.page == label_item.page
        and item.x1 >= label_item.x2 - horizontal_tolerance
        and abs(item.yc - label_item.yc) <= row_tolerance
        and not _looks_like_known_label(item.text)
        and not _contains_sensitive_label(item.text)
        and not _candidate_is_on_another_label_row(label_item, item, items)
    ]
    row_items.sort(key=lambda item: item.x1)
    if not row_items:
        return "", 0.0

    # Values split into "[5122]" and "西华师范大学" should be joined, while a
    # distant watermark on the same visual row should be ignored.
    selected = [row_items[0]]
    for candidate in row_items[1:]:
        previous = selected[-1]
        max_gap = max(60.0, 3.0 * max(previous.height, candidate.height))
        if candidate.x1 - previous.x2 > max_gap:
            break
        selected.append(candidate)

    return "".join(item.text for item in selected), _weighted_confidence(selected)


def _below_value(label_item: _OcrItem, items: Sequence[_OcrItem]) -> Tuple[str, float]:
    candidates = [
        item
        for item in items
        if item is not label_item
        and item.page == label_item.page
        and item.y1 >= label_item.y2
        and item.y1 - label_item.y2 <= max(40.0, 3.0 * label_item.height)
        and abs(item.x1 - label_item.x1) <= max(100.0, 4.0 * label_item.height)
        and not _looks_like_known_label(item.text)
        and not _contains_sensitive_label(item.text)
    ]
    if not candidates:
        return "", 0.0

    candidates.sort(key=lambda item: (item.y1 - label_item.y2, abs(item.x1 - label_item.x1)))
    for candidate in candidates:
        # Never borrow a value from another labelled row. This is especially
        # important for identity rows: an empty "院校名称" cell followed by a
        # vertically laid-out "姓名 / 张三" row must not become universityName.
        crossed_or_same_row_label = any(
            item is not label_item
            and item is not candidate
            and item.page == label_item.page
            and _is_row_label(item.text)
            and item.yc > label_item.yc
            and item.yc <= candidate.yc + max(8.0, candidate.height * 0.85)
            for item in items
        )
        if not crossed_or_same_row_label:
            return candidate.text, candidate.confidence * 0.85
    return "", 0.0


def _extract_labelled_value(
    items: Sequence[_OcrItem],
    aliases: Sequence[str],
    allow_below: bool = True,
) -> Tuple[str, float, bool]:
    candidates: List[Tuple[str, float]] = []
    for item in items:
        for alias in sorted(aliases, key=len, reverse=True):
            label_index = item.text.find(alias)
            if label_index < 0:
                continue
            # A value such as "本科批次B段" contains the generic alias "批次"
            # but is not itself a label. Labels must start the OCR item (apart
            # from harmless table punctuation).
            prefix = re.sub(r"^[\s|丨,，;；\-—]+", "", item.text[:label_index])
            if prefix:
                continue

            remainder = _strip_value_prefix(item.text[label_index + len(alias):])
            if remainder and not _contains_sensitive_label(remainder):
                candidates.append((remainder, item.confidence))
                break

            right_value, right_confidence = _right_side_value(item, items)
            if right_value:
                candidates.append((right_value, (item.confidence + right_confidence) / 2))
                break

            if allow_below:
                below_value, below_confidence = _below_value(item, items)
                if below_value:
                    candidates.append((below_value, (item.confidence + below_confidence) / 2))
            # Do not reinterpret an exact long label such as "批次名称" as the
            # shorter alias "批次" and mistake its suffix for a value.
            break

    if not candidates:
        return "", 0.0, False

    # Prefer the highest-confidence non-empty candidate. Flag conflicting values
    # so callers know that manual review may still be necessary.
    candidates.sort(key=lambda candidate: (candidate[1], len(candidate[0])), reverse=True)
    best_value, best_confidence = candidates[0]
    distinct_values = {_norm_text(value) for value, _ in candidates if value}
    return best_value, _clamp_confidence(best_confidence), len(distinct_values) > 1


def _normalize_person_name(value: str) -> str:
    # Identity matching is intentionally exact after harmless Unicode,
    # whitespace and delimiter normalization. Do not use fuzzy matching here.
    return re.sub(r"[\s:：|丨,，;；]+", "", unicodedata.normalize("NFKC", value or "")).strip()


def _match_expected_name(items: Sequence[_OcrItem], expected_name: Optional[str]) -> Optional[bool]:
    normalized_expected = _normalize_person_name(expected_name or "")
    if not normalized_expected:
        return None

    # A name value must be inline with or to the right of the name label. Never
    # use below-row fallback for identity data because it could cross table rows.
    recognized_name, confidence, conflicted = _extract_labelled_value(
        items,
        _NAME_LABELS,
        allow_below=False,
    )
    normalized_recognized = _normalize_person_name(recognized_name)
    if not normalized_recognized or conflicted or confidence < 0.6:
        return None
    return normalized_recognized == normalized_expected


def _clean_plain_value(value: str, max_length: int = 100) -> str:
    cleaned = _strip_value_prefix(value).strip(" []【】()（）|丨,，;；")
    return cleaned[:max_length]


def _clean_name_value(value: str) -> str:
    cleaned = _clean_plain_value(value, 200)
    # OCR engines often split every Chinese glyph in a centered table cell
    # ("西 华 师 范 大 学"). Those spaces are layout artefacts, not name data.
    return re.sub(r"(?<=[\u3400-\u9fff])\s+(?=[\u3400-\u9fff])", "", cleaned)


def _parse_code_and_name(value: str, code_min: int, code_max: int) -> Tuple[str, str, float]:
    cleaned = _strip_value_prefix(value)
    bracketed = re.match(
        rf"^[\[【(（]\s*([0-9A-Z]{{{code_min},{code_max}}})\s*[\]】)）]\s*(.+)$",
        cleaned,
        flags=re.IGNORECASE,
    )
    if bracketed:
        return bracketed.group(1).upper(), _clean_name_value(bracketed.group(2)), 1.0

    compact = cleaned.replace(" ", "")
    unbracketed = re.match(
        rf"^([0-9A-Z]{{{code_min},{code_max}}})([\u3400-\u9fff].+)$",
        compact,
        flags=re.IGNORECASE,
    )
    if unbracketed:
        return unbracketed.group(1).upper(), _clean_name_value(unbracketed.group(2)), 0.9

    return "", _clean_name_value(cleaned), 0.75 if cleaned else 0.0


def _parse_group_code(value: str) -> Tuple[str, float]:
    compact = re.sub(r"[^0-9A-Z]", "", _norm_text(value).upper())
    match = re.search(r"([0-9A-Z]{2,4})", compact)
    return (match.group(1), 1.0) if match else ("", 0.0)


def _parse_query_time(value: str) -> Tuple[str, float]:
    match = re.search(
        r"(20\d{2})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?"
        r"(?:\s+|T)?(\d{1,2})?\s*[:：时]?\s*(\d{1,2})?\s*[:：分]?\s*(\d{1,2})?",
        _norm_text(value),
    )
    if not match:
        return "", 0.0
    year, month, day, hour, minute, second = match.groups()
    if hour is None:
        return f"{year}-{int(month):02d}-{int(day):02d}", 0.9
    return (
        f"{year}-{int(month):02d}-{int(day):02d} "
        f"{int(hour):02d}:{int(minute or 0):02d}:{int(second or 0):02d}",
        1.0,
    )


def parse_admission_result_ocr(
    ocr_pages: Sequence[Sequence[Tuple[Any, str, float]]],
    expected_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Parse safe, structured admission fields from one or more OCR pages."""
    items = _to_items(ocr_pages)
    values: Dict[str, str] = {field: "" for field in ADMISSION_RESULT_FIELDS}
    field_confidences: Dict[str, float] = {field: 0.0 for field in ADMISSION_RESULT_FIELDS}
    warnings: List[str] = []

    extracted: Dict[str, Tuple[str, float, bool]] = {
        field: _extract_labelled_value(items, aliases)
        for field, aliases in _LABELS.items()
    }

    for field in ("batchName", "examType", "levelName"):
        raw, confidence, conflicted = extracted[field]
        if field == "examType":
            match = re.search(r"(物理类|历史类|文科|理科|综合改革)", raw)
            parsed = match.group(1) if match else _clean_plain_value(raw, 30)
        elif field == "levelName":
            match = re.search(r"(本科|专科|高职(?:专科)?)", raw)
            parsed = match.group(1) if match else _clean_plain_value(raw, 30)
        else:
            parsed = _clean_plain_value(raw, 100).replace(" ", "")
        values[field] = parsed
        field_confidences[field] = confidence if parsed else 0.0
        if conflicted:
            warnings.append(f"{_WARNING_FIELD_NAMES[field]}存在多个候选值，请核对")

    university_raw, university_confidence, university_conflicted = extracted["university"]
    university_code, university_name, university_parse_factor = _parse_code_and_name(
        university_raw,
        4,
        6,
    )
    values["universityCode"] = university_code
    values["universityName"] = university_name
    field_confidences["universityCode"] = university_confidence * university_parse_factor if university_code else 0.0
    field_confidences["universityName"] = university_confidence * university_parse_factor if university_name else 0.0
    if university_conflicted:
        warnings.append("录取院校存在多个候选值，请核对")
    if university_code and not university_code.isdigit():
        warnings.append("院校代码含字母，可能存在 OCR 误识别")

    group_raw, group_confidence, group_conflicted = extracted["groupCode"]
    group_code, group_parse_factor = _parse_group_code(group_raw)
    values["groupCode"] = group_code
    field_confidences["groupCode"] = group_confidence * group_parse_factor if group_code else 0.0
    if group_conflicted:
        warnings.append("专业组号存在多个候选值，请核对")

    major_raw, major_confidence, major_conflicted = extracted["major"]
    major_code, major_name, major_parse_factor = _parse_code_and_name(major_raw, 1, 3)
    values["majorCode"] = major_code
    values["majorName"] = major_name
    field_confidences["majorCode"] = major_confidence * major_parse_factor if major_code else 0.0
    field_confidences["majorName"] = major_confidence * major_parse_factor if major_name else 0.0
    if major_conflicted:
        warnings.append("录取专业存在多个候选值，请核对")

    query_raw, query_confidence, query_conflicted = extracted["queryTime"]
    query_time, query_parse_factor = _parse_query_time(query_raw)
    values["queryTime"] = query_time
    field_confidences["queryTime"] = query_confidence * query_parse_factor if query_time else 0.0
    if query_conflicted:
        warnings.append("查询时间存在多个候选值，请核对")

    missing_messages = {
        "batchName": "未识别到录取批次",
        "universityCode": "未识别到院校代码",
        "universityName": "未识别到院校名称",
        "groupCode": "未识别到专业组号",
        "majorCode": "未识别到专业代码",
        "majorName": "未识别到专业名称",
    }
    for field, message in missing_messages.items():
        if not values[field]:
            warnings.append(message)

    critical_fields = tuple(missing_messages)
    overall_confidence = sum(field_confidences[field] for field in critical_fields) / len(critical_fields)

    # Keep warning order deterministic and avoid duplicate messages without ever
    # including candidate values or raw OCR text.
    unique_warnings = list(dict.fromkeys(warnings))
    return {
        **values,
        "identityMatch": _match_expected_name(items, expected_name),
        "confidence": round(_clamp_confidence(overall_confidence), 4),
        "fieldConfidences": {
            field: round(_clamp_confidence(field_confidences[field]), 4)
            for field in ADMISSION_RESULT_FIELDS
        },
        "warnings": unique_warnings,
        "source": "ocr",
    }
