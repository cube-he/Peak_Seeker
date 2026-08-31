import json
import unittest

from admission_result_parser import (
    MAX_ADMISSION_UPLOAD_BYTES,
    detect_supported_upload_suffix,
    parse_admission_result_ocr,
)


def ocr_item(x, y, text, confidence=0.98, width=None, height=28):
    width = width if width is not None else max(30, len(text) * 24)
    return (
        [[x, y], [x + width, y], [x + width, y + height], [x, y + height]],
        text,
        confidence,
    )


class AdmissionResultParserTest(unittest.TestCase):
    def test_parses_sichuan_admission_result_and_drops_identity_text(self):
        page = [
            ocr_item(120, 90, "姓名"),
            ocr_item(430, 90, "测试学生"),
            ocr_item(120, 130, "考生号"),
            ocr_item(430, 130, "12345678901234"),
            ocr_item(120, 170, "证件号码"),
            ocr_item(430, 170, "510000200001010000"),
            ocr_item(120, 230, "批次名称"),
            ocr_item(430, 230, "本科批次B段", 0.99),
            ocr_item(120, 270, "科类名称"),
            ocr_item(430, 270, "物理类"),
            ocr_item(120, 310, "层次名称"),
            ocr_item(430, 310, "本科"),
            ocr_item(120, 350, "院校名称"),
            ocr_item(430, 350, "[5122]", 0.97, width=105),
            ocr_item(545, 350, "西华师范大学", 0.98, width=180),
            ocr_item(120, 390, "专业组号"),
            ocr_item(430, 390, "105"),
            ocr_item(120, 430, "专业名称"),
            ocr_item(430, 430, "[32]数学与应用数学", 0.96, width=260),
            ocr_item(120, 500, "查询时间"),
            ocr_item(430, 500, "2026-07-28 13:53:53", 0.95, width=300),
        ]

        result = parse_admission_result_ocr([page])

        self.assertEqual(result["batchName"], "本科批次B段")
        self.assertEqual(result["examType"], "物理类")
        self.assertEqual(result["levelName"], "本科")
        self.assertEqual(result["universityCode"], "5122")
        self.assertEqual(result["universityName"], "西华师范大学")
        self.assertEqual(result["groupCode"], "105")
        self.assertEqual(result["majorCode"], "32")
        self.assertEqual(result["majorName"], "数学与应用数学")
        self.assertEqual(result["queryTime"], "2026-07-28 13:53:53")
        self.assertIsNone(result["identityMatch"])
        self.assertGreater(result["confidence"], 0.9)
        self.assertEqual(result["source"], "ocr")

        serialized = json.dumps(result, ensure_ascii=False)
        self.assertNotIn("测试学生", serialized)
        self.assertNotIn("12345678901234", serialized)
        self.assertNotIn("510000200001010000", serialized)
        self.assertNotIn("raw", serialized.lower())

        matched = parse_admission_result_ocr([page], expected_name="测试学生")
        mismatched = parse_admission_result_ocr([page], expected_name="另一学生")
        self.assertIs(matched["identityMatch"], True)
        self.assertIs(mismatched["identityMatch"], False)
        self.assertNotIn("测试学生", json.dumps(matched, ensure_ascii=False))
        self.assertNotIn("另一学生", json.dumps(mismatched, ensure_ascii=False))

    def test_supports_inline_labels_and_full_width_brackets(self):
        page = [
            ocr_item(100, 100, "批次名称：本科批次B段"),
            ocr_item(100, 140, "科类名称: 物理类"),
            ocr_item(100, 180, "层次名称：本科"),
            ocr_item(100, 220, "院校名称：【 5122 】西 华 师 范 大 学"),
            ocr_item(100, 260, "专业组号：1A5"),
            ocr_item(100, 300, "专业名称：［ 0G ］数 学 与 应 用 数 学"),
            ocr_item(100, 340, "查询时间：2026年7月28日 13时53分53秒"),
        ]

        result = parse_admission_result_ocr([page])

        self.assertEqual(result["universityCode"], "5122")
        self.assertEqual(result["universityName"], "西华师范大学")
        self.assertEqual(result["groupCode"], "1A5")
        self.assertEqual(result["majorCode"], "0G")
        self.assertEqual(result["majorName"], "数学与应用数学")
        self.assertEqual(result["queryTime"], "2026-07-28 13:53:53")

    def test_missing_group_is_partial_result_with_safe_warning(self):
        page = [
            ocr_item(100, 100, "批次名称：本科批次B段"),
            ocr_item(100, 140, "院校名称：[5122]西华师范大学"),
            ocr_item(100, 180, "专业名称：[32]数学与应用数学"),
        ]

        result = parse_admission_result_ocr([page])

        self.assertEqual(result["groupCode"], "")
        self.assertEqual(result["fieldConfidences"]["groupCode"], 0.0)
        self.assertIn("未识别到专业组号", result["warnings"])
        self.assertLess(result["confidence"], 1.0)

    def test_missing_row_value_does_not_borrow_the_next_rows_value(self):
        page = [
            ocr_item(100, 100, "批次名称"),
            ocr_item(100, 140, "科类名称"),
            ocr_item(430, 140, "物理类"),
            ocr_item(100, 180, "院校名称"),
            ocr_item(430, 180, "[5122]西华师范大学"),
        ]

        result = parse_admission_result_ocr([page])

        self.assertEqual(result["batchName"], "")
        self.assertEqual(result["examType"], "物理类")

    def test_missing_value_does_not_borrow_sensitive_rows_value(self):
        page = [
            # Vertically arranged cells reproduce the dangerous case: without
            # a row-label barrier, the missing university value could become 张三.
            ocr_item(100, 100, "院校名称"),
            ocr_item(100, 135, "姓名"),
            ocr_item(100, 170, "张三"),
            ocr_item(100, 205, "考生号"),
            ocr_item(100, 240, "12345678901234"),
        ]

        result = parse_admission_result_ocr([page], expected_name="张三")

        self.assertEqual(result["universityName"], "")
        self.assertEqual(result["universityCode"], "")
        # Names are only accepted inline/on the same row, never from a later row.
        self.assertIsNone(result["identityMatch"])
        serialized = json.dumps(result, ensure_ascii=False)
        self.assertNotIn("张三", serialized)
        self.assertNotIn("12345678901234", serialized)

        # Even if OCR gives the empty source label an unusually tall box, its
        # right-side tolerance must not absorb the next identity row's value.
        overlapping_page = [
            ocr_item(100, 100, "院校名称", height=60),
            ocr_item(100, 145, "姓名"),
            ocr_item(430, 145, "张三"),
        ]
        overlapping_result = parse_admission_result_ocr([overlapping_page])
        self.assertEqual(overlapping_result["universityName"], "")
        self.assertNotIn("张三", json.dumps(overlapping_result, ensure_ascii=False))

    def test_identity_match_is_exact_and_handles_spaced_ocr_name(self):
        page = [
            ocr_item(100, 100, "姓名"),
            ocr_item(430, 100, "袁 嘉"),
            ocr_item(100, 140, "院校名称"),
            ocr_item(430, 140, "[5122]西华师范大学"),
        ]

        matched = parse_admission_result_ocr([page], expected_name="袁嘉")
        mismatched = parse_admission_result_ocr([page], expected_name="袁佳")

        self.assertIs(matched["identityMatch"], True)
        self.assertIs(mismatched["identityMatch"], False)
        self.assertNotIn("袁嘉", json.dumps(matched, ensure_ascii=False))

        low_confidence_page = [
            ocr_item(100, 100, "考生姓名", confidence=0.4),
            ocr_item(430, 100, "袁嘉", confidence=0.4),
        ]
        uncertain = parse_admission_result_ocr(
            [low_confidence_page],
            expected_name="袁嘉",
        )
        self.assertIsNone(uncertain["identityMatch"])

    def test_magic_header_detection_and_size_constant(self):
        self.assertEqual(MAX_ADMISSION_UPLOAD_BYTES, 20 * 1024 * 1024)
        self.assertEqual(detect_supported_upload_suffix(b"%PDF-1.7\n"), ".pdf")
        self.assertEqual(detect_supported_upload_suffix(b"\xff\xd8\xff\xe0data"), ".jpg")
        self.assertEqual(detect_supported_upload_suffix(b"\x89PNG\r\n\x1a\ndata"), ".png")
        self.assertEqual(detect_supported_upload_suffix(b"RIFF\x00\x00\x00\x00WEBPdata"), ".webp")
        self.assertIsNone(detect_supported_upload_suffix(b"not an image or pdf"))


if __name__ == "__main__":
    unittest.main()
