# -*- coding: utf-8 -*-
"""Tests for JSON Schema definitions in three_layer.schemas."""
import json
from pathlib import Path

import pytest
import jsonschema

from three_layer.schemas import (
    BATCH_TREE_SCHEMA,
    SCHOOL_REGISTRY_SCHEMA,
    ENROLLMENT_MAJOR_SCHEMA,
    YEARLY_DATA_SCHEMA,
)


def test_batch_tree_schema_validates_real_tree():
    """batch_tree_2025.json should pass validation."""
    path = Path(__file__).resolve().parents[2] / "three_layer_output" / "batch_tree_2025.json"
    with open(path, "r", encoding="utf-8") as f:
        tree = json.load(f)
    jsonschema.validate(tree, BATCH_TREE_SCHEMA)


def test_batch_tree_rejects_bad_year():
    bad = {"year": "not_int", "province": "四川", "tree": []}
    with pytest.raises(jsonschema.ValidationError):
        jsonschema.validate(bad, BATCH_TREE_SCHEMA)


def test_school_registry_validates_sample():
    sample = {
        "meta": {"count": 1, "source": "test", "year": 2025},
        "schools": {
            "0001": {
                "name": "北京大学",
                "location": {"province": "北京"},
                "basic": {"type": "综合"},
            }
        },
    }
    jsonschema.validate(sample, SCHOOL_REGISTRY_SCHEMA)


def test_yearly_without_supplementary():
    jsonschema.validate(
        {"plan": 3, "enrolled": 2, "min": 690, "minRank": 80},
        YEARLY_DATA_SCHEMA,
    )


def test_yearly_with_supplementary():
    sample = {
        "plan": 3,
        "supplementary": [
            {"round": 2, "plan": 5, "enrolled": 4, "min": 620, "minRank": 5800}
        ],
    }
    jsonschema.validate(sample, YEARLY_DATA_SCHEMA)


def test_supplementary_round_not_sequential():
    """round value need not be 1-based sequential — any int ≥1 is valid."""
    sample = {"plan": 3, "supplementary": [{"round": 3, "plan": 2}]}
    jsonschema.validate(sample, YEARLY_DATA_SCHEMA)


def test_enrollment_major():
    sample = {
        "code": "01",
        "name": "数学类",
        "category": "数学类",
        "discipline": "理学",
        "yearly": {
            "2025": {"plan": 3},
            "2024": {"plan": 2, "enrolled": 2, "min": 690, "minRank": 80},
        },
    }
    jsonschema.validate(sample, ENROLLMENT_MAJOR_SCHEMA)
