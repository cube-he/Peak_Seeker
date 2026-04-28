# -*- coding: utf-8 -*-
"""Fix 2022-2024 planNum: move group-level plan to groupYearly, clear major-level.

Problem: 01 source's planNum for 2022-2024 is at group level (same value for all
majors in a group), but was stored as major.yearly.{year}.plan. This is misleading
because it's NOT the per-major plan count.

Fix: For each group where ALL majors share the same plan value in a given year,
move that value to groupYearly.{year}.groupPlan and set major plan to null.
Groups where plans differ (data from 03/C or other sources with true major-level
data) are left unchanged.

2025 plan is NOT touched — it's already true major-level data from 01.
"""
from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


def fix():
    enroll_path = OUTPUT_DIR / "enrollments.json"
    with open(enroll_path, "r", encoding="utf-8") as f:
        enrollments = json.load(f)

    stats = {
        "groups_checked": 0,
        "groups_fixed": defaultdict(int),  # year → count
        "majors_cleared": defaultdict(int),  # year → count
        "groups_kept": defaultdict(int),  # year → count (plans differ, kept as-is)
        "single_major_fixed": defaultdict(int),  # year → count
    }

    for school_code, subjects in enrollments["data"].items():
        for subject, enroll_list in subjects.items():
            for enroll in enroll_list:
                for group in enroll["groups"]:
                    majors = group.get("majors", [])

                    for year in ["2022", "2023", "2024"]:
                        # Collect plan values
                        plans = []
                        for m in majors:
                            yr = (m.get("yearly") or {}).get(year, {})
                            p = yr.get("plan")
                            if p is not None:
                                plans.append((m, p))

                        if not plans:
                            continue

                        stats["groups_checked"] += 1
                        plan_values = [p for _, p in plans]

                        if len(set(plan_values)) == 1:
                            # All same → group-level plan
                            group_plan = plan_values[0]

                            # Move to groupYearly
                            gy = group.setdefault("groupYearly", {})
                            yr_dict = gy.setdefault(year, {})
                            if yr_dict.get("groupPlan") is None:
                                yr_dict["groupPlan"] = group_plan

                            # Clear major-level plan
                            for m, _ in plans:
                                m["yearly"][year]["plan"] = None

                            if len(plans) == 1:
                                stats["single_major_fixed"][year] += 1
                            else:
                                stats["groups_fixed"][year] += 1
                            stats["majors_cleared"][year] += len(plans)
                        else:
                            # Plans differ → real major-level data, keep
                            stats["groups_kept"][year] += 1

    # Save
    with open(enroll_path, "w", encoding="utf-8") as f:
        json.dump(enrollments, f, ensure_ascii=False, indent=2)

    print("=== Fix Group-Level Plan (2022-2024) ===")
    print(f"  Groups checked: {stats['groups_checked']}")
    for year in ["2022", "2023", "2024"]:
        fixed = stats["groups_fixed"][year]
        single = stats["single_major_fixed"][year]
        kept = stats["groups_kept"][year]
        cleared = stats["majors_cleared"][year]
        print(f"\n  {year}:")
        print(f"    Moved to groupPlan (multi-major): {fixed} groups")
        print(f"    Moved to groupPlan (single-major): {single} groups")
        print(f"    Kept as major-level (plans differ): {kept} groups")
        print(f"    Major plan fields cleared: {cleared}")


if __name__ == "__main__":
    fix()
