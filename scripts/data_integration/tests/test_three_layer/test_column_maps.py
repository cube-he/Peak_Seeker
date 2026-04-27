# -*- coding: utf-8 -*-
"""Tests for column mapping definitions."""
import pytest
from three_layer.column_maps import (
    SOURCE_A_MAP, SOURCE_H_MAP, SOURCE_01_SCORE_MAP,
    SOURCE_01_PLAN_MAP, SOURCE_02_SCHOOL_MAP,
    TARGET_ENROLLMENT_FIELDS, TARGET_GROUP_FIELDS,
    TARGET_MAJOR_FIELDS, TARGET_QUALITY_FIELDS,
    TARGET_YEARLY_FIELDS, TARGET_SCHOOL_FIELDS,
    get_source_map, list_sources,
)


def test_source_a_has_all_enrollment_fields():
    """Source A must map at least batchNodeId source column."""
    assert "batchNodeId" in SOURCE_A_MAP


def test_source_a_major_basic_coverage():
    """Source A must cover: code, name, fullName, category, discipline, majorNote, duration, tuition."""
    required = {"code", "name", "fullName", "category", "discipline", "majorNote", "duration", "tuition"}
    mapped = set(SOURCE_A_MAP.keys())
    missing = required - mapped
    assert not missing, f"Source A missing major basic fields: {missing}"


def test_source_01_score_covers_yearly():
    """01/专业分数线 must map all score fields."""
    required = {"min", "minRank", "avg", "avgRank", "max", "enrolled", "plan"}
    mapped = set(SOURCE_01_SCORE_MAP.keys())
    missing = required - mapped
    assert not missing, f"01 score missing: {missing}"


def test_source_02_school_covers_target():
    """02/院校库 must cover basic school fields."""
    required = {"name", "province", "city", "type", "nature", "authority"}
    mapped = set(SOURCE_02_SCHOOL_MAP.keys())
    missing = required - mapped
    assert not missing, f"02 school missing: {missing}"


def test_all_target_fields_have_at_least_one_source():
    """Every target field must be mapped from at least one source (or flagged as uncovered)."""
    from three_layer.column_maps import UNCOVERED_FIELDS, ALL_TARGET_FIELDS
    all_maps = [SOURCE_A_MAP, SOURCE_H_MAP, SOURCE_01_SCORE_MAP, SOURCE_01_PLAN_MAP, SOURCE_02_SCHOOL_MAP]
    covered = set()
    for m in all_maps:
        covered.update(m.keys())
    uncovered = ALL_TARGET_FIELDS - covered - UNCOVERED_FIELDS
    assert not uncovered, f"Fields neither mapped nor flagged as uncovered: {uncovered}"


def test_get_source_map_returns_correct():
    assert get_source_map("A") is SOURCE_A_MAP
    assert get_source_map("01_score") is SOURCE_01_SCORE_MAP


def test_list_sources():
    sources = list_sources()
    assert "A" in sources
    assert "H" in sources
    assert "01_score" in sources
