# -*- coding: utf-8 -*-
import csv
from pathlib import Path
import pytest
from three_layer.conflict_reporter import ConflictReporter, ConflictRecord


@pytest.fixture
def reporter(tmp_path):
    return ConflictReporter(output_dir=tmp_path)


def test_add_value_conflict(reporter):
    reporter.add_conflict(ConflictRecord(
        school_code="0001", school_name="北京大学",
        subject="物理", batch="本科批B段",
        major_code="01", major_name="数学类",
        field_name="min", current_value="690", new_value="692",
        source="H", match_type="exact", confidence=1.0,
        diff_type="numeric_small",
    ))
    assert reporter.count == 1


def test_write_csv(reporter, tmp_path):
    reporter.add_conflict(ConflictRecord(
        school_code="0001", school_name="北京大学",
        subject="物理", batch="本科批B段",
        major_code="01", major_name="数学类",
        field_name="min", current_value="690", new_value="692",
        source="H", match_type="exact", confidence=1.0,
        diff_type="numeric_small",
    ))
    path = reporter.write()
    assert path.exists()
    with open(path, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    assert len(rows) == 1
    assert rows[0]["school_code"] == "0001"
    assert rows[0]["field_name"] == "min"


def test_summary_stats(reporter):
    for i in range(5):
        reporter.add_conflict(ConflictRecord(
            school_code=f"000{i}", school_name="Test",
            subject="物理", batch="test", major_code="01", major_name="Test",
            field_name="min", current_value="1", new_value="2",
            source="A", match_type="exact", confidence=1.0,
            diff_type="numeric_small",
        ))
    stats = reporter.summary()
    assert stats["total"] == 5
    assert "numeric_small" in stats["by_diff_type"]
