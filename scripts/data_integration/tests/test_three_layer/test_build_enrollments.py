# -*- coding: utf-8 -*-
"""Tests for enrollment tree builder."""
import json
import pytest
from pathlib import Path
from three_layer.build_enrollments import build_enrollments


@pytest.fixture(scope="module")
def enrollments():
    return build_enrollments()


def test_structure_has_meta(enrollments):
    assert enrollments["meta"]["batchTreeRef"] == "batch_tree_2025.json"
    assert enrollments["meta"]["schoolRegistryRef"] == "school_registry.json"
    assert enrollments["meta"]["totalRecords"] > 15000


def test_schools_present(enrollments):
    assert "0001" in enrollments["data"]  # 北京大学
    assert "0003" in enrollments["data"]  # 清华大学


def test_subject_keys(enrollments):
    pku = enrollments["data"]["0001"]
    subjects = set(pku.keys())
    assert "物理" in subjects or "历史" in subjects


def test_enrollment_node_structure(enrollments):
    pku = enrollments["data"]["0001"]
    for subj, enrolls in pku.items():
        for e in enrolls:
            assert "batchNodeId" in e
            assert "enrollmentType" in e
            assert "groups" in e
            for g in e["groups"]:
                assert "groupCode" in g or g.get("groupCode") is None
                assert "majors" in g
                for m in g["majors"]:
                    assert "code" in m
                    assert "name" in m
                    assert "yearly" in m
                    assert "2025" in m["yearly"]
                    assert "plan" in m["yearly"]["2025"]


def test_no_empty_schools(enrollments):
    for code, subjs in enrollments["data"].items():
        for subj, enrolls in subjs.items():
            assert len(enrolls) > 0, f"School {code}/{subj} has empty enrollments"
