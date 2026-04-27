# -*- coding: utf-8 -*-
"""Column mappings from each data source to the target three-layer schema.

Each map: {target_field: source_column}
- xlsx sources: source_column is the column header string
- json sources: source_column is the JSON key string

Design ref: docs/superpowers/specs/2026-04-27-data-integration-workflow-design.md
Full mapping table: docs/superpowers/plans/2026-04-27-integration-infrastructure.md
"""
from __future__ import annotations


# ---------------------------------------------------------------------------
# Target field registry (exhaustive list of all fields in three-layer schema)
# ---------------------------------------------------------------------------

TARGET_ENROLLMENT_FIELDS = {"batchNodeId", "batchName", "enrollmentType"}

TARGET_GROUP_FIELDS = {
    "groupCode", "subjectReq", "note",
    "groupYearly.2025.groupPlan", "groupYearly.2025.filingMin",
    "groupYearly.2025.filingMinRank", "groupYearly.2025.groupEnrolled",
    "groupYearly.2025.groupMin", "groupYearly.2025.groupMinRank",
    "groupYearly.2024.batchMin", "groupYearly.2024.batchMinRank",
    "groupYearly.2024.batchEnrolled",
}

TARGET_MAJOR_FIELDS = {
    "code", "name", "fullName", "category", "discipline",
    "majorNote", "isNew", "duration", "tuition",
    "oldBatch", "oldBatch2",
}

TARGET_QUALITY_FIELDS = {
    "quality.rating", "quality.rank", "quality.assessment",
    "quality.level", "quality.isNationalFeatured",
    "quality.majorRank", "quality.honor",
    "quality.masterPoint", "quality.doctoralPoint",
}

TARGET_YEARLY_FIELDS = {
    f"yearly.{y}.{f}"
    for y in ("2025", "2024", "2023", "2022")
    for f in ("plan", "enrolled", "min", "minRank", "avg", "avgRank", "max", "maxRank")
}

TARGET_SCHOOL_FIELDS = {
    # location
    "school.province", "school.provinceCode", "school.city",
    "school.cityTier", "school.address",
    # basic
    "school.type", "school.nature", "school.authority",
    "school.level", "school.founded", "school.maleRatio", "school.femaleRatio",
    # tags
    "school.tier", "school.background", "school.labels", "school.isDoubleFirstClass",
    # history
    "school.evolution", "school.mergers",
    # ids
    "school.yangguangId", "school.nationalCode", "school.schoolIdentifier",
    # rankings
    "school.composite", "school.overallRank", "school.overallScore",
    "school.qs", "school.usNews", "school.alumni",
    "school.wushulian", "school.arwu", "school.moe", "school.popularity",
    # academics
    "school.masterPrograms", "school.doctoralPrograms",
    "school.masterSubjects", "school.doctoralSubjects",
    "school.localMaster", "school.localDoctoral",
    "school.postgraduateRate", "school.furtherStudyRate",
    "school.assessmentSummary", "school.doubleFirstClassCount",
    "school.aClassCount", "school.nationalFeaturedCount", "school.provincialFeaturedCount",
    "school.doubleFirstClassSubjects", "school.featuredMajors",
    # admissionRules
    "school.filingRatio", "school.majorAllocation", "school.tiebreakRule",
    "school.healthRestrictions", "school.adjustmentPolicy",
    "school.foreignLanguageReq", "school.subjectScoreReq",
    "school.bonusPolicy", "school.tuitionPolicy",
    "school.majorTransfer", "school.majorTransferRestrictions",
    # links
    "school.admissionGuide", "school.officialSite", "school.phone",
    "school.logo", "school.banner",
    # satisfaction
    "school.satisfaction.overall", "school.satisfaction.living",
    "school.satisfaction.environment",
}

ALL_TARGET_FIELDS = (
    TARGET_ENROLLMENT_FIELDS | TARGET_GROUP_FIELDS |
    TARGET_MAJOR_FIELDS | TARGET_QUALITY_FIELDS |
    TARGET_YEARLY_FIELDS | TARGET_SCHOOL_FIELDS
)

# Fields that have NO source in any current data file.
# SOURCE_02_SCHOOL_MAP uses bare keys (school entity namespace);
# all TARGET_SCHOOL_FIELDS use "school." prefix and are populated via a
# separate school-load pipeline — not through the enrollment record maps.
UNCOVERED_FIELDS = {
    # --- enrollment ---
    "batchName",                   # derived from batchNodeId + batch_tree

    # --- major basic ---
    "oldBatch2",                   # only in historical output, needs reconstruction

    # --- yearly: no source for plan in 2023/2022 ---
    "yearly.2023.plan",            # A无，H无；需从01/2023招生计划获取（未纳入当前映射）
    "yearly.2022.plan",            # 所有常规源均无

    # --- school.*: all TARGET_SCHOOL_FIELDS (populated via 02 school pipeline,
    #     not directly through enrollment-record source maps) ---
} | TARGET_SCHOOL_FIELDS


