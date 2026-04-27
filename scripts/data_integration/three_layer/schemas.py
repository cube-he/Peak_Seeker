# -*- coding: utf-8 -*-
"""JSON Schema definitions for the three-layer data model.

Layers:
  1. BATCH_TREE_SCHEMA      — batch_tree_2025.json (批次树)
  2. SCHOOL_REGISTRY_SCHEMA — school_registry.json (学校注册表)
  3. ENROLLMENT_MAJOR_SCHEMA — per-major enrollment data (录取专业数据)

Helper schemas (referenced inline):
  SUPPLEMENTARY_ROUND_SCHEMA — one round of 征集志愿
  YEARLY_DATA_SCHEMA         — one year of score/enrollment data
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Layer 3 helpers: supplementary round & yearly data
# ---------------------------------------------------------------------------

SUPPLEMENTARY_ROUND_SCHEMA: dict = {
    "type": "object",
    "required": ["round", "plan"],
    "properties": {
        "round":   {"type": "integer", "minimum": 1},
        "plan":    {"type": "integer", "minimum": 0},
        "enrolled": {"type": ["integer", "null"]},
        "min":      {"type": ["integer", "null"]},
        "minRank":  {"type": ["integer", "null"]},
        "avg":      {"type": ["number", "null"]},
        "avgRank":  {"type": ["integer", "null"]},
        "max":      {"type": ["integer", "null"]},
        "maxRank":  {"type": ["integer", "null"]},
    },
    "additionalProperties": False,
}

YEARLY_DATA_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "plan":     {"type": ["integer", "null"]},
        "enrolled": {"type": ["integer", "null"]},
        "min":      {"type": ["integer", "null"]},
        "minRank":  {"type": ["integer", "null"]},
        "avg":      {"type": ["number", "null"]},
        "avgRank":  {"type": ["integer", "null"]},
        "max":      {"type": ["integer", "null"]},
        "maxRank":  {"type": ["integer", "null"]},
        "supplementary": {
            "type": "array",
            "items": SUPPLEMENTARY_ROUND_SCHEMA,
        },
    },
    "additionalProperties": False,
}

# ---------------------------------------------------------------------------
# Layer 3: enrollment major
# ---------------------------------------------------------------------------

ENROLLMENT_MAJOR_SCHEMA: dict = {
    "type": "object",
    "required": ["code", "name", "category", "discipline", "yearly"],
    "properties": {
        "code":       {"type": "string"},
        "name":       {"type": "string"},
        "category":   {"type": ["string", "null"]},
        "discipline": {"type": ["string", "null"]},
        "yearly": {
            "type": "object",
            # keys are year strings (e.g. "2025"), values match YEARLY_DATA_SCHEMA
            "additionalProperties": YEARLY_DATA_SCHEMA,
        },
        # optional enrichment fields
        "fullName":   {"type": ["string", "null"]},
        "majorNote":  {"type": ["string", "null"]},
        "isNew":      {"type": ["boolean", "null"]},
        "duration":   {"type": ["integer", "string", "null"]},
        "tuition":    {"type": ["integer", "number", "null"]},
        "oldBatch":   {"type": ["string", "null"]},
        "oldBatch2":  {"type": ["string", "null"]},
        "quality":    {"type": "object"},
    },
    "additionalProperties": False,
}

# ---------------------------------------------------------------------------
# Layer 1: batch tree (recursive via $defs)
# ---------------------------------------------------------------------------

# volunteerSettings and volunteer object — same shape, two field names in use
_VOLUNTEER_OBJECT = {
    "type": "object",
    "properties": {
        "mode":  {"type": "string"},
        "count": {"type": "integer"},
        "desc":  {"type": "string"},
    },
    "additionalProperties": True,
}

BATCH_TREE_SCHEMA: dict = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "required": ["year", "province", "tree"],
    "properties": {
        "year":          {"type": "integer"},
        "province":      {"type": "string"},
        "examReform":    {"type": "string"},
        "volunteerUnit": {"type": "string"},
        "source":        {"type": "string"},
        "scope":         {"type": "array", "items": {"type": "string"}},
        "tree": {
            "type": "array",
            "items": {"$ref": "#/$defs/batchNode"},
        },
    },
    "additionalProperties": False,
    # Recursive batch node definition
    "$defs": {
        "batchNode": {
            "type": "object",
            "required": ["id", "name"],
            "properties": {
                "id":             {"type": "string"},
                "name":           {"type": "string"},
                "order":          {"type": "integer"},
                "enrollmentType": {"type": "string"},
                "subjects":       {"type": "array", "items": {"type": "string"}},
                "dataStatus":     {"type": "string", "enum": ["has_data", "no_data"]},
                # Both field names appear in the actual data
                "volunteerSettings": _VOLUNTEER_OBJECT,
                "volunteer":         _VOLUNTEER_OBJECT,
                "children": {
                    "type": "array",
                    "items": {"$ref": "#/$defs/batchNode"},
                },
            },
            "additionalProperties": False,
        }
    },
}

# ---------------------------------------------------------------------------
# Layer 2: school registry
# ---------------------------------------------------------------------------

SCHOOL_REGISTRY_SCHEMA: dict = {
    "type": "object",
    "required": ["meta", "schools"],
    "properties": {
        "meta": {
            "type": "object",
            "required": ["count", "source", "year"],
            "properties": {
                "count":  {"type": "integer"},
                "source": {"type": "string"},
                "year":   {"type": "integer"},
            },
            "additionalProperties": True,
        },
        "schools": {
            "type": "object",
            # Each key is a school code (string); value must have name/location/basic
            "additionalProperties": {
                "type": "object",
                "required": ["name", "location", "basic"],
                "properties": {
                    "name":     {"type": "string"},
                    "location": {"type": "object"},
                    "basic":    {"type": "object"},
                },
                "additionalProperties": True,
            },
        },
    },
    "additionalProperties": False,
}
