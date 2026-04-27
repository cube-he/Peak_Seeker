# -*- coding: utf-8 -*-
"""Tests for 01 plan data parsing."""
import pytest
from three_layer.parse_01_plans import (
    parse_normal_plans, parse_early_plans, parse_title_path,
    PlanRecord,
)


def test_parse_title_path_history():
    result = parse_title_path("一、历史类>(一)本科提前批次>1.国家专项计划")
    assert result["subject"] == "历史"
    assert result["batch_level_1"] == "本科提前批次"
    assert result["batch_level_2"] == "国家专项计划"


def test_parse_title_path_physics_a():
    result = parse_title_path("二、物理类>(一)本科提前批次>2.A段>(1)军事类")
    assert result["subject"] == "物理"
    assert result["batch_level_1"] == "本科提前批次"
    assert result["batch_level_2"] == "A段"
    assert result["batch_level_3"] == "军事类"


def test_parse_normal_plans():
    records = parse_normal_plans()
    assert len(records) > 5000
    # Each record should have required fields
    r = records[0]
    assert isinstance(r, PlanRecord)
    assert r.school_code
    assert r.subject in ("物理", "历史")
    assert r.batch_node_id
    assert r.major_code
    assert r.plan_num is not None


def test_parse_early_plans():
    records = parse_early_plans()
    # 11273 total M-type records, but only 历史/物理 subjects are parsed (~3220)
    assert len(records) > 3000
    r = records[0]
    assert isinstance(r, PlanRecord)
    assert r.school_code
    assert r.enrollment_type


def test_no_unmapped_batches():
    """All returned records must have a resolved batch_node_id (unmapped are skipped)."""
    normal = parse_normal_plans()
    early = parse_early_plans()
    unmapped = [r for r in normal + early if r.batch_node_id is None]
    assert len(unmapped) == 0, f"{len(unmapped)} unmapped batches"
