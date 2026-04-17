# -*- coding: utf-8 -*-
"""
P3.3b — 对 99 个 xlsx 做分层抽样 (每个 2-3 行)，产出 OCR 校验索引 CSV。
优先选"风险高"的行（含长备注 / 特殊字符 / 嵌套括号 / 极短代码）。
"""
from __future__ import annotations

import argparse
import csv
import random
from pathlib import Path

import pandas as pd

DATA_ROOT = Path("data/13_征集志愿/普通高考")


def risk_score(row: pd.Series) -> tuple[int, list[str]]:
    """Compute a risk score + tags for one row; higher = more likely OCR errors."""
    score = 0
    tags = []
    text = " ".join(str(v) for v in row.values if pd.notna(v))

    # 括号类型不一致（中英混用 / 嵌套）
    if "(" in text and "（" in text:
        score += 2
        tags.append("bracket_mixed")
    if text.count("（") != text.count("）"):
        score += 3
        tags.append("bracket_unbalanced")
    if "((" in text or "（（" in text:
        score += 2
        tags.append("bracket_nested")

    # 长备注
    if len(text) > 120:
        score += 1
        tags.append("long_text")

    # 特殊字符混淆
    if any(c in text for c in ["O", "l", "I", "S"]) and any(d.isdigit() for d in text):
        score += 1
        tags.append("confusable_chars")

    # 极短/畸形代码
    for col in ("院校代码", "专业代码"):
        if col in row.index:
            v = str(row[col]) if pd.notna(row[col]) else ""
            if col == "院校代码" and v and (not v.isdigit() or len(v) != 4):
                score += 3
                tags.append("malformed_college_code")
            if col == "专业代码" and v and not v.replace(" ", "").isalnum():
                score += 2
                tags.append("malformed_major_code")

    return score, tags


def sample_one_xlsx(xlsx_path: Path, per_file: int, rng: random.Random) -> list[dict]:
    try:
        # Read all as str to preserve OCR-level truth (avoid float coercion of codes)
        df = pd.read_excel(xlsx_path, dtype=str)
    except Exception:
        return []
    if len(df) == 0:
        return []

    scored = []
    for i in range(len(df)):
        s, tags = risk_score(df.iloc[i])
        scored.append((i, s, tags))

    # sort by score desc; if many tied, add random tiebreaker for diversity
    scored.sort(key=lambda t: (-t[1], rng.random()))
    top = scored[:per_file]
    # top up with random if not enough risky rows
    if len(top) < per_file:
        remaining = [s for s in scored[per_file:] if s not in top]
        rng.shuffle(remaining)
        top.extend(remaining[: per_file - len(top)])

    parent = xlsx_path.parent.name  # contains year + batch hints
    rel = str(xlsx_path.relative_to(DATA_ROOT))
    samples = []
    for idx, score, tags in top[:per_file]:
        # locate matching image (best-effort): same folder, jpg/png, stem starts with xlsx stem prefix
        img_dir = xlsx_path.parent
        images = sorted(list(img_dir.glob("*.jpg")) + list(img_dir.glob("*.png")))
        img_hint = str(images[0].relative_to(DATA_ROOT)) if images else ""

        row_preview = " | ".join(
            f"{c}={df.iloc[idx][c]}"
            for c in list(df.columns)[:10]
            if pd.notna(df.iloc[idx][c])
        )
        samples.append({
            "file": rel,
            "row_idx": idx,
            "risk_score": score,
            "risk_tags": ";".join(tags),
            "folder": parent,
            "image_hint_first": img_hint,
            "row_preview": row_preview[:400],
        })
    return samples


def stratified_sample(per_file=3, seed=42, skip_supplementary=True):
    rng = random.Random(seed)
    samples = []
    for xlsx in sorted(DATA_ROOT.rglob("*.xlsx")):
        rel = str(xlsx.relative_to(DATA_ROOT))
        if skip_supplementary and "补充数据" in rel:
            continue
        samples.extend(sample_one_xlsx(xlsx, per_file, rng))
    return samples


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-file", type=int, default=3)
    parser.add_argument("--out", default="data/_pipeline/P3/ocr_sample_index.csv")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    samples = stratified_sample(args.per_file, args.seed)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fields = ["file", "row_idx", "risk_score", "risk_tags", "folder", "image_hint_first", "row_preview"]
    with out.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for s in samples:
            w.writerow(s)
    print(f"Wrote {len(samples)} samples to {out}")


if __name__ == "__main__":
    main()
