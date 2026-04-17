# -*- coding: utf-8 -*-
"""Unit tests for lineage module."""
import json
from pathlib import Path
import pytest
from scripts.data_integration.lib.lineage import Lineage


def test_empty_lineage():
    ln = Lineage()
    assert ln.get(("2025", "0001", "01", "A", "本科批B段", "物理"), "最低分") is None


def test_mark_and_get():
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    ln.mark(key, "最低分", "01")
    assert ln.get(key, "最低分") == "01"


def test_mark_overwrites_last():
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    ln.mark(key, "最低分", "03")
    ln.mark(key, "最低分", "manual")
    assert ln.get(key, "最低分") == "manual"


def test_save_load_roundtrip(tmp_path):
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    ln.mark(key, "最低分", "01")
    out = tmp_path / "lineage.json"
    ln.save(out)

    ln2 = Lineage.load(out)
    assert ln2.get(key, "最低分") == "01"


def test_invalid_source_raises():
    ln = Lineage()
    key = ("2025", "0001", "01", "A", "本科批B段", "物理")
    with pytest.raises(ValueError):
        ln.mark(key, "最低分", "unknown_source")
