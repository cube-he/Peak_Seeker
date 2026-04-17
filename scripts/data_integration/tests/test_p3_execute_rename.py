# -*- coding: utf-8 -*-
"""Tests for P3.1 rename plan executor."""
from pathlib import Path

from scripts.data_integration.p3_execute_rename import execute_rename_plan


def test_execute_rename_folder_and_xlsx(tmp_path):
    """Executor renames xlsx inside old folder first, then renames folder itself."""
    old_dir = tmp_path / "专科批次" / "3335_征集志愿_第一次_2023_专科批"
    old_dir.mkdir(parents=True)
    (old_dir / "3335_征集志愿_第一次_2023_mimo.xlsx").write_text("x", encoding="utf-8")
    new_dir = tmp_path / "专科批次" / "3335_2023_文科_专科批_征集志愿_第一次"
    new_xlsx = new_dir / "3335_2023_文科_专科批_征集志愿_第一次_mimo.xlsx"

    plan = [
        {
            "type": "文件夹",
            "old_abs": str(old_dir),
            "new_abs": str(new_dir),
            "note": "",
        },
        {
            "type": "xlsx",
            "old_abs": str(old_dir / "3335_征集志愿_第一次_2023_mimo.xlsx"),
            "new_abs": str(new_xlsx),
            "note": "",
        },
    ]
    log, failures = execute_rename_plan(plan)

    assert new_dir.is_dir()
    assert new_xlsx.is_file()
    assert not old_dir.exists()
    assert failures == []
    assert len(log) == 2
    assert all(entry["status"] == "ok" for entry in log)


def test_execute_rename_idempotent(tmp_path):
    """Already-renamed targets report already_done, no failures."""
    new_dir = tmp_path / "done"
    new_dir.mkdir()
    plan = [
        {
            "type": "文件夹",
            "old_abs": str(tmp_path / "missing_old"),
            "new_abs": str(new_dir),
            "note": "",
        }
    ]
    log, failures = execute_rename_plan(plan)

    assert failures == []
    assert log[0]["status"] == "already_done"


def test_execute_rename_missing_reports_failure(tmp_path):
    """Both old and new missing → failure."""
    plan = [
        {
            "type": "文件夹",
            "old_abs": str(tmp_path / "gone_a"),
            "new_abs": str(tmp_path / "gone_b"),
            "note": "",
        }
    ]
    log, failures = execute_rename_plan(plan)

    assert len(failures) == 1
    assert failures[0]["reason"].startswith("error:missing")


def test_execute_rename_conflict_both_exist(tmp_path):
    """Both old and new exist → conflict, do not overwrite."""
    old_dir = tmp_path / "old"
    old_dir.mkdir()
    new_dir = tmp_path / "new"
    new_dir.mkdir()
    plan = [
        {
            "type": "文件夹",
            "old_abs": str(old_dir),
            "new_abs": str(new_dir),
            "note": "",
        }
    ]
    log, failures = execute_rename_plan(plan)

    assert len(failures) == 1
    assert "conflict" in failures[0]["reason"]
    assert old_dir.exists() and new_dir.exists()


def test_execute_rename_supplementary_treated_like_xlsx(tmp_path):
    """补充数据 entries go through the same xlsx stage-1 rename."""
    old_dir = tmp_path / "本科批次" / "3801_old"
    old_dir.mkdir(parents=True)
    old_supp = old_dir / "supplementary_2025_PaddleOCR-VL-1.5.xlsx"
    old_supp.write_text("x", encoding="utf-8")
    new_dir = tmp_path / "本科批次" / "3801_new"
    new_supp_final = new_dir / "3801_new_补充数据_PaddleOCR-VL-1.5.xlsx"

    plan = [
        {"type": "文件夹", "old_abs": str(old_dir), "new_abs": str(new_dir), "note": ""},
        {"type": "补充数据", "old_abs": str(old_supp), "new_abs": str(new_supp_final), "note": ""},
    ]
    log, failures = execute_rename_plan(plan)

    assert failures == []
    assert new_supp_final.is_file()
    assert new_dir.is_dir()
    assert not old_dir.exists()


def test_execute_rename_xlsx_stage1_renames_basename_only(tmp_path):
    """xlsx stage-1 rename keeps file in OLD parent folder with NEW basename."""
    old_dir = tmp_path / "old_folder"
    old_dir.mkdir()
    old_xlsx = old_dir / "old_name.xlsx"
    old_xlsx.write_text("x", encoding="utf-8")
    new_dir = tmp_path / "new_folder"
    new_xlsx_final = new_dir / "new_name.xlsx"

    plan = [
        {"type": "xlsx", "old_abs": str(old_xlsx), "new_abs": str(new_xlsx_final), "note": ""},
    ]
    log, failures = execute_rename_plan(plan)

    assert failures == []
    # After xlsx stage-1, xlsx sits in OLD folder with NEW basename
    stage1 = old_dir / "new_name.xlsx"
    assert stage1.is_file()
    assert not old_xlsx.exists()
