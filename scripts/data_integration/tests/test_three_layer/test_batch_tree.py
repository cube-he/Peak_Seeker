# -*- coding: utf-8 -*-
"""Unit tests for batch_tree module.

Layer 1: 批次树 — 2025 四川新高考 完整 37 叶节点结构。
"""
import pytest
from three_layer.batch_tree import build_batch_tree


@pytest.fixture(scope="module")
def tree():
    return build_batch_tree()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collect_leaves(nodes: list) -> list[dict]:
    """Recursively collect all leaf nodes (nodes without children)."""
    leaves = []
    for n in nodes:
        if "children" in n and n["children"]:
            leaves.extend(_collect_leaves(n["children"]))
        else:
            leaves.append(n)
    return leaves


def _collect_all_ids(nodes: list) -> list[str]:
    """Recursively collect all node IDs."""
    ids = []
    for n in nodes:
        ids.append(n["id"])
        if "children" in n and n["children"]:
            ids.extend(_collect_all_ids(n["children"]))
    return ids


def _find_node(nodes: list, node_id: str) -> dict | None:
    for n in nodes:
        if n["id"] == node_id:
            return n
        if "children" in n and n["children"]:
            result = _find_node(n["children"], node_id)
            if result is not None:
                return result
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_meta_fields(tree):
    assert tree["year"] == 2025
    assert tree["province"] == "四川"
    assert tree["examReform"] == "新高考"
    assert tree["volunteerUnit"] == "院校专业组"
    assert set(tree["scope"]) == {"物理", "历史"}


def test_top_level_batches(tree):
    top_names = [n["name"] for n in tree["tree"]]
    assert top_names == ["本科提前批次", "本科批次", "高职(专科)提前批次", "高职(专科)批次"]


def test_leaf_count(tree):
    leaves = _collect_leaves(tree["tree"])
    assert len(leaves) == 37, f"Expected 37, got {len(leaves)}: {[l['id'] for l in leaves]}"


def test_all_ids_unique(tree):
    ids = _collect_all_ids(tree["tree"])
    assert len(ids) == len(set(ids)), f"Duplicates: {[x for x in ids if ids.count(x) > 1]}"


def test_leaf_nodes_have_required_fields(tree):
    leaves = _collect_leaves(tree["tree"])
    for leaf in leaves:
        assert "id" in leaf, f"Missing id: {leaf}"
        assert "name" in leaf, f"Missing name: {leaf}"
        assert "subjects" in leaf, f"Missing subjects in {leaf['id']}"
        assert "enrollmentType" in leaf, f"Missing enrollmentType in {leaf['id']}"
        assert "dataStatus" in leaf, f"Missing dataStatus in {leaf['id']}"
        assert leaf["dataStatus"] in ("has_data", "no_data")


def test_has_data_count(tree):
    leaves = _collect_leaves(tree["tree"])
    has_data = [l for l in leaves if l["dataStatus"] == "has_data"]
    no_data = [l for l in leaves if l["dataStatus"] == "no_data"]
    assert len(has_data) == 28, f"Expected 28, got {len(has_data)}: {[l['id'] for l in has_data]}"
    assert len(no_data) == 9, f"Expected 9, got {len(no_data)}: {[l['id'] for l in no_data]}"


def test_physics_only_nodes(tree):
    physics_only_ids = {"bktqp_a_fxjs", "bktqp_a_qt", "bkp_b_qtdx"}
    for nid in physics_only_ids:
        node = _find_node(tree["tree"], nid)
        assert node is not None, f"{nid} not found"
        assert node["subjects"] == ["物理"], f"{nid} should be physics-only"


def test_volunteer_settings_on_segments(tree):
    segment_ids = ["bktqp_a", "bktqp_b", "bkp_a", "bkp_b"]
    for sid in segment_ids:
        node = _find_node(tree["tree"], sid)
        assert node is not None, f"{sid} not found"
        assert "volunteerSettings" in node, f"{sid} missing volunteerSettings"