# ---------------------------------------------------------------------------
# Source A: 13-2026-四川-专家版 (李老师) — 48135 rows, header at row 3
# ---------------------------------------------------------------------------

SOURCE_A_MAP = {
    # enrollment
    "batchNodeId": "批次",               # Col02, needs normalize
    "enrollmentType": "批次备注",         # Col03
    # group
    "groupCode": "专业组代码",            # Col08
    "subjectReq": "选科要求",             # Col14
    "note": "院校备注",                   # Col13
    "groupYearly.2025.groupPlan": "专业组计划人数",    # Col20
    "groupYearly.2025.groupEnrolled": "专业组录取人数", # Col26
    "groupYearly.2025.groupMin": "专业组最低分",       # Col27
    "groupYearly.2025.groupMinRank": "专业组最低位次", # Col28
    # major basic
    "code": "专业代码",                   # Col09
    "name": "专业名称",                   # Col11
    "fullName": "专业全称",               # Col10
    "category": "专业类",                 # Col22
    "discipline": "门类",                 # Col21
    "majorNote": "专业备注",              # Col12
    "isNew": "是否新增",                  # Col23
    "duration": "学制",                   # Col17
    "tuition": "学费",                    # Col18
    "oldBatch": "老批次",                 # Col41
    # major quality
    "quality.rating": "软科评级",          # Col64
    "quality.rank": "软科排名",            # Col65
    "quality.assessment": "学科评估",      # Col66
    "quality.level": "专业水平",           # Col67
    "quality.masterPoint": "本专业硕士点", # Col68
    "quality.doctoralPoint": "本专业博士点", # Col69
    # yearly 2025
    "yearly.2025.plan": "计划人数",        # Col16
    "yearly.2025.min": "最低分",           # Col24 (第一个同名列)
    "yearly.2025.minRank": "最低位次",     # Col25
    # yearly 2024
    "yearly.2024.enrolled": "录取人数",    # Col36
    "yearly.2024.min": "最低分_2",         # Col37
    "yearly.2024.minRank": "最低位次_2",   # Col38
    "yearly.2024.avg": "平均分",           # Col39
    "yearly.2024.avgRank": "平均位次",     # Col40
    "yearly.2024.plan": "计划人数结果",    # Col42
    # yearly 2023
    "yearly.2023.min": "最低分_3",         # Col43
    "yearly.2023.minRank": "最低位次_3",   # Col44
    "yearly.2023.enrolled": "录取人数_2",  # Col45
    # match key helpers
    "_subject": "科类",                    # Col04 (物理/历史)
    "_schoolCode": "院校代码",             # Col05
    "_schoolName": "院校名称",             # Col06
}


# ---------------------------------------------------------------------------
# Source H: 2026四川高考志愿_清洗后_修改 — 48133 rows, header at row 1
# ---------------------------------------------------------------------------

SOURCE_H_MAP = {
    "batchNodeId": "批次",
    "enrollmentType": "类型",
    "groupCode": "专业组代码",
    "subjectReq": "选科要求",
    "note": "院校备注",
    "groupYearly.2025.groupPlan": "25专业组计划",
    "groupYearly.2025.filingMin": "25投档最低分",
    "groupYearly.2025.filingMinRank": "25投档最低位次",
    "groupYearly.2025.groupEnrolled": "25专业组录取人数",
    "groupYearly.2025.groupMin": "25专业组最低分",
    "groupYearly.2025.groupMinRank": "25专业组最低位次",
    "groupYearly.2024.batchMin": "24专业组最低分",
    "groupYearly.2024.batchMinRank": "24专业组最低分位次",
    "groupYearly.2024.batchEnrolled": "24专业组录取人数",
    "code": "专业代码",
    "name": "专业",
    "category": "专业类",
    "discipline": "门类",
    "majorNote": "专业备注",
    "isNew": "是否新增",
    "duration": "学制",
    "tuition": "学费",
    "oldBatch": "老批次",
    "quality.rating": "软科评级",
    "quality.rank": "软科排名",
    "quality.assessment": "学科评估",
    "quality.level": "专业水平",
    "quality.isNationalFeatured": "是否国家特色",
    "quality.majorRank": "专业排名",
    "quality.honor": "专业荣誉",
    "quality.masterPoint": "本专业硕士点",
    "quality.doctoralPoint": "本专业博士点",
    "yearly.2025.plan": "计划人数",
    "yearly.2025.enrolled": "25录取人数",
    "yearly.2025.min": "25最低分",
    "yearly.2025.minRank": "25最低位次",
    "yearly.2025.avg": "25平均分",
    "yearly.2025.avgRank": "25平均位次",
    "yearly.2025.max": "25最高分",
    "yearly.2025.maxRank": "25最高位次",
    "yearly.2024.enrolled": "24录取人数",
    "yearly.2024.min": "24最低分",
    "yearly.2024.minRank": "24最低分位次",
    "yearly.2024.avg": "24平均分",
    "yearly.2024.avgRank": "24平均位",
    "yearly.2024.max": "24最高分",
    "yearly.2024.maxRank": "24最高位",
    "yearly.2023.enrolled": "23录取人数",
    "yearly.2023.min": "23最低分",
    "yearly.2023.minRank": "23最低分位次",
    "yearly.2023.avg": "23平均分",
    "yearly.2023.avgRank": "23平均位",
    "yearly.2023.max": "23最高分",
    "yearly.2023.maxRank": "23最高位",
    "yearly.2022.enrolled": "22录取人数",
    "yearly.2022.min": "22最低分",
    "yearly.2022.minRank": "22最低分位次",
    "yearly.2022.avg": "22平均分",
    "yearly.2022.avgRank": "22平均分位次",
    "yearly.2022.max": "22最高分",
    "yearly.2022.maxRank": "22最高分位次",
    "_subject": "科目",
    "_schoolCode": "院校代码",
    "_schoolName": "院校",
}


