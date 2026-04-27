# -*- coding: utf-8 -*-
"""Build school_registry.json from 院校信息表.xlsx.

Reads 2237 schools × 90 columns, transforms into the Layer 2
target schema with 10 groups. Outputs to three_layer_output/.

Source: data/03_专家版主表/output/院校信息表.xlsx
Schema: docs/superpowers/specs/2026-04-27-three-layer-data-structure-design.md
"""
from __future__ import annotations

import json
from pathlib import Path
import openpyxl

SCHOOL_TABLE = Path(__file__).resolve().parents[3] / "data" / "03_专家版主表" / "output" / "院校信息表.xlsx"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "three_layer_output"


def _safe_int(val) -> int | None:
    if val is None:
        return None
    try:
        return int(val)
    except (ValueError, TypeError):
        return None


def _safe_float(val) -> float | None:
    if val is None:
        return None
    if isinstance(val, str):
        val = val.strip().rstrip("%")
    try:
        return round(float(val), 2)
    except (ValueError, TypeError):
        return None


def _safe_str(val) -> str | None:
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None


def transform_row(row: list | tuple) -> tuple[str, dict]:
    """Transform a single xlsx row (90 cols) into (code, school_dict)."""
    code = str(row[0]).strip() if row[0] else "????"
    # Zero-pad to 4 digits
    if code.isdigit():
        code = code.zfill(4)

    school = {
        "name": _safe_str(row[1]),
        "location": {
            "province": _safe_str(row[2]),
            "provinceCode": _safe_str(row[55]),
            "city": _safe_str(row[3]),
            "cityTier": _safe_str(row[4]),
            "address": _safe_str(row[62]),
        },
        "basic": {
            "type": _safe_str(row[5]),
            "nature": _safe_str(row[6]),
            "authority": _safe_str(row[7]),
            "level": _safe_str(row[11]),
            "founded": _safe_int(row[41]),
            "maleRatio": _safe_float(row[42]),
            "femaleRatio": _safe_float(row[43]),
        },
        "tags": {
            "tier": _safe_str(row[8]),
            "background": _safe_str(row[9]),
            "labels": _safe_str(row[10]),
            # "是" → True, everything else → False
            "isDoubleFirstClass": str(row[12]).strip() == "是" if row[12] else False,
        },
        "history": {
            "evolution": _safe_str(row[13]),
            "mergers": _safe_str(row[24]),
        },
        "ids": {
            "yangguangId": _safe_str(row[36]),
            "nationalCode": _safe_str(row[49]),
            "schoolIdentifier": _safe_str(row[50]),
            "matchMethod": _safe_str(row[51]),
            "matchNote": _safe_str(row[52]),
        },
        "rankings": {
            "composite": _safe_int(row[14]),
            "overallRank": _safe_int(row[57]),
            "overallScore": _safe_float(row[58]),
            "qs": _safe_int(row[44]),
            "usNews": _safe_int(row[45]),
            "alumni": _safe_int(row[46]),
            "wushulian": _safe_int(row[59]),
            "arwu": _safe_int(row[60]),
            "moe": _safe_int(row[61]),
            "popularity": _safe_int(row[56]),
        },
        "academics": {
            "masterPrograms": _safe_int(row[15]),
            "doctoralPrograms": _safe_int(row[16]),
            "masterSubjects": _safe_str(row[17]),
            "doctoralSubjects": _safe_str(row[18]),
            "localMaster": _safe_str(row[19]),
            "localDoctoral": _safe_str(row[20]),
            "postgraduateRate": _safe_float(row[21]),
            "postgraduateRateAlt": _safe_float(row[47]),
            "furtherStudyRate": _safe_float(row[40]),
            "assessmentGrade": _safe_str(row[25]),
            "assessmentSummary": _safe_str(row[48]),
            "doubleFirstClassCount": _safe_int(row[63]),
            "aClassCount": _safe_int(row[64]),
            "nationalFeaturedCount": _safe_int(row[65]),
            "provincialFeaturedCount": _safe_int(row[66]),
            "doubleFirstClassSubjects": _safe_str(row[67]),
            "featuredMajors": _safe_str(row[68]),
        },
        "admissionRules": {
            "filingRatio": _safe_str(row[26]),
            "majorAllocation": _safe_str(row[27]),
            "tiebreakRule": _safe_str(row[28]),
            "healthRestrictions": _safe_str(row[29]),
            "adjustmentPolicy": _safe_str(row[30]),
            "foreignLanguageReq": _safe_str(row[31]),
            "subjectScoreReq": _safe_str(row[32]),
            "bonusPolicy": _safe_str(row[33]),
            "tuition": _safe_str(row[34]),
            "majorTransfer": _safe_str(row[22]),
            "majorTransferRestrictions": _safe_str(row[35]),
        },
        "links": {
            "admissionGuide": _safe_str(row[23]),
            "officialSite": _safe_str(row[37]),
            "admissionSite": _safe_str(row[38]),
            "phone": _safe_str(row[39]),
            "logo": _safe_str(row[53]),
            "banner": _safe_str(row[54]),
        },
        "satisfaction": {
            "overall": {
                "score": _safe_float(row[69]),
                "count": _safe_int(row[70]),
                "stars": [_safe_int(row[71 + i]) or 0 for i in range(5)],
            },
            "living": {
                "score": _safe_float(row[76]),
                "count": _safe_int(row[77]),
                "stars": [_safe_int(row[78 + i]) or 0 for i in range(5)],
            },
            "environment": {
                "score": _safe_float(row[83]),
                "count": _safe_int(row[84]),
                "stars": [_safe_int(row[85 + i]) or 0 for i in range(5)],
            },
        },
    }
    return code, school


def build_registry(source_path: Path | None = None) -> dict:
    """Build the complete school registry from xlsx."""
    src = source_path or SCHOOL_TABLE
    wb = openpyxl.load_workbook(src, read_only=True)
    ws = wb.active

    schools = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        code, school = transform_row(list(row))
        if code and code != "????":
            schools[code] = school

    wb.close()

    return {
        "meta": {
            "count": len(schools),
            "source": "专家版主表·院校信息表",
            "year": 2025,
        },
        "schools": schools,
    }


def generate(output_dir: Path | None = None) -> Path:
    """Build and write school_registry.json."""
    out = output_dir or OUTPUT_DIR
    out.mkdir(parents=True, exist_ok=True)
    path = out / "school_registry.json"
    registry = build_registry()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(registry, f, ensure_ascii=False, indent=2)
    print(f"Written {registry['meta']['count']} schools to {path}")
    return path


if __name__ == "__main__":
    generate()
