# -*- coding: utf-8 -*-
"""Unit tests for batch_tree module (TDD — RED first).

Layer 1: 批次树 — 2025 四川新高考 完整 39 叶节点结构。
"""
import pytest
from scripts.data_integration.three_layer.batch_tree import build_batch_tree


@pytest.fixture(scope="module")
def tree():
    return build_batch_tree()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _collect_leaves(node: dict) -> list[dict]:
    """Recursively collect all leaf nodes (nodes without children)."""
    if not node.get("children"):
        return [node]
    leaves = []
    for child in node["children"]:
        leaves.extend(_collect_leaves(child))
    return leaves


def _collect_all_nodes(node: dict) -> list[dict]:
    """Recursively collect every node in the tree."""
    nodes = [node]
    for child in node.get("children", []):
        nodes.extend(_collect_all_nodes(child))
    return nodes


def _find_node(tree: dict, node_id: str) -> dict | None:
    """Find a node by id anywhere in the tree."""
    if tree.get("id") == node_id:
        return tree
    for child in tree.get("children", []):
        result = _find_node(child, node_id)
        if result is not None:
            return result
    return None


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_meta_fields(tree):
    """Root node must carry correct metadata fields."""
    assert tree["year"] == 2025
    assert tree["province"] == "四川"
    assert tree["examReform"] == "新高考"
    assert tree["volunteerUnit"] == "院校专业组"
    assert set(tree["scope"]) == {"物理", "历史"}


def test_top_level_batches(tree):
    """Four canonical top-level batch names must exist as direct children."""
    expected = {"本科提前批次", "本科批次", "高职(专科)提前批次", "高职(专科)批次"}
    actual = {c["name"] for c in tree["children"]}
    assert actual == expected


def test_leaf_count(tree):
    """Exactly 39 leaf nodes."""
    leaves = _collect_leaves(tree)
    assert len(leaves) == 39, f"Expected 39 leaves, got {len(leaves)}: {[l['id'] for l in leaves]}"


def test_all_ids_unique(tree):
    """No duplicate node IDs anywhere in the tree."""
    all_nodes = _collect_all_nodes(tree)
    ids = [n["id"] for n in all_nodes if "id" in n]
    assert len(ids) == len(set(ids)), f"Duplicate IDs found: {[i for i in ids if ids.count(i) > 1]}"


def test_leaf_nodes_have_required_fields(tree):
    """Every leaf node must have id, name, subjects, enrollmentType, dataStatus."""
    leaves = _collect_leaves(tree)
    required = {"id", "name", "subjects", "enrollmentType", "dataStatus"}
    for leaf in leaves:
        missing = required - leaf.keys()
        assert not missing, f"Leaf {leaf.get('id')} missing fields: {missing}"


def test_has_data_count(tree):
    """33 leaves with dataStatus='has_data', 6 with 'no_data'."""
    leaves = _collect_leaves(tree)
    has_data = [l for l in leaves if l["dataStatus"] == "has_data"]
    no_data = [l for l in leaves if l["dataStatus"] == "no_data"]
    assert len(has_data) == 33, f"Expected 33 has_data, got {len(has_data)}: {[l['id'] for l in has_data]}"
    assert len(no_data) == 6, f"Expected 6 no_data, got {len(no_data)}: {[l['id'] for l in no_data]}"


def test_physics_only_nodes(tree):
    """Three nodes must be physics-only (subjects=['物理'])."""
    physics_only_ids = {"bktqp_a_fxjs", "bktqp_a_qt", "bkp_b_qtdx"}
    for node_id in physics_only_ids:
        node = _find_node(tree, node_id)
        assert node is not None, f"Node {node_id} not found in tree"
        assert node["subjects"] == ["物理"], (
            f"Node {node_id} expected subjects=['物理'], got {node['subjects']}"
        )


def test_volunteer_settings_on_segments(tree):
    """A段/B段 intermediate nodes must carry a volunteerSettings field."""
    segment_ids = [
        "bktqp_a", "bktqp_b",
        "bkp_a", "bkp_b",
    ]
    for seg_id in segment_ids:
        node = _find_node(tree, seg_id)
        assert node is not None, f"Segment node {seg_id} not found"
        assert "volunteerSettings" in node, (
            f"Segment {seg_id} missing volunteerSettings"
        )