# ---------------------------------------------------------------------------
# Source 01/专业分数线 JSON — per year file
# ---------------------------------------------------------------------------

SOURCE_01_SCORE_MAP = {
    "min": "minScore",
    "minRank": "minRank",
    "avg": "avgScore",
    "avgRank": "avgRank",
    "max": "maxScore",
    "enrolled": "enterNum",
    "plan": "planNum",
    "_subject": "course",
    "_schoolCode": "collegeCode",
    "_schoolName": "collegeName",
    "_batch": "batch",
    "_majorCode": "professionEnrollCode",
    "_majorName": "professionName",
    "_majorNote": "remark",
    "_subjectReq": "chooseSubjectText",
}


# ---------------------------------------------------------------------------
# Source 01/招生计划 JSON
# ---------------------------------------------------------------------------

SOURCE_01_PLAN_MAP = {
    "plan": "planNum",
    "duration": "learnYear",
    "tuition": "cost",
    "majorNote": "remark",
    "code": "code",
    "name": "professionName",
    "_subject": "course",
    "_schoolCode": "collegeCode",
    "_schoolName": "collegeName",
    "_batch": "batch",
    "_subjectReq": "chooseSubjectText",
}


# ---------------------------------------------------------------------------
# Source 02/院校库_全国
# ---------------------------------------------------------------------------

SOURCE_02_SCHOOL_MAP = {
    # Keys are bare field names (school entity fields, not enrollment-record fields).
    # These map to columns in 02/院校库_全国. The "school." namespace in
    # TARGET_SCHOOL_FIELDS is handled separately by listing those fields in UNCOVERED_FIELDS.
    "name": "中文名称",                    # Col12
    "province": "省份名称",                # Col21
    "provinceCode": "省份代码",            # Col20
    "city": "城市",                        # Col22
    "type": "院校类型",                    # Col18
    "nature": "办学性质名称",              # Col40
    "authority": "隶属部门",               # Col17
    "level": "学历层次名称",               # Col39
    "founded": "建校年份",                 # Col34
    "maleRatio": "男生比例",               # Col32
    "femaleRatio": "女生比例",             # Col33
    "tier": "院校特色",                    # Col19
    "logo": "Logo地址",                    # Col13
    "banner": "Banner地址",                # Col14
    "popularity": "热度",                  # Col23
    "composite": "综合排名",               # Col24
    "overallScore": "综合评分",            # Col31
    "wushulian": "武书连排名",             # Col25
    "arwu": "软科排名",                    # Col26
    "alumni": "校友会排名",                # Col27
    "qs": "QS排名",                       # Col28
    "usNews": "USNews排名",               # Col29
    "moe": "教育部排名",                   # Col30
    "masterPrograms": "硕士点数",           # Col06
    "doctoralPrograms": "博士点数",         # Col07
    "postgraduateRate": "保研率",           # Col00
    "furtherStudyRate": "升学率",           # Col01
    "doubleFirstClassCount": "双一流学科数", # Col02
    "nationalFeaturedCount": "国家级数量",   # Col03
    "provincialFeaturedCount": "省级数量",   # Col04
    "aClassCount": "A类学科数",             # Col05
    "doubleFirstClassSubjects": "双一流专业", # Col08
    "featuredMajors": "特色专业",           # Col09
    "address": "地址",                      # Col37
    "nationalCode": "国标代码",             # Col11
    "schoolIdentifier": "代码",             # Col10
    "_schoolCode": "院校代码",              # Col41
}


# ---------------------------------------------------------------------------
# Lookup helpers
# ---------------------------------------------------------------------------

_SOURCE_REGISTRY: dict[str, dict] = {
    "A": SOURCE_A_MAP,
    "H": SOURCE_H_MAP,
    "01_score": SOURCE_01_SCORE_MAP,
    "01_plan": SOURCE_01_PLAN_MAP,
    "02_school": SOURCE_02_SCHOOL_MAP,
}


def get_source_map(source_id: str) -> dict:
    """Get column mapping for a source by its ID."""
    return _SOURCE_REGISTRY[source_id]


def list_sources() -> list[str]:
    """List all registered source IDs."""
    return list(_SOURCE_REGISTRY.keys())
