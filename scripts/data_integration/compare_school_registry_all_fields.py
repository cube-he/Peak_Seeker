# -*- coding: utf-8 -*-
"""Full field-level comparison for Claude vs Codex school registry.

Claude output is nested JSON. Codex output is a flat registry table.
This script maps every Claude leaf field to the closest Codex field(s), then
compares every common school_code value field by field.
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path
from typing import Any, Callable

import pandas as pd


ROOT = Path(__file__).resolve().parents[2]
CLAUDE_PATH = ROOT / "scripts" / "data_integration" / "three_layer_output" / "school_registry.json"
CODEX_PATH = ROOT / "data" / "codex_layer2_school_registry" / "school_registry.csv"
OUT = ROOT / "data" / "codex_layer2_school_registry" / "comparison_vs_claude_all_fields"


def raw_norm(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() in {"nan", "none", "null", "<na>"}:
        return None
    return text


def comparable(value: Any) -> str | None:
    text = raw_norm(value)
    if text is None:
        return None
    text = text.replace("（", "(").replace("）", ")").strip()
    if text in {"是", "True", "true", "TRUE"}:
        return "true"
    if text in {"否", "False", "false", "FALSE"}:
        return "false"
    if text in {"公办", "public"}:
        return "公办"
    if text in {"民办", "private"}:
        return "民办"
    if text in {"本科", "ben"}:
        return "本科"
    if text in {"专科", "zhuan"}:
        return "专科"
    # Normalize simple numeric strings, including percentages like 58.6%.
    number = text.replace(",", "").replace("%", "")
    try:
        f = float(number)
        if f.is_integer():
            return str(int(f))
        return f"{f:.6f}".rstrip("0").rstrip(".")
    except ValueError:
        pass
    # Normalize JSON-like Python list strings by removing whitespace.
    return re.sub(r"\s+", "", text)


def get_path(obj: dict[str, Any], path: str) -> Any:
    cur: Any = obj
    for part in path.split("."):
        if not isinstance(cur, dict):
            return None
        cur = cur.get(part)
    return cur


def flatten_claude() -> pd.DataFrame:
    obj = json.loads(CLAUDE_PATH.read_text(encoding="utf-8"))
    rows = []
    for code, school in obj["schools"].items():
        row = {"school_code": str(code).zfill(4)}
        for path in CLAUDE_FIELD_PATHS:
            row[path] = get_path(school, path)
        rows.append(row)
    return pd.DataFrame(rows)


def load_codex_raw() -> pd.DataFrame:
    df = pd.read_csv(CODEX_PATH, dtype=str)
    df["school_code"] = df["school_code"].map(lambda x: str(x).zfill(4) if raw_norm(x) else None)
    return df


def col(row: pd.Series, name: str) -> Any:
    return row[name] if name in row.index else None


def coalesce(row: pd.Series, *names: str) -> Any:
    for name in names:
        value = col(row, name)
        if raw_norm(value) is not None:
            return value
    return None


def codex_list(row: pd.Series, *names: str) -> list[Any] | None:
    values = [coalesce(row, name) for name in names]
    if all(raw_norm(v) is None for v in values):
        return None
    return [None if raw_norm(v) is None else raw_norm(v) for v in values]


def codex_bool_double_first(row: pd.Series) -> Any:
    value = coalesce(row, "is_double_first_class_03", "registry02_双一流")
    if raw_norm(value) is None:
        return None
    text = raw_norm(value)
    return "是" if text in {"是", "True", "true", "1"} else "否"


def parse_json_count_field(row: pd.Series, name: str, key: str) -> Any:
    value = raw_norm(col(row, name))
    if value is None:
        return None
    try:
        obj = json.loads(value)
    except Exception:
        try:
            obj = ast.literal_eval(value)
        except Exception:
            return value
    target = obj.get(key)
    if isinstance(target, list):
        return "；".join(map(str, target))
    return target


CLAUDE_FIELD_PATHS = [
    "name",
    "location.province",
    "location.provinceCode",
    "location.city",
    "location.cityTier",
    "location.address",
    "basic.type",
    "basic.nature",
    "basic.authority",
    "basic.level",
    "basic.founded",
    "basic.maleRatio",
    "basic.femaleRatio",
    "tags.tier",
    "tags.background",
    "tags.labels",
    "tags.isDoubleFirstClass",
    "history.evolution",
    "history.mergers",
    "ids.yangguangId",
    "ids.nationalCode",
    "ids.schoolIdentifier",
    "ids.matchMethod",
    "ids.matchNote",
    "rankings.composite",
    "rankings.overallRank",
    "rankings.overallScore",
    "rankings.qs",
    "rankings.usNews",
    "rankings.alumni",
    "rankings.wushulian",
    "rankings.arwu",
    "rankings.moe",
    "rankings.popularity",
    "academics.masterPrograms",
    "academics.doctoralPrograms",
    "academics.masterSubjects",
    "academics.doctoralSubjects",
    "academics.localMaster",
    "academics.localDoctoral",
    "academics.postgraduateRate",
    "academics.postgraduateRateAlt",
    "academics.furtherStudyRate",
    "academics.assessmentGrade",
    "academics.assessmentSummary",
    "academics.doubleFirstClassCount",
    "academics.aClassCount",
    "academics.nationalFeaturedCount",
    "academics.provincialFeaturedCount",
    "academics.doubleFirstClassSubjects",
    "academics.featuredMajors",
    "admissionRules.filingRatio",
    "admissionRules.majorAllocation",
    "admissionRules.tiebreakRule",
    "admissionRules.healthRestrictions",
    "admissionRules.adjustmentPolicy",
    "admissionRules.foreignLanguageReq",
    "admissionRules.subjectScoreReq",
    "admissionRules.bonusPolicy",
    "admissionRules.tuition",
    "admissionRules.majorTransfer",
    "admissionRules.majorTransferRestrictions",
    "links.admissionGuide",
    "links.officialSite",
    "links.admissionSite",
    "links.phone",
    "links.logo",
    "links.banner",
    "satisfaction.overall.score",
    "satisfaction.overall.count",
    "satisfaction.overall.stars",
    "satisfaction.living.score",
    "satisfaction.living.count",
    "satisfaction.living.stars",
    "satisfaction.environment.score",
    "satisfaction.environment.count",
    "satisfaction.environment.stars",
]


CodexGetter = Callable[[pd.Series], Any]


FIELD_MAP: dict[str, tuple[str, CodexGetter | None]] = {
    "name": ("school_name", lambda r: col(r, "school_name")),
    "location.province": ("province/schooldb02_省份名称", lambda r: coalesce(r, "province", "schooldb02_省份名称")),
    "location.provinceCode": ("schooldb02_省份代码", lambda r: col(r, "schooldb02_省份代码")),
    "location.city": ("city/schooldb02_城市", lambda r: coalesce(r, "city", "schooldb02_城市")),
    "location.cityTier": ("city_tier", lambda r: col(r, "city_tier")),
    "location.address": ("schooldb02_地址", lambda r: col(r, "schooldb02_地址")),
    "basic.type": ("school_type_03/schooldb02_院校类型", lambda r: coalesce(r, "school_type_03", "schooldb02_院校类型")),
    "basic.nature": ("nature_03/schooldb02_办学性质", lambda r: coalesce(r, "nature_03", "schooldb02_办学性质")),
    "basic.authority": ("authority_03/schooldb02_隶属部门", lambda r: coalesce(r, "authority_03", "schooldb02_隶属部门")),
    "basic.level": ("level_03/schooldb02_学历层次", lambda r: coalesce(r, "level_03", "schooldb02_学历层次")),
    "basic.founded": ("schooldb02_建校年份", lambda r: col(r, "schooldb02_建校年份")),
    "basic.maleRatio": ("schooldb02_男生比例", lambda r: col(r, "schooldb02_男生比例")),
    "basic.femaleRatio": ("schooldb02_女生比例", lambda r: col(r, "schooldb02_女生比例")),
    "tags.tier": ("tier_03", lambda r: col(r, "tier_03")),
    "tags.background": ("background_03", lambda r: col(r, "background_03")),
    "tags.labels": ("labels_03/schooldb02_院校特色", lambda r: coalesce(r, "labels_03", "schooldb02_院校特色")),
    "tags.isDoubleFirstClass": ("is_double_first_class_03/registry02_双一流", codex_bool_double_first),
    "history.evolution": ("evolution_03", lambda r: col(r, "evolution_03")),
    "history.mergers": ("merge_history_03", lambda r: col(r, "merge_history_03")),
    "ids.yangguangId": ("registry02/charter02/sat02_阳光高考ID", lambda r: coalesce(r, "registry02_阳光高考ID", "charter02_阳光高考ID", "sat02_阳光高考ID")),
    "ids.nationalCode": ("schooldb02_国标代码", lambda r: col(r, "schooldb02_国标代码")),
    "ids.schoolIdentifier": ("unmapped", None),
    "ids.matchMethod": ("unmapped", None),
    "ids.matchNote": ("unmapped", None),
    "rankings.composite": ("rank_03", lambda r: col(r, "rank_03")),
    "rankings.overallRank": ("schooldb02_综合排名", lambda r: col(r, "schooldb02_综合排名")),
    "rankings.overallScore": ("unmapped", None),
    "rankings.qs": ("schooldb02_QS排名", lambda r: col(r, "schooldb02_QS排名")),
    "rankings.usNews": ("schooldb02_USNews排名", lambda r: col(r, "schooldb02_USNews排名")),
    "rankings.alumni": ("schooldb02_校友会排名", lambda r: col(r, "schooldb02_校友会排名")),
    "rankings.wushulian": ("unmapped", None),
    "rankings.arwu": ("schooldb02_软科排名", lambda r: col(r, "schooldb02_软科排名")),
    "rankings.moe": ("schooldb02_教育部排名", lambda r: col(r, "schooldb02_教育部排名")),
    "rankings.popularity": ("schooldb02_热度", lambda r: col(r, "schooldb02_热度")),
    "academics.masterPrograms": ("master_count_03", lambda r: col(r, "master_count_03")),
    "academics.doctoralPrograms": ("doctor_count_03", lambda r: col(r, "doctor_count_03")),
    "academics.masterSubjects": ("master_subjects_03", lambda r: col(r, "master_subjects_03")),
    "academics.doctoralSubjects": ("doctor_subjects_03", lambda r: col(r, "doctor_subjects_03")),
    "academics.localMaster": ("unmapped", None),
    "academics.localDoctoral": ("unmapped", None),
    "academics.postgraduateRate": ("postgraduate_rate_03/schooldb02_保研率", lambda r: coalesce(r, "postgraduate_rate_03", "schooldb02_保研率")),
    "academics.postgraduateRateAlt": ("schooldb02_保研率", lambda r: col(r, "schooldb02_保研率")),
    "academics.furtherStudyRate": ("schooldb02_升学率", lambda r: col(r, "schooldb02_升学率")),
    "academics.assessmentGrade": ("unmapped", None),
    "academics.assessmentSummary": ("discipline_eval_summary_02", lambda r: col(r, "discipline_eval_summary_02")),
    "academics.doubleFirstClassCount": ("schooldb02_双一流学科数", lambda r: col(r, "schooldb02_双一流学科数")),
    "academics.aClassCount": ("schooldb02_A类学科数", lambda r: col(r, "schooldb02_A类学科数")),
    "academics.nationalFeaturedCount": ("schooldb02_国家级数量", lambda r: col(r, "schooldb02_国家级数量")),
    "academics.provincialFeaturedCount": ("schooldb02_省级数量", lambda r: col(r, "schooldb02_省级数量")),
    "academics.doubleFirstClassSubjects": ("schooldb02_双一流专业", lambda r: parse_json_count_field(r, "schooldb02_双一流专业", "sylSubjectsGroup")),
    "academics.featuredMajors": ("schooldb02_特色专业", lambda r: col(r, "schooldb02_特色专业")),
    "admissionRules.filingRatio": ("charter02_调档比例", lambda r: col(r, "charter02_调档比例")),
    "admissionRules.majorAllocation": ("charter02_专业分配规则", lambda r: col(r, "charter02_专业分配规则")),
    "admissionRules.tiebreakRule": ("charter02_同分规则", lambda r: col(r, "charter02_同分规则")),
    "admissionRules.healthRestrictions": ("charter02_体检限制", lambda r: col(r, "charter02_体检限制")),
    "admissionRules.adjustmentPolicy": ("charter02_服从调剂", lambda r: col(r, "charter02_服从调剂")),
    "admissionRules.foreignLanguageReq": ("charter02_外语要求", lambda r: col(r, "charter02_外语要求")),
    "admissionRules.subjectScoreReq": ("charter02_单科要求", lambda r: col(r, "charter02_单科要求")),
    "admissionRules.bonusPolicy": ("charter02_加分政策", lambda r: col(r, "charter02_加分政策")),
    "admissionRules.tuition": ("charter02_学费", lambda r: col(r, "charter02_学费")),
    "admissionRules.majorTransfer": ("major_transfer_03", lambda r: col(r, "major_transfer_03")),
    "admissionRules.majorTransferRestrictions": ("charter02_转专业限制", lambda r: col(r, "charter02_转专业限制")),
    "links.admissionGuide": ("admission_guide_03", lambda r: col(r, "admission_guide_03")),
    "links.officialSite": ("registry02_学校官网", lambda r: col(r, "registry02_学校官网")),
    "links.admissionSite": ("registry02_招生网址", lambda r: col(r, "registry02_招生网址")),
    "links.phone": ("registry02_招办电话", lambda r: col(r, "registry02_招办电话")),
    "links.logo": ("schooldb02_Logo地址", lambda r: col(r, "schooldb02_Logo地址")),
    "links.banner": ("schooldb02_Banner地址", lambda r: col(r, "schooldb02_Banner地址")),
    "satisfaction.overall.score": ("sat02_综合满意度", lambda r: col(r, "sat02_综合满意度")),
    "satisfaction.overall.count": ("sat02_综合评价人数", lambda r: col(r, "sat02_综合评价人数")),
    "satisfaction.overall.stars": ("sat02_综合1-5星", lambda r: codex_list(r, "sat02_综合1星", "sat02_综合2星", "sat02_综合3星", "sat02_综合4星", "sat02_综合5星")),
    "satisfaction.living.score": ("sat02_生活满意度", lambda r: col(r, "sat02_生活满意度")),
    "satisfaction.living.count": ("unmapped", None),
    "satisfaction.living.stars": ("sat02_生活1-5星", lambda r: codex_list(r, "sat02_生活1星", "sat02_生活2星", "sat02_生活3星", "sat02_生活4星", "sat02_生活5星")),
    "satisfaction.environment.score": ("sat02_环境满意度", lambda r: col(r, "sat02_环境满意度")),
    "satisfaction.environment.count": ("unmapped", None),
    "satisfaction.environment.stars": ("sat02_环境1-5星", lambda r: codex_list(r, "sat02_环境1星", "sat02_环境2星", "sat02_环境3星", "sat02_环境4星", "sat02_环境5星")),
}


def stringify(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, list):
        return json.dumps(value, ensure_ascii=False)
    return raw_norm(value)


def compare() -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    claude = flatten_claude().set_index("school_code")
    codex_raw = load_codex_raw().set_index("school_code")
    common = sorted(set(claude.index) & set(codex_raw.index))
    stats = []
    diffs = []
    unmapped = []

    for path in CLAUDE_FIELD_PATHS:
        codex_desc, getter = FIELD_MAP[path]
        if getter is None:
            claude_non_empty = int(claude[path].map(raw_norm).notna().sum())
            unmapped.append({"claude_field": path, "codex_mapping": codex_desc, "claude_non_empty": claude_non_empty})
            stats.append({
                "claude_field": path,
                "codex_mapping": codex_desc,
                "mapped": False,
                "claude_non_empty": claude_non_empty,
                "codex_non_empty": None,
                "both_non_empty": None,
                "same": None,
                "different": None,
                "codex_only": None,
                "claude_only": None,
                "same_rate_when_both_non_empty": None,
            })
            continue

        codex_values = {code: getter(codex_raw.loc[code]) for code in common}
        claude_non_empty = int(claude[path].map(raw_norm).notna().sum())
        codex_non_empty = sum(1 for value in codex_values.values() if raw_norm(value) is not None)
        both = same = different = codex_only = claude_only = 0
        for code in common:
            c_raw = claude.at[code, path]
            x_raw = codex_values[code]
            c = comparable(c_raw)
            x = comparable(x_raw)
            if c is not None and x is not None:
                both += 1
                if c == x:
                    same += 1
                else:
                    different += 1
                    diffs.append({
                        "school_code": code,
                        "school_name": stringify(claude.at[code, "name"]),
                        "claude_field": path,
                        "codex_mapping": codex_desc,
                        "claude_value": stringify(c_raw),
                        "codex_value": stringify(x_raw),
                        "claude_normalized": c,
                        "codex_normalized": x,
                    })
            elif c is not None:
                claude_only += 1
            elif x is not None:
                codex_only += 1

        stats.append({
            "claude_field": path,
            "codex_mapping": codex_desc,
            "mapped": True,
            "claude_non_empty": claude_non_empty,
            "codex_non_empty": codex_non_empty,
            "both_non_empty": both,
            "same": same,
            "different": different,
            "codex_only": codex_only,
            "claude_only": claude_only,
            "same_rate_when_both_non_empty": round(same / both, 4) if both else None,
        })

    summary = {
        "claude_fields": len(CLAUDE_FIELD_PATHS),
        "mapped_fields": sum(1 for _, getter in FIELD_MAP.values() if getter is not None),
        "unmapped_fields": sum(1 for _, getter in FIELD_MAP.values() if getter is None),
        "claude_rows": int(len(claude)),
        "codex_rows": int(len(codex_raw)),
        "common_rows": int(len(common)),
        "codex_only_codes": sorted(set(codex_raw.index) - set(claude.index)),
        "claude_only_codes": sorted(set(claude.index) - set(codex_raw.index)),
    }
    return pd.DataFrame(stats), pd.DataFrame(diffs), pd.DataFrame(unmapped), summary


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    stats, diffs, unmapped, summary = compare()
    stats.to_csv(OUT / "all_field_comparison_stats.csv", index=False, encoding="utf-8-sig")
    diffs.to_csv(OUT / "all_value_differences.csv", index=False, encoding="utf-8-sig")
    unmapped.to_csv(OUT / "unmapped_claude_fields.csv", index=False, encoding="utf-8-sig")
    diffs[diffs["claude_field"].isin(["academics.postgraduateRate", "academics.postgraduateRateAlt"])].to_csv(
        OUT / "postgraduate_rate_differences.csv", index=False, encoding="utf-8-sig"
    )

    mapped_stats = stats[stats["mapped"] == True].copy()  # noqa: E712
    lines = [
        "# Claude vs Codex 院校注册表全字段逐值对比",
        "",
        f"- Claude 字段数: {summary['claude_fields']}",
        f"- 已映射字段数: {summary['mapped_fields']}",
        f"- 未映射字段数: {summary['unmapped_fields']}",
        f"- Claude 行数: {summary['claude_rows']:,}",
        f"- Codex 行数: {summary['codex_rows']:,}",
        f"- 共同院校代码: {summary['common_rows']:,}",
        f"- Codex 独有代码: {summary['codex_only_codes']}",
        f"- Claude 独有代码: {summary['claude_only_codes']}",
        "",
        "## 差异最多字段 Top 20",
        "",
    ]
    for _, row in mapped_stats.sort_values("different", ascending=False).head(20).iterrows():
        rate = row["same_rate_when_both_non_empty"]
        rate_text = "" if pd.isna(rate) else f"，一致率 {rate:.2%}"
        lines.append(
            f"- `{row['claude_field']}` -> `{row['codex_mapping']}`: "
            f"差异 {int(row['different']):,}，双方都有值 {int(row['both_non_empty']):,}{rate_text}"
        )
    lines.extend(["", "## 未映射字段", ""])
    for _, row in unmapped.iterrows():
        lines.append(f"- `{row['claude_field']}`: Claude 非空 {int(row['claude_non_empty']):,}")
    lines.extend([
        "",
        "## 输出文件",
        "",
        "- `all_field_comparison_stats.csv`: 77 个 Claude 字段的映射、覆盖率、一致率",
        "- `all_value_differences.csv`: 所有逐校逐字段差异",
        "- `postgraduate_rate_differences.csv`: 保研率相关差异单独抽出",
        "- `unmapped_claude_fields.csv`: Codex 当前未产出的 Claude 字段",
    ])
    (OUT / "all_fields_comparison_report.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
