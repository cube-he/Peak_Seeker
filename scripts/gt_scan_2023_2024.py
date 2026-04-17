# -*- coding: utf-8 -*-
"""
Ground-truth scanner for 2023/2024 征集志愿 folders.
Read-only: iterate each folder, pick primary xlsx, dump first 10 rows + all sheet names.
Output: JSON intermediate file for downstream Markdown generation.
"""
import json
import sys
from pathlib import Path

import pandas as pd
from openpyxl import load_workbook

ROOT = Path(r"C:\Users\Administrator\Documents\VolunteerHelper\data\13_征集志愿\普通高考")
OUT = Path(r"C:\Users\Administrator\Documents\VolunteerHelper\scripts\_gt_2023_2024.json")


def pick_primary(xlsx_files):
    """Prefer mimo-v2-omni (non-corrected) > claude (non-corrected) > any."""
    files = [f for f in xlsx_files if not f.name.startswith("~$")]
    # supplementary prefix is a separate data source - keep in list but rank lower unless it's the only one
    supplementary = [f for f in files if f.name.startswith("supplementary")]
    non_supp = [f for f in files if not f.name.startswith("supplementary")]
    pool = non_supp if non_supp else files

    def rank(f):
        n = f.name.lower()
        corrected = "_corrected" in n
        if "mimo-v2-omni" in n and not corrected:
            return 0
        if "claude" in n and not corrected:
            return 1
        if "mimo-v2-omni" in n:
            return 2
        if "claude" in n:
            return 3
        if "多引擎" in f.name or "paddleocr" in n:
            return 4
        return 5

    pool.sort(key=rank)
    return pool[0] if pool else None


def read_head(xlsx_path, nrows=10):
    """Return dict {sheet_name: [[cell,...], ...]}:
    - First nrows of preview.
    - Plus 'unique科类vals' scanned from ALL rows, column index auto-detected.
    """
    out = {}
    try:
        xl = pd.ExcelFile(xlsx_path)
        for sh in xl.sheet_names:
            try:
                df_full = pd.read_excel(xlsx_path, sheet_name=sh, header=None, dtype=str)
                df_full_filled = df_full.fillna("")
                out[sh] = df_full_filled.head(nrows).values.tolist()
                # scan 科类 col from header row 0
                kelei_vals = set()
                if df_full.shape[0] > 1:
                    header = df_full.iloc[0].tolist()
                    kelei_idx = None
                    for i, c in enumerate(header):
                        if str(c).strip() == "科类":
                            kelei_idx = i
                            break
                    if kelei_idx is not None:
                        for v in df_full.iloc[1:, kelei_idx].dropna().astype(str).tolist():
                            v = v.strip()
                            if v:
                                kelei_vals.add(v)
                out[f"__{sh}__kelei_全表唯一值"] = sorted(kelei_vals)
                out[f"__{sh}__data_rows"] = int(df_full.shape[0] - 1)
            except Exception as e:
                out[sh] = f"[READ_ERROR] {e}"
    except Exception as e:
        out["__error__"] = f"[OPEN_ERROR] {e}"
    return out


def main():
    records = []
    for cat in sorted(ROOT.iterdir()):
        if not cat.is_dir():
            continue
        for folder in sorted(cat.iterdir()):
            if not folder.is_dir():
                continue
            name = folder.name
            if "_2023_" not in name and "_2024_" not in name and not name.endswith(("_2023", "_2024")):
                continue
            year = "2023" if "_2023" in name else "2024"
            xlsx_list = sorted(folder.glob("*.xlsx"))
            engines = [f.name for f in xlsx_list]
            primary = pick_primary(xlsx_list)
            primary_name = primary.name if primary else None
            head_data = read_head(primary, nrows=10) if primary else {}
            # also list png files for fallback
            pngs = sorted([p.name for p in folder.glob("*.png")])[:5]
            rec = {
                "category": cat.name,
                "folder": name,
                "year": year,
                "engines": engines,
                "primary": primary_name,
                "pngs": pngs,
                "head": head_data,
            }
            records.append(rec)
            print(f"[OK] {cat.name}/{name} -> {primary_name}", flush=True)
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"TOTAL: {len(records)} -> {OUT}")


if __name__ == "__main__":
    main()
