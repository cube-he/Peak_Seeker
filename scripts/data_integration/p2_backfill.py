# -*- coding: utf-8 -*-
"""P2 Task 11: 2025 backfill candidates xlsx + lineage log.

Consumes the enriched 03×01 join (from p2_enrich.enrich_with_01) and splits
rows into three buckets by action priority:

  new_rows   — right_only rows: 01 has them, 03 does not → candidates to add
  field_fill — both-side rows with backfill notes: 03 exists but has null
               fields that 01 can supply → candidates to patch
  no_action  — everything else (03 sufficient, or left_only where 01 has
               no additional signal)

Each bucket gets a _lineage_source column for downstream traceability.

Why skip writing no_action to disk: it's typically thousands of rows with no
actionable outcome; the audit trail lives in the full enriched table.
"""
from __future__ import annotations

import logging
from pathlib import Path

import pandas as pd

from scripts.data_integration.p2_enrich import enrich_with_01
from scripts.data_integration.p2_join import join_03_and_01_2025

logger = logging.getLogger(__name__)

# Repo root: this file is at scripts/data_integration/p2_backfill.py,
# so parents[2] = repo root.
_REPO_ROOT = Path(__file__).resolve().parents[2]


def split_backfill_candidates(enriched: pd.DataFrame) -> dict[str, pd.DataFrame]:
    """Split enriched join into three action buckets with lineage annotations.

    Args:
        enriched: DataFrame from enrich_with_01(); must have '_merge' and
                  '_backfill_notes' columns.

    Returns:
        Dict with keys 'new_rows', 'field_fill', 'no_action'. Each value is a
        copy of the relevant rows with a new '_lineage_source' column added.
        The three bucket sizes sum to len(enriched).
    """
    # Normalise _backfill_notes: NaN → "" so comparisons are clean
    notes = enriched["_backfill_notes"].fillna("")
    merge = enriched["_merge"]

    # Mask 1: right_only → completely new to 03
    mask_new = merge == "right_only"

    # Mask 2: both-side rows where 01 can fill at least one null 03 field
    mask_fill = (merge == "both") & (notes != "")

    # Mask 3: everything else (both + empty notes, and left_only)
    mask_no_action = ~mask_new & ~mask_fill

    new_rows = enriched[mask_new].copy()
    new_rows["_lineage_source"] = "01"

    field_fill = enriched[mask_fill].copy()
    field_fill["_lineage_source"] = "03+01候选"

    no_action = enriched[mask_no_action].copy()
    no_action["_lineage_source"] = "03"

    return {
        "new_rows": new_rows,
        "field_fill": field_fill,
        "no_action": no_action,
    }


def main() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    )

    logger.info("P2 backfill: loading 2025 join …")
    merged = join_03_and_01_2025()

    logger.info("P2 backfill: enriching with 01 columns …")
    enriched = enrich_with_01(merged)

    logger.info("P2 backfill: splitting into action buckets …")
    buckets = split_backfill_candidates(enriched)

    new_count = len(buckets["new_rows"])
    fill_count = len(buckets["field_fill"])
    no_action_count = len(buckets["no_action"])
    total = new_count + fill_count + no_action_count

    logger.info(
        "P2 backfill: buckets — new_rows=%d  field_fill=%d  no_action=%d  total=%d",
        new_count, fill_count, no_action_count, total,
    )

    out_dir = _REPO_ROOT / "data" / "_pipeline" / "P2"
    out_dir.mkdir(parents=True, exist_ok=True)

    new_path = out_dir / "backfill_new_rows_2025.xlsx"
    fill_path = out_dir / "backfill_field_fill_2025.xlsx"

    buckets["new_rows"].to_excel(new_path, index=False, engine="openpyxl")
    logger.info("P2 backfill: wrote %s (%d rows)", new_path, new_count)

    buckets["field_fill"].to_excel(fill_path, index=False, engine="openpyxl")
    logger.info("P2 backfill: wrote %s (%d rows)", fill_path, fill_count)

    logger.info(
        "P2 backfill DONE — new_rows=%d  field_fill=%d  no_action=%d (not written)",
        new_count, fill_count, no_action_count,
    )


if __name__ == "__main__":
    main()
