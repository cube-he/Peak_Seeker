# -*- coding: utf-8 -*-
"""Layer 2: 批次映射表 — (录取批次, 招生类型) → batchNodeId。

将招生计划表格中的列对 (录取批次, 招生类型) 解析为 Layer 1 批次树的叶节点 ID。
仅覆盖 dataStatus="has_data" 的 28 个节点；无数据节点不出现在此映射中。

Design doc: docs/superpowers/specs/2026-04-27-three-layer-data-structure-design.md
"""
from __future__ import annotations


class BatchMappingError(KeyError):
    pass


# 28 条目：(录取批次, 招生类型) → batchNodeId
BATCH_MAPPING: dict[tuple[str, str], str] = {
    # 本科提前批次
    ("本科提前批(国家专项)", "国家专项计划"):     "bktqp_gjzx",
    ("本科提前批A段", "军事类"):                  "bktqp_a_js",
    ("本科提前批A段", "公安类、司法类"):           "bktqp_a_gasf",
    ("本科提前批A段", "航海类"):                  "bktqp_a_hh",
    ("本科提前批A段", "消防救援"):                "bktqp_a_xfjy",
    ("本科提前批A段", "高校综合评价"):             "bktqp_a_zhpj",
    ("本科提前批(高校专项)", "高校专项计划"):      "bktqp_gxzx",
    ("本科提前批B段", "国家公费师范生"):           "bktqp_b_gjgfsf",
    ("本科提前批B段", "国家优师专项"):             "bktqp_b_gjyszx",
    ("本科提前批B段", "农村订单定向医学生"):       "bktqp_b_ncddyx",
    ("本科提前批B段", "省级公费师范生"):           "bktqp_b_sjgfsf",
    ("本科提前批B段", "地方优师计划"):             "bktqp_b_dfyszx",
    ("本科提前批B段", "乡村振兴计划"):             "bktqp_b_xczx",
    ("本科提前批B段", "其他"):                    "bktqp_b_qt",
    # 本科批次
    ("本科批A段", "国家专项计划"):                "bkp_a_gjzx",
    ("本科批A段", "地方专项计划"):                "bkp_a_dfzx",
    ("本科批(高校专项)", "高校专项计划"):          "bkp_gxzx",
    ("本科批B段", "普通类本科"):                  "bkp_b_pt",
    ("本科批B段", "本科层次职业教育人才培养改革试点"): "bkp_b_bkzyjy",
    ("本科批B段", "民族班"):                      "bkp_b_mzb",
    ("本科批B段", "非西藏生源定向西藏就业"):       "bkp_b_fxzyx",
    ("本科批B段", "部委属和外省属高校少数民族预科、边防军人子女预科、四川大学国防科研试验基地预科"): "bkp_b_yk",
    ("本科批(区域教育均衡发展专项)", "区域教育均衡发展专项计划"): "bkp_qyjh",
    ("本科批(省属高校少数民族预科)", "省属高校少数民族预科"):     "bkp_sxyk",
    # 高职(专科)提前批次
    ("高职(专科)提前批", "定向培养军士"):          "zktqp_dxpyjs",
    ("高职(专科)提前批", "公安类、司法类"):        "zktqp_gasf",
    ("高职(专科)提前批", "航海类"):               "zktqp_hh",
    # 高职(专科)批次
    ("高职(专科)批", "普通类高职(专科)"):          "zkp_pt",
}


def resolve_batch_node_id(batch: str, enrollment_type: str) -> str:
    """将 (录取批次, 招生类型) 解析为 batchNodeId。

    Raises:
        BatchMappingError: 若组合不在已知映射表中。
    """
    key = (batch, enrollment_type)
    if key not in BATCH_MAPPING:
        raise BatchMappingError(f"Unknown: {key}")
    return BATCH_MAPPING[key]
