# -*- coding: utf-8 -*-
"""
新的征集志愿解析逻辑
适配四川省考试院格式
"""
import re
from typing import List, Dict, Optional
import logging

logger = logging.getLogger(__name__)


def extract_supplementary_rows_v2(items: List[Dict]) -> List[Dict]:
    """
    解析四川省考试院征集志愿格式
    格式特点：
    - 院校行: "0048华中师范大学（湖北省武汉市）"
    - 专业组行: "专业组101（再选科目：不限）" + 右侧计划数
    - 专业行: "18特殊教育（国家公费师范生）" + 右侧计划数 + 收费
    """
    if not items:
        return []

    # 按 y 坐标排序
    items = sorted(items, key=lambda x: x["y"])

    rows = []
    current_university_code = ""
    current_university_name = ""

    # 跳过的关键词
    skip_keywords = [
        "附件", "普通高校", "征集志愿", "请考生", "填报志愿", "相关内容",
        "院校代号、名称", "计划收费", "特别提醒", "院校备注", "历史类",
        "物理类", "公费师范生", "地方优师", "定向医学", "再选科目",
        "专业组", "切忌盲目", "后果自负", "服务县"
    ]

    for item in items:
        text = item["text"]

        # 跳过标题、说明等
        if any(kw in text for kw in skip_keywords):
            continue

        # 跳过纯数字（计划数）、"免费"等
        if re.match(r'^[\d免费]+$', text):
            continue

        # 匹配院校行: "0048华中师范大学（湖北省武汉市）" 或 "5120四川师范大学（四川省成都市）"
        uni_match = re.match(r'^(\d{4})(.+?)[（(](.+?)[省市]', text)
        if uni_match:
            current_university_code = uni_match.group(1)
            current_university_name = uni_match.group(2)
            logger.info(f"  发现院校: {current_university_code} {current_university_name}")
            continue

        # 匹配专业行: "18特殊教育（国家公费师范生）" 或 "7X小学教育（凉山州盐源县）"
        # 专业代号: 1-2位数字，可能带字母
        major_match = re.match(r'^(\d{1,2}[A-Z]?)([一-鿿].+)$', text)
        if major_match and current_university_code:
            major_code = major_match.group(1)
            major_name_raw = major_match.group(2)

            # 清理专业名称，去掉括号内的备注
            major_name = re.split(r'[（(]', major_name_raw)[0].strip()

            if major_name and len(major_name) >= 2:
                rows.append({
                    "university_code": current_university_code,
                    "university_name": current_university_name,
                    "major_code": major_code,
                    "major_name": major_name,
                    "plan_count": 1
                })
                logger.info(f"    专业: {major_code} {major_name}")

    return rows


if __name__ == "__main__":
    # 测试
    test_items = [
        {"y": 100, "text": "0048华中师范大学（湖北省武汉市）"},
        {"y": 120, "text": "专业组101（再选科目：不限）"},
        {"y": 140, "text": "18特殊教育（国家公费师范生）"},
        {"y": 160, "text": "19学前教育（国家公费师范生）"},
    ]
    result = extract_supplementary_rows_v2(test_items)
    print(f"解析结果: {result}")
