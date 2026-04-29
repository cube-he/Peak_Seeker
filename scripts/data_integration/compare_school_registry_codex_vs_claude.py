# -*- coding: utf-8 -*-
"""Compare Codex Layer 2 school registry with Claude school registry outputs."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
CODEX_DIR = ROOT / "data" / "codex_layer2_school_registry"
CLAUDE_JSON = ROOT / "scripts" / "data_integration" / "three_layer_output" / "school_registry.json"
OUT_DIR = CODEX_DIR / "comparison_vs_claude"


def val(obj: dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def norm(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() in {"nan", "none", "null", "<na>"}:
        return None
    if text.endswith(".0") and text[:-2].isdigit():
        return text[:-2]
    return text


def load_claude() -> pd.DataFrame:
    obj = json.loads(CLAUDE_JSON.read_text(encoding="utf-8"))
    rows = []
    for code, school in obj["schools"].items():
        rows.append({
            "school_code": str(code).zfill(4),
            "school_name": norm(val(school, "name")),
            "province": norm(val(school, "location.province")),
            "city": norm(val(school, "location.city")),
            "city_tier": norm(val(school, "location.cityTier")),
            "school_type": norm(val(school, "basic.type")),
            "nature": norm(val(school, "basic.nature")),
            "authority": norm(val(school, "basic.authority")),
            "level": norm(val(school, "basic.level")),
            "founded": norm(val(school, "basic.founded")),
            "male_ratio": norm(val(school, "basic.maleRatio")),
            "female_ratio": norm(val(school, "basic.femaleRatio")),
            "tier": norm(val(school, "tags.tier")),
            "labels": norm(val(school, "tags.labels")),
            "is_double_first_class": norm(val(school, "tags.isDoubleFirstClass")),
            "yangguang_id": norm(val(school, "ids.yangguangId")),
            "national_code": norm(val(school, "ids.nationalCode")),
            "overall_rank": norm(val(school, "rankings.overallRank")),
            "qs_rank": norm(val(school, "rankings.qs")),
            "usnews_rank": norm(val(school, "rankings.usNews")),
            "alumni_rank": norm(val(school, "rankings.alumni")),
            "master_count": norm(val(school, "academics.masterPrograms")),
            "doctor_count": norm(val(school, "academics.doctoralPrograms")),
            "postgraduate_rate": norm(val(school, "academics.postgraduateRate")),
            "discipline_summary": norm(val(school, "academics.assessmentSummary")),
            "filing_ratio": norm(val(school, "admissionRules.filingRatio")),
            "major_allocation": norm(val(school, "admissionRules.majorAllocation")),
            "tiebreak_rule": norm(val(school, "admissionRules.tiebreakRule")),
            "official_site": norm(val(school, "links.officialSite")),
            "admission_site": norm(val(school, "links.admissionSite")),
            "phone": norm(val(school, "links.phone")),
            "satisfaction_overall": norm(val(school, "satisfaction.overall.score")),
        })
    return pd.DataFrame(rows)


def load_codex() -> pd.DataFrame:
    src = pd.read_csv(CODEX_DIR / "school_registry.csv", dtype=str)
    def col(name: str) -> pd.Series:
        return src[name] if name in src.columns else pd.Series([None] * len(src))
    def coalesce(*names: str) -> pd.Series:
        result = pd.Series([None] * len(src), dtype=object)
        for name in names:
            candidate = col(name).map(norm)
            result = result.where(result.notna(), candidate)
        return result

    return pd.DataFrame({
        "school_code": col("school_code").map(lambda x: str(x).zfill(4) if norm(x) else None),
        "school_name": col("school_name").map(norm),
        "province": coalesce("province", "schooldb02_省份名称"),
        "city": coalesce("city", "schooldb02_城市"),
        "city_tier": col("city_tier").map(norm),
        "school_type": coalesce("school_type_03", "schooldb02_院校类型"),
        "nature": coalesce("nature_03", "schooldb02_办学性质"),
        "authority": coalesce("authority_03", "schooldb02_隶属部门"),
        "level": coalesce("level_03", "schooldb02_学历层次"),
        "founded": col("schooldb02_建校年份").map(norm),
        "male_ratio": col("schooldb02_男生比例").map(norm),
        "female_ratio": col("schooldb02_女生比例").map(norm),
        "tier": col("tier_03").map(norm),
        "labels": coalesce("labels_03", "schooldb02_院校特色"),
        "is_double_first_class": coalesce("is_double_first_class_03", "registry02_双一流"),
        "yangguang_id": coalesce("registry02_阳光高考ID", "charter02_阳光高考ID", "sat02_阳光高考ID"),
        "national_code": col("schooldb02_国标代码").map(norm),
        "overall_rank": col("schooldb02_综合排名").map(norm),
        "qs_rank": col("schooldb02_QS排名").map(norm),
        "usnews_rank": col("schooldb02_USNews排名").map(norm),
        "alumni_rank": col("schooldb02_校友会排名").map(norm),
        "master_count": col("master_count_03").map(norm),
        "doctor_count": col("doctor_count_03").map(norm),
        "postgraduate_rate": coalesce("postgraduate_rate_03", "schooldb02_保研率"),
        "discipline_summary": col("discipline_eval_summary_02").map(norm),
        "filing_ratio": col("charter02_调档比例").map(norm),
        "major_allocation": col("charter02_专业分配规则").map(norm),
        "tiebreak_rule": col("charter02_同分规则").map(norm),
        "official_site": col("registry02_学校官网").map(norm),
        "admission_site": col("registry02_招生网址").map(norm),
        "phone": col("registry02_招办电话").map(norm),
        "satisfaction_overall": col("sat02_综合满意度").map(norm),
    })


def compare() -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    codex = load_codex()
    claude = load_claude()
    common = sorted(set(codex["school_code"].dropna()) & set(claude["school_code"].dropna()))
    codex_only = sorted(set(codex["school_code"].dropna()) - set(claude["school_code"].dropna()))
    claude_only = sorted(set(claude["school_code"].dropna()) - set(codex["school_code"].dropna()))

    cdx = codex.set_index("school_code")
    cld = claude.set_index("school_code")
    fields = [c for c in codex.columns if c != "school_code"]
    stats_rows = []
    diff_rows = []
    for field in fields:
        codex_non_empty = int(codex[field].notna().sum())
        claude_non_empty = int(claude[field].notna().sum())
        both = 0
        same = 0
        diff = 0
        codex_only_values = 0
        claude_only_values = 0
        for code in common:
            a = norm(cdx.at[code, field])
            b = norm(cld.at[code, field])
            if a is not None and b is not None:
                both += 1
                if str(a) == str(b):
                    same += 1
                else:
                    diff += 1
                    if len(diff_rows) < 5000:
                        diff_rows.append({
                            "school_code": code,
                            "school_name_codex": cdx.at[code, "school_name"],
                            "field": field,
                            "codex": a,
                            "claude": b,
                        })
            elif a is not None:
                codex_only_values += 1
            elif b is not None:
                claude_only_values += 1
        stats_rows.append({
            "field": field,
            "codex_non_empty": codex_non_empty,
            "claude_non_empty": claude_non_empty,
            "both_non_empty_common": both,
            "same": same,
            "different": diff,
            "codex_only_values_on_common": codex_only_values,
            "claude_only_values_on_common": claude_only_values,
            "same_rate_when_both_non_empty": round(same / both, 4) if both else None,
        })

    summary = {
        "codex_rows": int(len(codex)),
        "claude_rows": int(len(claude)),
        "common_codes": int(len(common)),
        "codex_only_codes": codex_only,
        "claude_only_codes": claude_only,
        "codex_columns_flat_compare": int(len(codex.columns)),
        "claude_source": str(CLAUDE_JSON.relative_to(ROOT)),
        "codex_source": str((CODEX_DIR / "school_registry.csv").relative_to(ROOT)),
    }
    return pd.DataFrame(stats_rows), pd.DataFrame(diff_rows), summary


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    stats, diffs, summary = compare()
    stats.to_csv(OUT_DIR / "field_comparison_stats.csv", index=False, encoding="utf-8-sig")
    diffs.to_csv(OUT_DIR / "key_field_differences_sample.csv", index=False, encoding="utf-8-sig")

    worst_diff = stats.sort_values(["different"], ascending=False).head(12)
    coverage_delta = stats.assign(delta=stats["codex_non_empty"] - stats["claude_non_empty"]).sort_values("delta", ascending=False)
    lines = [
        "# Codex vs Claude 院校注册表对比",
        "",
        f"- Codex: `{summary['codex_source']}`",
        f"- Claude: `{summary['claude_source']}`",
        f"- Codex 行数: {summary['codex_rows']:,}",
        f"- Claude 行数: {summary['claude_rows']:,}",
        f"- 共同院校代码: {summary['common_codes']:,}",
        f"- Codex 独有院校代码: {len(summary['codex_only_codes'])} {summary['codex_only_codes'][:20]}",
        f"- Claude 独有院校代码: {len(summary['claude_only_codes'])} {summary['claude_only_codes'][:20]}",
        "",
        "## 覆盖率优势 Top",
        "",
    ]
    for _, row in coverage_delta.head(12).iterrows():
        lines.append(f"- {row['field']}: Codex {row['codex_non_empty']:,}, Claude {row['claude_non_empty']:,}, 差值 {int(row['delta']):+,}")
    lines.extend(["", "## 差异较多字段 Top", ""])
    for _, row in worst_diff.iterrows():
        rate = row["same_rate_when_both_non_empty"]
        rate_text = "" if pd.isna(rate) else f", 一致率 {rate:.2%}"
        lines.append(f"- {row['field']}: 差异 {row['different']:,}, 双方都有值 {row['both_non_empty_common']:,}{rate_text}")
    lines.extend([
        "",
        "## 输出文件",
        "",
        "- `field_comparison_stats.csv`: 各字段覆盖率与一致率",
        "- `key_field_differences_sample.csv`: 关键字段差异样本（最多5000条）",
    ])
    (OUT_DIR / "comparison_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
