# -*- coding: utf-8 -*-
"""Tests for p1_baseline module."""
import json
from pathlib import Path
import pytest
from scripts.data_integration.p1_baseline import (
    scan_file,
    scan_directory,
    count_records,
)


def test_scan_file_returns_metadata(tmp_path):
    f = tmp_path / "sample.txt"
    f.write_text("hello")
    meta = scan_file(f)
    assert meta["path"].endswith("sample.txt")
    assert meta["size_bytes"] == 5
    assert len(meta["sha256"]) == 64
    assert "mtime" in meta


def test_count_records_json_array(tmp_path):
    f = tmp_path / "a.json"
    f.write_text(json.dumps([{"a": 1}, {"a": 2}, {"a": 3}]), encoding="utf-8")
    assert count_records(f) == 3


def test_count_records_json_object(tmp_path):
    f = tmp_path / "a.json"
    f.write_text(json.dumps({"rows": [{"a": 1}, {"a": 2}]}), encoding="utf-8")
    assert count_records(f) == 1


def test_count_records_unsupported_returns_none(tmp_path):
    f = tmp_path / "a.bin"
    f.write_bytes(b"\x00\x01\x02")
    assert count_records(f) is None


def test_scan_directory_yields_all_files(tmp_path):
    (tmp_path / "a.txt").write_text("a")
    (tmp_path / "sub").mkdir()
    (tmp_path / "sub" / "b.txt").write_text("b")
    results = list(scan_directory(tmp_path))
    assert len(results) == 2
