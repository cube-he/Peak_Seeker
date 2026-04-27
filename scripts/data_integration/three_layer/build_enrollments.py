# -*- coding: utf-8 -*-
"""Build enrollments.json (Layer 3 skeleton) from 01 plan data.

Assembles: school → subject → enrollment → group → major → yearly(2025 plan)
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

from three_layer.parse_01_plans import parse_normal_plans, parse_early_plans, PlanRecord

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


def build_enrollments() -> dict:
    """Build complete enrollment tree from 01 plan data."""
    normal = parse_normal_plans("2025")
    early = parse_early_plans("2025")
    all_records = normal + early

    # Group by school → subject → (batchNodeId, enrollmentType) → groupCode → majors
    tree: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(lambda: defaultdict(list))))

    for r in all_records:
        enroll_key = (r.batch_node_id, r.enrollment_type)
        group_key = r.group_code or "000"  # default group if none parsed
        tree[r.school_code][r.subject][enroll_key][group_key].append(r)

    # Convert to output structure
    data = {}
    total_records = 0

    for school_code in sorted(tree.keys()):
        school_data = {}
        for subject in sorted(tree[school_code].keys()):
            enrollments = []
            for (node_id, etype), groups in sorted(tree[school_code][subject].items()):
                group_list = []
                for group_code, majors in sorted(groups.items()):
                    major_list = []
                    for r in majors:
                        major_list.append({
                            "code": r.major_code,
                            "name": r.major_name,
                            "majorNote": r.major_note,
                            "duration": r.duration,
                            "tuition": r.tuition,
                            "subjectReq": r.subject_req,
                            "yearly": {
                                "2025": {
                                    "plan": r.plan_num,
                                }
                            }
                        })
                        total_records += 1
                    group_list.append({
                        # Store "000" sentinel as null in output
                        "groupCode": group_code if group_code != "000" else None,
                        "subjectReq": majors[0].subject_req if majors else None,
                        "majors": major_list,
                    })
                enrollments.append({
                    "batchNodeId": node_id,
                    "enrollmentType": etype,
                    "groups": group_list,
                })
            school_data[subject] = enrollments
        data[school_code] = school_data

    return {
        "meta": {
            "source": "01_核心录取数据/招生计划_四川_2025",
            "batchTreeRef": "batch_tree_2025.json",
            "schoolRegistryRef": "school_registry.json",
            "totalRecords": total_records,
            "schools": len(data),
        },
        "data": data,
    }


def generate(output_dir: Path | None = None) -> Path:
    out = output_dir or OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / "enrollments.json"
    enrollments = build_enrollments()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)
    meta = enrollments["meta"]
    print(f"Written {meta['totalRecords']} records, {meta['schools']} schools → {path}")
    return path


if __name__ == "__main__":
    generate()
