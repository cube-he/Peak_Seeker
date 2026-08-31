import os
import tempfile
import time
import unittest
from types import SimpleNamespace
from unittest.mock import patch

import main


class _FakeReceiveConnection:
    def __init__(self):
        self.closed = False

    def poll(self, _timeout):
        return False

    def close(self):
        self.closed = True


class _FakeSendConnection:
    def __init__(self):
        self.closed = False

    def close(self):
        self.closed = True


class _FakeProcess:
    def __init__(self):
        self.alive = True
        self.started = False
        self.terminated = False
        self.killed = False
        self.closed = False

    def start(self):
        self.started = True

    def is_alive(self):
        return self.alive

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True
        self.alive = False

    def join(self, timeout=None):
        del timeout

    def close(self):
        self.closed = True


class _FakeMultiprocessingContext:
    def __init__(self):
        self.receive = _FakeReceiveConnection()
        self.send = _FakeSendConnection()
        self.process = _FakeProcess()
        self.process_kwargs = None

    def Pipe(self, duplex=False):
        self.duplex = duplex
        return self.receive, self.send

    def Process(self, **kwargs):
        self.process_kwargs = kwargs
        return self.process


class OcrUploadSafetyTest(unittest.TestCase):
    @unittest.skipUnless(
        os.environ.get("OCR_SPAWN_SMOKE_PDF"),
        "set OCR_SPAWN_SMOKE_PDF for the production-runtime smoke test",
    )
    def test_real_spawned_worker_smoke(self):
        result = main._run_ocr_job_in_process(
            "volunteer",
            (os.environ["OCR_SPAWN_SMOKE_PDF"],),
            timeout_seconds=main.OCR_JOB_TIMEOUT_SECONDS,
        )

        self.assertEqual(result.get("source"), "ocr")
        self.assertIsInstance(result.get("volunteers"), list)

    def test_pdf_page_limit_is_checked_before_render(self):
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as source:
            source.write(b"%PDF-1.7\n")
            pdf_path = source.name
        try:
            with patch.object(
                main.subprocess,
                "run",
                return_value=SimpleNamespace(stdout=b"Pages:          21\n", stderr=b""),
            ):
                with self.assertRaisesRegex(ValueError, "不能超过 20 页"):
                    main._pdf_page_count(pdf_path, 20)
        finally:
            os.unlink(pdf_path)

    def test_render_is_bounded_to_reported_pages_and_3000_pixels(self):
        with tempfile.TemporaryDirectory() as work_dir:
            pdf_path = os.path.join(work_dir, "input.pdf")
            with open(pdf_path, "wb") as source:
                source.write(b"%PDF-1.7\n")
            commands = []

            def fake_run(command, **kwargs):
                commands.append((command, kwargs))
                if command[0] == "pdfinfo":
                    return SimpleNamespace(stdout=b"Pages: 2\n", stderr=b"")
                prefix = command[-1]
                for page in (1, 2):
                    with open(f"{prefix}-{page}.png", "wb") as image:
                        image.write(b"png")
                return SimpleNamespace(stdout=b"", stderr=b"")

            with patch.object(main.subprocess, "run", side_effect=fake_run):
                pages = main._render_pdf_pages(
                    pdf_path,
                    work_dir,
                    max_pages=20,
                    max_dimension=3000,
                )

            render_command, render_kwargs = commands[1]
            self.assertEqual([os.path.basename(path) for path in pages], ["volunteer-page-1.png", "volunteer-page-2.png"])
            self.assertEqual(render_command[render_command.index("-l") + 1], "2")
            self.assertEqual(render_command[render_command.index("-scale-to") + 1], "3000")
            self.assertEqual(render_kwargs["timeout"], main.PDF_RENDER_TIMEOUT_SECONDS)

    def test_native_ocr_timeout_terminates_then_kills_isolated_process(self):
        context = _FakeMultiprocessingContext()
        with patch.object(main.multiprocessing, "get_context", return_value=context):
            with self.assertRaises(main.OcrJobTimeoutError):
                main._run_ocr_job_in_process("volunteer", ("ignored.pdf", ""), timeout_seconds=1)

        self.assertTrue(context.process.started)
        self.assertTrue(context.process.terminated)
        self.assertTrue(context.process.killed)
        self.assertTrue(context.process.closed)
        self.assertTrue(context.receive.closed)
        self.assertTrue(context.send.closed)
        self.assertEqual(context.process_kwargs["daemon"], True)

    def test_incomplete_or_ambiguous_major_slots_are_review_only(self):
        incomplete = main._parse_major_list("32数学与应用数学;33物理学")
        seven_entries = main._parse_major_list(
            "31专业一;32专业二;33专业三;34专业四;35专业五;36专业六;37专业七"
        )

        self.assertEqual([major.originalOrder for major in incomplete], [0, 0])
        self.assertEqual([major.originalOrder for major in seven_entries], [0, 0, 0, 0, 0, 0])

    def test_exactly_six_complete_unique_slots_keep_original_order(self):
        majors = main._parse_major_list(
            "31专业一;32专业二;33专业三;34专业四;35专业五;36专业六"
        )

        self.assertEqual([major.originalOrder for major in majors], [1, 2, 3, 4, 5, 6])

    def test_volunteer_ocr_is_local_even_when_generic_engine_is_baidu(self):
        local_result = [
            (
                [[0, 0], [10, 0], [10, 10], [0, 10]],
                "本科批次B段",
                0.99,
            )
        ]
        with patch.object(main, "OCR_ENGINE", "baidu"):
            with patch.object(
                main,
                "run_sensitive_local_ocr",
                return_value=local_result,
            ) as local_ocr:
                with patch.object(main, "run_ocr_with_engine") as configurable_ocr:
                    with patch.object(main, "run_baidu_ocr") as cloud_ocr:
                        items = main._collect_volunteer_ocr_items(["sensitive.png"])

        self.assertEqual(len(items), 1)
        local_ocr.assert_called_once_with("sensitive.png")
        configurable_ocr.assert_not_called()
        cloud_ocr.assert_not_called()

    def test_scale_to_3000_coordinates_are_normalized_before_layout_parse(self):
        # Production pdftoppm renders the same A4 form at roughly 2122 x 3000,
        # while the layout parser's column thresholds use the 1489 x 2105
        # reference coordinate system.
        from PIL import Image

        width, height = 2122, 3000
        x_scale = width / main.VOLUNTEER_LAYOUT_REFERENCE_WIDTH
        y_scale = height / main.VOLUNTEER_LAYOUT_REFERENCE_HEIGHT

        def box(x1, y1, x2, y2):
            return [
                [x1 * x_scale, y1 * y_scale],
                [x2 * x_scale, y1 * y_scale],
                [x2 * x_scale, y2 * y_scale],
                [x1 * x_scale, y2 * y_scale],
            ]

        local_result = [
            (box(10, 100, 160, 125), "第一志愿18", 0.99),
            (box(200, 115, 470, 140), "5122西华师范大学", 0.99),
            (box(500, 115, 550, 140), "105", 0.99),
            (
                box(600, 100, 1300, 125),
                "31数学与应用数学;32物理学;33汉语言文学;34计算机科学与技术;35英语;36教育学",
                0.99,
            ),
            (box(1390, 115, 1450, 140), "是", 0.99),
        ]

        with tempfile.TemporaryDirectory() as work_dir:
            image_path = os.path.join(work_dir, "scaled.png")
            Image.new("RGB", (width, height), "white").save(image_path)
            with patch.object(main, "run_sensitive_local_ocr", return_value=local_result):
                items = main._collect_volunteer_ocr_items([image_path])

        volunteers = main._parse_ocr_volunteer_rows(items)
        self.assertEqual(len(volunteers), 1)
        self.assertEqual(volunteers[0].seq, 18)
        self.assertEqual(volunteers[0].schoolCode, "5122")
        self.assertEqual(volunteers[0].groupCode, "105")
        self.assertEqual([major.originalOrder for major in volunteers[0].majors], [1, 2, 3, 4, 5, 6])

    def test_low_confidence_sequence_marker_cannot_lock_a_volunteer_order(self):
        items = self._volunteer_row_items(marker_confidence=0.60)

        self.assertEqual(main._parse_ocr_volunteer_rows(items), [])

    def test_low_confidence_identity_and_batch_are_not_used_for_auto_confirmation(self):
        items = [
            {"text": "考生姓名：测试", "confidence": 0.60},
            {"text": "本科批次B段", "confidence": 0.60},
            {"text": "选科组合：物理化学生物", "confidence": 0.60},
        ]

        self.assertEqual(main._parse_volunteer_identity(items).name, "")
        self.assertEqual(main._parse_volunteer_batch(items), "")
        self.assertEqual(main._parse_volunteer_exam_type(items), "")

    def test_low_confidence_major_column_keeps_group_but_invalidates_all_slots(self):
        items = self._volunteer_row_items(major_confidence=0.60)

        volunteers = main._parse_ocr_volunteer_rows(items)

        self.assertEqual(len(volunteers), 1)
        self.assertEqual(volunteers[0].seq, 18)
        self.assertEqual(volunteers[0].schoolCode, "5122")
        self.assertEqual(volunteers[0].groupCode, "105")
        self.assertEqual(
            [major.originalOrder for major in volunteers[0].majors],
            [0, 0, 0, 0, 0, 0],
        )

    @staticmethod
    def _volunteer_row_items(
        marker_confidence=0.99,
        major_confidence=0.99,
    ):
        def item(x1, x2, text, confidence):
            return {
                "page": 1,
                "x1": x1,
                "y1": 100,
                "x2": x2,
                "y2": 125,
                "xc": (x1 + x2) / 2,
                "yc": 112.5,
                "text": text,
                "confidence": confidence,
            }

        return [
            item(10, 160, "第一志愿18", marker_confidence),
            item(200, 470, "5122西华师范大学", 0.99),
            item(500, 550, "105", 0.99),
            item(
                600,
                1300,
                "31专业一;32专业二;33专业三;34专业四;35专业五;36专业六",
                major_confidence,
            ),
            item(1390, 1450, "是", 0.99),
        ]


class OcrSupervisorSafetyTest(unittest.IsolatedAsyncioTestCase):
    async def test_volunteer_endpoint_rejects_explicit_cloud_engine_before_reading(self):
        class NeverReadUpload:
            async def read(self, *_args, **_kwargs):
                raise AssertionError("upload must not be read")

        with self.assertRaises(main.HTTPException) as raised:
            await main.parse_volunteer_form(NeverReadUpload(), engine="baidu")

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("本地 OCR", raised.exception.detail)

    async def test_supervisor_timeout_requests_pm2_recovery(self):
        with patch.object(main, "OCR_SUPERVISOR_TIMEOUT_SECONDS", 0.001):
            with patch.object(
                main,
                "_run_ocr_job_in_process",
                side_effect=lambda *_args: time.sleep(0.1),
            ):
                with patch.object(main, "_schedule_ocr_service_restart") as restart:
                    with self.assertRaises(main.OcrJobTimeoutError):
                        await main._run_ocr_job_with_supervisor("volunteer", ("ignored.pdf", ""))

        restart.assert_called_once_with()


if __name__ == "__main__":
    unittest.main()
