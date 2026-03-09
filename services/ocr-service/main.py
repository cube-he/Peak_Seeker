"""
OCR 数据导入微服务

提供 HTTP API，接收目标网页 URL，自动抓取页面、提取图片、OCR 识别、返回结构化数据。
供 NestJS 后端调用。

启动方式:
  cd services/ocr-service
  pip install -r requirements.txt
  python main.py
  # 或
  uvicorn main:app --host 0.0.0.0 --port 8100
"""

import os
import re
import json
import hashlib
import logging
from typing import Optional, List, Tuple, Dict
from enum import Enum
from contextlib import asynccontextmanager

import requests as http_requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import mysql.connector

# OCR 延迟导入（模型加载较慢）
_ocr_instance = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)


# ==================== Pydantic Models ====================

class FetchRequest(BaseModel):
    url: str = Field(..., description="目标网页 URL")
    data_type: str = Field("score_segment", description="数据类型: score_segment / admission")

class FetchResponse(BaseModel):
    url: str
    title: str
    image_urls: List[str]
    image_count: int

class OcrRequest(BaseModel):
    image_urls: List[str] = Field(..., description="图片 URL 列表")
    data_type: str = Field("score_segment", description="数据类型: score_segment / supplementary")
    year: int = Field(..., description="年份")
    province: str = Field("四川", description="省份")
    exam_type: str = Field("物理类", description="考试类型")
    batch: str = Field("本科一批", description="批次（征集志愿用）")
    # AI 校验选项
    enable_ai: bool = Field(False, description="是否启用 AI 校验")
    ai_api_key: str = Field("", description="AI API 密钥")
    ai_base_url: str = Field("", description="AI API 基础 URL")
    ai_model: str = Field("", description="AI 模型名称")

class ScoreRow(BaseModel):
    score: int
    count: int
    cumulative_count: int


class SupplementaryRow(BaseModel):
    """征集志愿数据行 - 完整结构"""
    exam_type: str = ""           # 考试类型：历史类/物理类
    enrollment_type: str = ""     # 招生类型：国家公费师范生、地方优师专项等
    university_code: str          # 院校代码：4位
    university_name: str          # 院校名称
    university_location: str = "" # 院校地址
    university_note: str = ""     # 院校备注
    major_group_code: str = ""    # 专业组代码：3位如101
    major_group_subject: str = "" # 再选科目要求
    major_group_plan: int = 0     # 专业组计划数
    major_code: str               # 专业代码：2位
    major_name: str               # 专业名称
    major_note: str = ""          # 专业备注（如：国家公费师范生）
    plan_count: int               # 专业计划数
    tuition: str = ""             # 收费标准


class OcrResponse(BaseModel):
    total_rows: int
    score_range: str = ""
    is_valid: bool
    errors: List[str]
    data: List[ScoreRow] = []


class SupplementaryOcrResponse(BaseModel):
    """征集志愿 OCR 响应"""
    total_rows: int
    university_count: int
    major_group_count: int = 0
    is_valid: bool
    errors: List[str]
    data: List[SupplementaryRow]


class ConflictItem(BaseModel):
    """冲突项"""
    ocr: SupplementaryRow
    ai: SupplementaryRow
    diff: Dict[str, bool]


class CompareResult(BaseModel):
    """OCR 与 AI 比较结果"""
    matched: List[SupplementaryRow]
    ocr_only: List[SupplementaryRow]
    ai_only: List[SupplementaryRow]
    conflicts: List[ConflictItem]
    summary: Dict[str, int]


class SupplementaryOcrWithAIResponse(BaseModel):
    """带 AI 校验的征集志愿 OCR 响应"""
    total_rows: int
    university_count: int
    is_valid: bool
    errors: List[str]
    data: List[SupplementaryRow]
    # AI 校验结果
    ai_enabled: bool = False
    comparison: Optional[CompareResult] = None
    conflicts_count: int = 0
    needs_review: bool = False

class SaveRequest(BaseModel):
    year: int
    province: str = "四川"
    exam_type: str = "物理类"
    data_type: str = "score_segment"
    data: List[ScoreRow]
    db_url: str = Field(..., description="MySQL 连接字符串")


class SaveSupplementaryRequest(BaseModel):
    """保存征集志愿数据请求"""
    year: int
    province: str = "四川"
    exam_type: str = "物理类"
    batch: str = "本科一批"
    data: List[SupplementaryRow]
    db_url: str = Field(..., description="MySQL 连接字符串")


class AiVerifySingleRequest(BaseModel):
    """单张图片 AI 验证请求"""
    image_url: str = Field(..., description="图片 URL")
    ocr_data: List[SupplementaryRow] = Field(default=[], description="该图片的 OCR 识别数据")
    year: int = Field(..., description="年份")
    province: str = Field("四川", description="省份")
    exam_type: str = Field("物理类", description="考试类型")
    batch: str = Field("本科一批", description="批次")
    ai_api_key: str = Field("", description="AI API 密钥")
    ai_base_url: str = Field("", description="AI API 基础 URL")
    ai_model: str = Field("", description="AI 模型名称")


class VerifyStatus(str, Enum):
    """校验状态"""
    MATCHED = "matched"          # AI 与 OCR 一致
    CONFLICT = "conflict"        # AI 与 OCR 冲突
    AI_ONLY = "ai_only"          # 仅 AI 识别到
    OCR_ONLY = "ocr_only"        # 仅 OCR 识别到
    TIMEOUT = "timeout"          # AI 超时
    ERROR = "error"              # AI 错误


class VerifiedRow(BaseModel):
    """带校验状态的数据行"""
    data: SupplementaryRow
    status: VerifyStatus
    ai_data: Optional[SupplementaryRow] = None  # 冲突时的 AI 数据
    diff_fields: List[str] = []  # 冲突的字段


class AiVerifySingleResponse(BaseModel):
    """单张图片 AI 验证响应"""
    verified_rows: List[VerifiedRow]
    summary: Dict[str, int]  # 各状态的数量统计
    ai_raw_count: int  # AI 原始识别数量
    error_message: str = ""  # 错误信息（超时等）


class SaveResponse(BaseModel):
    success: bool
    affected_rows: int
    message: str


# ==================== OCR Engine ====================

def get_ocr():
    global _ocr_instance
    if _ocr_instance is None:
        logger.info("正在加载 RapidOCR 模型...")
        from rapidocr_onnxruntime import RapidOCR
        _ocr_instance = RapidOCR()
        logger.info("RapidOCR 模型加载完成")
    return _ocr_instance


def download_image(url: str) -> str:
    """下载图片到缓存目录，返回本地路径"""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    ext = os.path.splitext(url.split("?")[0])[-1] or ".jpg"
    filepath = os.path.join(CACHE_DIR, f"{url_hash}{ext}")

    if os.path.exists(filepath):
        return filepath

    logger.info(f"下载图片: {url}")
    resp = http_requests.get(url, timeout=30, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": url.split("/Upload")[0] + "/" if "/Upload" in url else "",
    })
    resp.raise_for_status()
    with open(filepath, "wb") as f:
        f.write(resp.content)
    return filepath


def extract_score_rows(img_path: str) -> List[Tuple[int, int, int]]:
    """OCR 识别单张图片，提取一分一段表数据"""
    ocr = get_ocr()
    result, _ = ocr(img_path)

    if not result:
        return []

    # 收集识别结果: (y_center, x_center, text)
    items = []
    for box, text, confidence in result:
        y_center = (box[0][1] + box[2][1]) / 2
        x_center = (box[0][0] + box[2][0]) / 2
        items.append((y_center, x_center, text.strip(), confidence))

    # 按 y 坐标分组为行（同行 y 差 < 30px）
    items.sort(key=lambda x: x[0])
    row_groups = []
    current_group = [items[0]]

    for item in items[1:]:
        if abs(item[0] - current_group[-1][0]) < 30:
            current_group.append(item)
        else:
            row_groups.append(current_group)
            current_group = [item]
    row_groups.append(current_group)

    # 解析每行
    rows = []
    for group in row_groups:
        group.sort(key=lambda x: x[1])  # 按 x 排序

        nums = []
        for _, _, text, _ in group:
            digits = re.findall(r'\d+', text)
            if digits:
                nums.append(int(digits[0]))

        if len(nums) == 3:
            score, count, cumulative = nums
            if 100 <= score <= 750 and count >= 0 and cumulative >= 0:
                rows.append((score, count, cumulative))
        elif len(nums) == 2:
            # 人数为0时 OCR 可能漏掉
            positions = []
            for _, x, text, _ in group:
                digits = re.findall(r'\d+', text)
                if digits:
                    positions.append((x, int(digits[0])))
            if len(positions) == 2:
                positions.sort(key=lambda p: p[0])
                x1, v1 = positions[0]
                x2, v2 = positions[1]
                if x1 < 300 and x2 > 500 and 100 <= v1 <= 750:
                    rows.append((v1, 0, v2))

    return rows


def deduplicate_and_sort(rows: List[tuple]) -> List[tuple]:
    """去重并按分数降序"""
    score_map = {}
    for score, count, cumulative in rows:
        if score not in score_map or cumulative >= score_map[score][1]:
            score_map[score] = (count, cumulative)

    result = [(s, d[0], d[1]) for s, d in score_map.items()]
    result.sort(key=lambda x: x[0], reverse=True)
    return result


# ==================== 征集志愿 OCR ====================

def extract_supplementary_rows(img_path: str) -> List[Dict]:
    """
    OCR 识别四川省考试院征集志愿格式

    数据层级结构：
    1. 考试类型: "一、历史类" / "二、物理类"
    2. 招生类型: "(1)国家公费师范生" / "(2)地方优师专项"
    3. 院校: "0048华中师范大学（湖北省武汉市）" + 院校备注
    4. 专业组: "专业组101（再选科目：不限）" + 专业组计划数
    5. 专业: "18特殊教育（国家公费师范生）" + 计划数 + 收费
    """
    ocr = get_ocr()
    result, _ = ocr(img_path)

    logger.info(f"OCR 原始结果数量: {len(result) if result else 0}")

    if not result:
        return []

    # 获取图片宽度，用于计算 X 坐标的相对位置
    # 通过所有文本框的最大 x_right 来估算图片宽度
    max_x_right = max(box[2][0] for box, _, _ in result)
    img_width = max_x_right * 1.05  # 留一点边距
    logger.info(f"估算图片宽度: {img_width:.0f}px")

    # 收集识别结果，按 y 坐标分组为行
    items = []
    for box, text, confidence in result:
        y_center = (box[0][1] + box[2][1]) / 2
        x_left = box[0][0]
        x_right = box[2][0]
        items.append({
            "y": y_center,
            "x_left": x_left,
            "x_right": x_right,
            "text": text.strip()
        })

    # 按 y 坐标分组为行（同行 y 差 < 12px，更精确的阈值）
    items.sort(key=lambda x: x["y"])
    row_groups = []
    current_group = [items[0]]

    for item in items[1:]:
        if abs(item["y"] - current_group[-1]["y"]) < 12:
            current_group.append(item)
        else:
            row_groups.append(current_group)
            current_group = [item]
    row_groups.append(current_group)

    # 调试：打印分组结果
    for i, group in enumerate(row_groups):
        group.sort(key=lambda x: x["x_left"])
        texts = [item["text"] for item in group]
        logger.info(f"[{i:2d}] {texts}")

    rows = []
    # 当前上下文
    current_exam_type = ""        # 历史类/物理类
    current_enrollment_type = ""  # 国家公费师范生/地方优师专项
    current_university = {}       # 院校信息
    current_major_group = {}      # 专业组信息

    for group in row_groups:
        group.sort(key=lambda x: x["x_left"])
        first_text = group[0]["text"] if group else ""
        all_text = " ".join([item["text"] for item in group])

        # 1. 检测考试类型: "一、历史类" 或 "二、物理类"
        if re.search(r'[一二三]、\s*历史类', all_text) or (
            "历史类" in all_text and "物理类" not in all_text and len(all_text) < 20
        ):
            current_exam_type = "历史类"
            logger.info(f">>> 考试类型: 历史类")
            continue
        if re.search(r'[一二三]、\s*物理类', all_text) or (
            "物理类" in all_text and "历史类" not in all_text and len(all_text) < 20
        ):
            current_exam_type = "物理类"
            logger.info(f">>> 考试类型: 物理类")
            continue

        # 2. 检测招生类型: "(1)国家公费师范生" 或 "(5)其他"
        # 注意：只匹配独立的招生类型行，格式必须是 (数字) 开头
        # 不能匹配专业行如 "19德语"
        # 支持中文括号（）和英文括号()
        # 支持 1-2 位数字序号，如 (1)、(10)
        enroll_match = re.match(r'^[（(](\d{1,2})[）)]\s*(.*)$', first_text.strip())
        if enroll_match and len(first_text) < 20:
            enrollment_name = enroll_match.group(2).strip()
            # 如果括号后没有文字，尝试从同行其他文本获取
            if not enrollment_name and len(group) > 1:
                for item in group[1:]:
                    txt = item["text"].strip()
                    if txt and not re.match(r'^\d+$', txt):
                        enrollment_name = txt
                        break
            # 如果还是空，用序号作为标识
            if not enrollment_name:
                enrollment_name = f"类型{enroll_match.group(1)}"
            # 跳过不是招生类型的行
            if enrollment_name and not any(kw in enrollment_name for kw in ["院校", "专业", "计划收费"]):
                current_enrollment_type = enrollment_name
                logger.info(f">>> 招生类型: {current_enrollment_type}")
                continue

        # 跳过标题行
        skip_keywords = ["附件", "普通高校", "征集志愿", "请考生", "填报志愿",
                        "院校代号、名称", "计划收费", "特别提醒", "切忌盲目",
                        "后果自负", "专业代号", "特别提醒"]
        if any(kw in all_text for kw in skip_keywords):
            continue

        # 3. 检测院校备注: "院校备注：..."
        if "院校备注" in first_text or first_text.startswith("院校备注"):
            note = re.sub(r'^院校备注[：:]\s*', '', all_text)
            current_university["note"] = note
            logger.info(f"    院校备注: {note[:30]}...")
            continue

        # 4. 检测院校行: "0048华中师范大学（湖北省武汉市）"
        uni_match = re.match(r'^(\d{4})([一-鿿]+(?:大学|学院|学校)[一-鿿]*)[（(]([^）)]+)[）)]', first_text)
        if uni_match:
            current_university = {
                "code": uni_match.group(1),
                "name": uni_match.group(2),
                "location": uni_match.group(3),
                "note": ""
            }
            current_major_group = {}  # 重置专业组
            logger.info(f">>> 院校: {current_university['code']} {current_university['name']}")
            continue

        # 5. 检测专业组行: "专业组101（再选科目：不限）" + 右侧计划数
        group_match = re.search(r'专业组\s*(\d{3})[（(]再选科目[：:]\s*([^）)]+)[）)]', all_text)
        if group_match:
            group_plan = 0
            # 提取专业组计划数（通常在行末尾的数字）
            for item in reversed(group):
                num_match = re.match(r'^(\d+)$', item["text"])
                if num_match:
                    val = int(num_match.group(1))
                    if 1 <= val <= 100:  # 合理的计划数范围
                        group_plan = val
                        break

            current_major_group = {
                "code": group_match.group(1),
                "subject": group_match.group(2),
                "plan": group_plan
            }
            logger.info(f"  >> 专业组: {current_major_group['code']} 计划:{current_major_group['plan']}")
            continue

        # 6. 检测专业行: "18特殊教育（国家公费师范生）" + 计划数 + 收费
        # 专业代码格式多样：
        # - 纯数字: 18, 72
        # - 数字+字母: 7S, 4E
        # - 字母+字母: BL, BG (省级公费师范生常见)
        # - 字母+数字: K1, J4
        # - 带[V]标记: G7[V], H3[V] (农村订单定向医学生)

        # 先排除续行数据格式：数字+收费信息（如 "2免费"、"1 6000"）
        # 这些是上一行专业的计划数和学费，不是新专业
        is_continuation_line = re.match(r'^\d{1,2}(免费|元|\d{4,})?\s*$', first_text.strip())

        major_match = None
        if not is_continuation_line:
            major_match = re.match(r'^([A-Z0-9]{1,2}[A-Z0-9]?)(\[V\])?([一-鿿]{2,}[一-鿿\w（()）)、]*)', first_text)

        if major_match and current_university.get("code"):
            major_code = major_match.group(1)
            if major_match.group(2):  # 有[V]标记
                major_code += major_match.group(2)
            major_full = major_match.group(3)

            # 检查是否有未闭合的括号（跨行情况）
            # 如果专业名称以未闭合的括号结尾，需要从下一行获取计划数
            open_parens = major_full.count('（') + major_full.count('(')
            close_parens = major_full.count('）') + major_full.count(')')
            is_incomplete = open_parens > close_parens

            # 分离专业名称和备注
            # 匹配第一个完整的括号对作为备注
            name_note_match = re.match(r'^([^（(]+)[（(]([^）)]+)[）)]', major_full)
            if name_note_match:
                major_name = name_note_match.group(1).strip()
                major_note = name_note_match.group(2).strip()
            else:
                # 如果没有完整括号，取括号前的部分作为名称
                major_name = re.split(r'[（(]', major_full)[0].strip()
                major_note = ""

            # 跳过无效专业名
            if len(major_name) < 2:
                continue

            # 提取计划数和收费
            # 策略：使用 X 坐标的相对位置来定位右侧区域的数据
            # - 右侧 30% 区域（x > 70% 图片宽度）通常是计划数和收费
            # - 计划数在左，收费在右
            plan_count = 1  # 默认计划数为1
            tuition = ""

            # 定义右侧区域阈值（图片宽度的 60%）
            right_zone_threshold = img_width * 0.60

            # 收集右侧区域的数据
            right_zone_items = []  # (x, text, value_or_none)
            for item in group[1:]:  # 跳过第一个（专业名称）
                txt = item["text"]
                x = item["x_left"]

                # 只处理右侧区域的数据
                if x < right_zone_threshold:
                    continue

                # "数字免费" 格式（如 "2免费"）
                num_free_match = re.match(r'^(\d+)(免费)$', txt)
                if num_free_match:
                    plan_count = int(num_free_match.group(1))
                    tuition = "免费"
                    continue

                # 纯收费信息
                if txt == "免费":
                    right_zone_items.append((x, txt, None))
                    continue
                if "元" in txt:
                    right_zone_items.append((x, txt, None))
                    continue

                # 纯数字
                num_match = re.match(r'^(\d+)$', txt)
                if num_match:
                    val = int(num_match.group(1))
                    right_zone_items.append((x, txt, val))

            # 按 X 坐标排序右侧区域的数据
            right_zone_items.sort(key=lambda item: item[0])

            # 解析右侧区域数据
            numbers = [(x, val, txt) for x, txt, val in right_zone_items if val is not None]
            tuition_items = [(x, txt) for x, txt, val in right_zone_items if val is None]

            # 处理收费信息
            for _, txt in tuition_items:
                if txt == "免费":
                    tuition = "免费"
                elif "元" in txt:
                    tuition = txt

            # 根据数字数量决定如何解析
            if len(numbers) >= 2:
                # 有两个或更多数字，按 X 坐标排序
                numbers.sort(key=lambda n: n[0])
                plan_count = numbers[0][1]  # 左边是计划数
                if not tuition:  # 如果还没有收费信息
                    tuition = f"{numbers[-1][1]}元"  # 右边是收费
            elif len(numbers) == 1:
                val = numbers[0][1]
                txt = numbers[0][2]
                x = numbers[0][0]

                # 检查是否是 OCR 把 "计划数+学费" 识别成了一个数字
                # 例如 "1 6875" 被识别为 "16875"
                if len(txt) == 5 and val >= 10000:
                    # 5位数字，尝试拆分：第1位是计划数，后4位是学费
                    first_digit = int(txt[0])
                    last_four = int(txt[1:])
                    # 常见学费范围：3000-9999
                    if 1 <= first_digit <= 9 and 3000 <= last_four <= 9999:
                        plan_count = first_digit
                        tuition = f"{last_four}元"
                        logger.info(f"      拆分数字: {txt} -> 计划数={plan_count}, 学费={tuition}")
                    else:
                        tuition = f"{val}元"
                elif len(txt) == 6 and val >= 100000:
                    # 6位数字，尝试拆分：前2位是计划数，后4位是学费
                    first_two = int(txt[:2])
                    last_four = int(txt[2:])
                    if 1 <= first_two <= 99 and 3000 <= last_four <= 9999:
                        plan_count = first_two
                        tuition = f"{last_four}元"
                        logger.info(f"      拆分数字: {txt} -> 计划数={plan_count}, 学费={tuition}")
                    else:
                        tuition = f"{val}元"
                elif val > 100:
                    # 大数字是收费
                    if not tuition:
                        tuition = f"{val}元"
                else:
                    # 小数字是计划数
                    plan_count = val

            row = {
                "exam_type": current_exam_type,
                "enrollment_type": current_enrollment_type,
                "university_code": current_university.get("code", ""),
                "university_name": current_university.get("name", ""),
                "university_location": current_university.get("location", ""),
                "university_note": current_university.get("note", ""),
                "major_group_code": current_major_group.get("code", ""),
                "major_group_subject": current_major_group.get("subject", ""),
                "major_group_plan": current_major_group.get("plan", 0),
                "major_code": major_code,
                "major_name": major_name,
                "major_note": major_note,
                "plan_count": plan_count,
                "tuition": tuition,
                "_incomplete": is_incomplete  # 标记是否需要从下一行获取计划数
            }

            # 如果专业组计划数为0但专业计划数有值，更新专业组计划数
            # （有些格式下专业组计划数在专业行而不是专业组行）
            if current_major_group.get("plan", 0) == 0 and plan_count > 0:
                current_major_group["plan"] = plan_count
                row["major_group_plan"] = plan_count

            rows.append(row)
            logger.info(f"    专业: {major_code} {major_name} 计划:{plan_count} {tuition}" +
                       (" [跨行]" if is_incomplete else ""))
            continue

        # 7. 处理跨行专业的续行（包含计划数和收费）
        # 如果上一条记录标记为 incomplete，尝试从当前行提取计划数
        if rows and rows[-1].get("_incomplete"):
            # 使用 X 坐标的相对位置来定位右侧区域的数据
            right_zone_items = []  # (x, text, value_or_none)

            for item in group:
                txt = item["text"]
                x = item["x_left"]

                # 只处理右侧区域的数据（图片宽度的 60% 以右）
                if x < img_width * 0.60:
                    continue

                # "数字免费" 格式
                num_free_match = re.match(r'^(\d+)(免费)$', txt)
                if num_free_match:
                    rows[-1]["plan_count"] = int(num_free_match.group(1))
                    rows[-1]["tuition"] = "免费"
                    rows[-1]["_incomplete"] = False
                    logger.info(f"      续行: 计划数={rows[-1]['plan_count']} 收费={rows[-1]['tuition']}")
                    continue

                # 纯收费信息
                if txt == "免费":
                    right_zone_items.append((x, txt, None))
                    continue
                if "元" in txt:
                    right_zone_items.append((x, txt, None))
                    continue

                # 纯数字
                num_match = re.match(r'^(\d+)$', txt)
                if num_match:
                    val = int(num_match.group(1))
                    right_zone_items.append((x, txt, val))

            # 按 X 坐标排序
            right_zone_items.sort(key=lambda item: item[0])

            # 解析右侧区域数据
            numbers = [(x, val, txt) for x, txt, val in right_zone_items if val is not None]
            tuition_items = [(x, txt) for x, txt, val in right_zone_items if val is None]

            # 处理收费信息
            for _, txt in tuition_items:
                if txt == "免费":
                    rows[-1]["tuition"] = "免费"
                elif "元" in txt:
                    rows[-1]["tuition"] = txt

            # 根据数字数量决定如何解析
            if len(numbers) >= 2:
                numbers.sort(key=lambda n: n[0])
                rows[-1]["plan_count"] = numbers[0][1]
                if not rows[-1].get("tuition"):
                    rows[-1]["tuition"] = f"{numbers[-1][1]}元"
                rows[-1]["_incomplete"] = False
                logger.info(f"      续行: 计划数={rows[-1]['plan_count']} 收费={rows[-1]['tuition']}")
            elif len(numbers) == 1:
                val = numbers[0][1]
                txt = numbers[0][2]
                # 检查是否是 OCR 把 "计划数+学费" 识别成了一个数字
                if len(txt) == 5 and val >= 10000:
                    first_digit = int(txt[0])
                    last_four = int(txt[1:])
                    if 1 <= first_digit <= 9 and 3000 <= last_four <= 9999:
                        rows[-1]["plan_count"] = first_digit
                        rows[-1]["tuition"] = f"{last_four}元"
                        logger.info(f"      续行拆分: {txt} -> 计划数={first_digit}, 学费={last_four}元")
                    else:
                        rows[-1]["tuition"] = f"{val}元"
                elif len(txt) == 6 and val >= 100000:
                    first_two = int(txt[:2])
                    last_four = int(txt[2:])
                    if 1 <= first_two <= 99 and 3000 <= last_four <= 9999:
                        rows[-1]["plan_count"] = first_two
                        rows[-1]["tuition"] = f"{last_four}元"
                        logger.info(f"      续行拆分: {txt} -> 计划数={first_two}, 学费={last_four}元")
                    else:
                        rows[-1]["tuition"] = f"{val}元"
                elif val > 100:
                    if not rows[-1].get("tuition"):
                        rows[-1]["tuition"] = f"{val}元"
                else:
                    rows[-1]["plan_count"] = val
                rows[-1]["_incomplete"] = False
                logger.info(f"      续行: 计划数={rows[-1]['plan_count']} 收费={rows[-1]['tuition']}")

    # 清理临时字段
    for row in rows:
        row.pop("_incomplete", None)

    logger.info(f"解析完成，共 {len(rows)} 条记录")
    return rows


def parse_supplementary_row(group: List[Dict]) -> Optional[Dict]:
    """
    解析单行征集志愿数据
    表格结构: 院校代号 | 院校名称 | 专业代号 | 专业名称 | 收费标准 | 征集计划数 | 备注
    """
    if len(group) < 4:
        return None

    # 按 x 坐标排序
    group.sort(key=lambda x: x["x"])

    # 提取所有文本和位置
    cells = [(item["x"], item["text"].strip()) for item in group]
    cells = [(x, t) for x, t in cells if t]  # 过滤空文本

    if len(cells) < 4:
        return None

    university_code = ""
    university_name = ""
    major_code = ""
    major_name = ""
    plan_count = 0

    # 收集所有数字和中文文本
    numbers = []  # (index, x, text, value)
    chinese_texts = []  # (index, x, text)

    for i, (x, text) in enumerate(cells):
        # 纯数字
        if re.match(r'^\d+$', text):
            numbers.append((i, x, text, int(text)))
        # 包含中文
        elif re.search(r'[一-鿿]', text):
            chinese_texts.append((i, x, text))

    # 解析策略：
    # 1. 院校代号：4位数字，位置靠前
    # 2. 专业代号：2位数字，在院校代号之后
    # 3. 征集计划数：1-3位数字，位置靠后
    # 4. 院校名称：第一个中文文本
    # 5. 专业名称：第二个中文文本

    # 按位置排序数字
    numbers.sort(key=lambda x: x[1])

    for idx, x, text, value in numbers:
        if not university_code and len(text) == 4 and 1000 <= value <= 9999:
            # 4位数字 -> 院校代号
            university_code = text
        elif university_code and not major_code and len(text) <= 3:
            # 院校代号之后的短数字 -> 专业代号
            major_code = text
        elif university_code and major_code and 1 <= value <= 999:
            # 后面的小数字 -> 计划数（取最后一个符合条件的）
            plan_count = value

    # 按位置排序中文文本
    chinese_texts.sort(key=lambda x: x[1])

    for idx, x, text in chinese_texts:
        # 跳过收费标准（通常包含"元"或纯数字开头）
        if "元" in text or re.match(r'^\d', text):
            continue
        # 跳过备注类文本
        if any(kw in text for kw in ["详见", "以", "按", "见"]):
            continue

        if not university_name:
            university_name = text
        elif not major_name:
            major_name = text

    # 验证必要字段
    if university_code and university_name and major_name:
        return {
            "university_code": university_code,
            "university_name": university_name,
            "major_code": major_code or "00",
            "major_name": major_name,
            "plan_count": plan_count
        }

    return None


def merge_supplementary_rows(rows: List[Dict]) -> List[Dict]:
    """
    合并和去重征集志愿数据
    处理同一院校多个专业的情况
    保持原始顺序，不排序
    """
    # 按院校代码+专业代码去重，保持原始顺序
    seen = set()
    unique_rows = []

    for row in rows:
        key = f"{row['university_code']}_{row['major_code']}_{row['major_name']}"
        if key not in seen:
            seen.add(key)
            unique_rows.append(row)

    # 不排序，保持原始顺序方便校验
    return unique_rows


def validate_supplementary_data(rows: List[Dict]) -> Tuple[bool, List[str]]:
    """校验征集志愿数据"""
    errors = []

    if not rows:
        return False, ["没有识别到任何数据"]

    # 检查必要字段
    for i, row in enumerate(rows):
        if not row.get("university_code"):
            errors.append(f"第 {i+1} 行: 缺少院校代码")
        if not row.get("university_name"):
            errors.append(f"第 {i+1} 行: 缺少院校名称")
        if not row.get("major_name"):
            errors.append(f"第 {i+1} 行: 缺少专业名称")

    # 检查院校代码格式
    for row in rows:
        code = row.get("university_code", "")
        if code and not re.match(r'^\d{4,5}$', code):
            errors.append(f"院校代码格式异常: {code}")

    return len(errors) == 0, errors[:10]  # 最多返回10条错误


def fill_missing_scores(rows: List[tuple]) -> List[tuple]:
    """填补缺失分数点"""
    if not rows:
        return rows

    score_map = {r[0]: (r[1], r[2]) for r in rows}
    max_score = rows[0][0]
    min_score = rows[-1][0]

    filled = []
    prev_cumulative = 0
    for score in range(max_score, min_score - 1, -1):
        if score in score_map:
            count, cumulative = score_map[score]
            filled.append((score, count, cumulative))
            prev_cumulative = cumulative
        else:
            filled.append((score, 0, prev_cumulative))

    return filled


def validate_data(rows: List[tuple]) -> Tuple[bool, List[str]]:
    """校验数据完整性"""
    errors = []
    if not rows:
        return False, ["没有识别到任何数据"]

    max_score = rows[0][0]
    min_score = rows[-1][0]

    # 分数连续性
    score_set = set(r[0] for r in rows)
    missing = [s for s in range(max_score, min_score - 1, -1) if s not in score_set]
    if missing:
        errors.append(f"缺失 {len(missing)} 个分数点")

    # 累计人数单调递增
    for i in range(1, len(rows)):
        if rows[i][2] < rows[i - 1][2]:
            errors.append(f"分数 {rows[i][0]}: 累计人数不单调 ({rows[i][2]} < {rows[i-1][2]})")

    # 人数与累计人数一致性
    for i in range(1, len(rows)):
        expected = rows[i - 1][2] + rows[i][1]
        if abs(rows[i][2] - expected) > 1:
            errors.append(f"分数 {rows[i][0]}: 累计人数不一致")

    return len(errors) == 0, errors


# ==================== Web Scraping ====================

def fetch_page_images(url: str) -> Tuple[str, List[str]]:
    """
    抓取目标网页，提取页面中的图片 URL。
    针对四川教育考试院的页面结构优化。
    """
    logger.info(f"抓取页面: {url}")
    resp = http_requests.get(url, timeout=30, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    })
    resp.raise_for_status()
    resp.encoding = resp.apparent_encoding or "utf-8"

    soup = BeautifulSoup(resp.text, "lxml")
    title = soup.title.string.strip() if soup.title and soup.title.string else "未知标题"

    # 提取正文区域的图片（sceea.cn 的文章内容通常在特定容器中）
    image_urls = []

    # 策略1: 查找文章正文区域
    content_area = (
        soup.select_one(".news_content") or
        soup.select_one(".content") or
        soup.select_one("#content") or
        soup.select_one("article") or
        soup.select_one(".main-content") or
        soup.select_one(".TRS_Editor") or
        soup.body
    )

    if content_area:
        for img in content_area.find_all("img"):
            src = img.get("src") or img.get("data-src") or ""
            if not src:
                continue

            # 转为绝对 URL
            if src.startswith("//"):
                src = "https:" + src
            elif src.startswith("/"):
                from urllib.parse import urljoin
                src = urljoin(url, src)
            elif not src.startswith("http"):
                from urllib.parse import urljoin
                src = urljoin(url, src)

            # 过滤掉小图标、logo 等
            if any(kw in src.lower() for kw in ["logo", "icon", "banner", "ad_", "advertisement"]):
                continue

            image_urls.append(src)

    # 去重保持顺序
    seen = set()
    unique_urls = []
    for u in image_urls:
        if u not in seen:
            seen.add(u)
            unique_urls.append(u)

    logger.info(f"页面标题: {title}, 找到 {len(unique_urls)} 张图片")
    return title, unique_urls


# ==================== Database ====================

def parse_db_url(db_url: str) -> Dict:
    """解析 MySQL 连接字符串"""
    match = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+?)(\?.*)?$', db_url)
    if not match:
        raise ValueError(f"无法解析数据库 URL: {db_url}")
    return {
        "user": match.group(1),
        "password": match.group(2),
        "host": match.group(3),
        "port": int(match.group(4)),
        "database": match.group(5),
    }


def save_score_segments(rows: List[dict], year: int, province: str, exam_type: str, db_url: str) -> int:
    """写入一分一段表数据"""
    db_config = parse_db_url(db_url)
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    sql = """
    INSERT INTO score_segments (year, province, exam_type, score, count, cumulative_count, created_at, updated_at)
    VALUES (%s, %s, %s, %s, %s, %s, NOW(), NOW())
    ON DUPLICATE KEY UPDATE
        count = VALUES(count),
        cumulative_count = VALUES(cumulative_count),
        updated_at = NOW()
    """

    batch = [(year, province, exam_type, r["score"], r["count"], r["cumulative_count"]) for r in rows]
    cursor.executemany(sql, batch)
    conn.commit()
    affected = cursor.rowcount
    cursor.close()
    conn.close()
    return affected


def save_supplementary_plans(
    rows: List[dict], year: int, province: str, exam_type: str, batch: str, db_url: str
) -> Tuple[int, int, int]:
    """
    保存征集志愿数据到数据库
    返回: (新增院校数, 新增专业数, 新增招生计划数)
    """
    db_config = parse_db_url(db_url)
    conn = mysql.connector.connect(**db_config)
    cursor = conn.cursor()

    new_universities = 0
    new_majors = 0
    new_plans = 0

    for row in rows:
        # 1. 查找或创建院校
        cursor.execute(
            "SELECT id FROM universities WHERE code = %s",
            (row["university_code"],)
        )
        result = cursor.fetchone()
        if result:
            university_id = result[0]
        else:
            cursor.execute(
                """INSERT INTO universities (name, code, province, created_at, updated_at)
                   VALUES (%s, %s, %s, NOW(), NOW())""",
                (row["university_name"], row["university_code"], province)
            )
            university_id = cursor.lastrowid
            new_universities += 1

        # 2. 查找或创建专业
        cursor.execute(
            "SELECT id FROM majors WHERE code = %s AND name = %s",
            (row["major_code"], row["major_name"])
        )
        result = cursor.fetchone()
        if result:
            major_id = result[0]
        else:
            cursor.execute(
                """INSERT INTO majors (name, code, created_at, updated_at)
                   VALUES (%s, %s, NOW(), NOW())""",
                (row["major_name"], row["major_code"])
            )
            major_id = cursor.lastrowid
            new_majors += 1

        # 3. 插入或更新招生计划
        cursor.execute(
            """INSERT INTO enrollment_plans
               (university_id, major_id, year, province, batch, plan_count, plan_notes, created_at, updated_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
               ON DUPLICATE KEY UPDATE
                   plan_count = VALUES(plan_count),
                   plan_notes = VALUES(plan_notes),
                   updated_at = NOW()""",
            (university_id, major_id, year, province, batch, row["plan_count"], "征集志愿")
        )
        if cursor.rowcount > 0:
            new_plans += 1

    conn.commit()
    cursor.close()
    conn.close()

    return new_universities, new_majors, new_plans


# ==================== FastAPI App ====================

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("OCR 微服务启动中...")
    # 预加载 OCR 模型
    get_ocr()
    logger.info("OCR 微服务就绪")
    yield
    logger.info("OCR 微服务关闭")

app = FastAPI(
    title="OCR 数据导入服务",
    description="从教育考试院网页提取数据的 OCR 微服务",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok", "ocr_loaded": _ocr_instance is not None}


@app.post("/fetch", response_model=FetchResponse)
def fetch_page(req: FetchRequest):
    """抓取目标网页，提取图片 URL 列表"""
    try:
        title, image_urls = fetch_page_images(req.url)
        return FetchResponse(
            url=req.url,
            title=title,
            image_urls=image_urls,
            image_count=len(image_urls),
        )
    except Exception as e:
        logger.error(f"抓取失败: {e}")
        raise HTTPException(status_code=400, detail=f"抓取页面失败: {str(e)}")


@app.post("/ocr")
def run_ocr(req: OcrRequest):
    """下载图片并执行 OCR 识别，支持一分一段表和征集志愿"""
    try:
        if req.data_type == "supplementary":
            return run_supplementary_ocr(req)
        else:
            return run_score_segment_ocr(req)
    except Exception as e:
        logger.error(f"OCR 失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR 识别失败: {str(e)}")


@app.post("/ocr-with-ai")
async def run_ocr_with_ai(req: OcrRequest):
    """下载图片并执行 OCR + AI 双重识别（仅支持征集志愿）"""
    try:
        if req.data_type != "supplementary":
            raise HTTPException(status_code=400, detail="AI 校验仅支持征集志愿数据")
        return await run_supplementary_ocr_with_ai(req)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"OCR+AI 失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR+AI 识别失败: {str(e)}")


@app.post("/ai-verify-single", response_model=AiVerifySingleResponse)
async def ai_verify_single(req: AiVerifySingleRequest):
    """
    单张图片 AI 验证（用于逐张校验）

    对比 AI 识别结果与 OCR 数据，返回带状态标记的结果：
    - matched: AI 与 OCR 一致
    - conflict: AI 与 OCR 冲突（需人工审核）
    - ai_only: 仅 AI 识别到（OCR 可能漏识别）
    - ocr_only: 仅 OCR 识别到（AI 可能漏识别）
    - timeout: AI 请求超时
    - error: AI 请求错误
    """
    from ai_parser import parse_image_with_ai, normalize_tuition

    verified_rows: List[VerifiedRow] = []
    summary = {
        "matched": 0,
        "conflict": 0,
        "ai_only": 0,
        "ocr_only": 0,
        "timeout": 0,
        "error": 0
    }
    ai_raw_count = 0
    error_message = ""

    # OCR 数据转为字典列表
    ocr_rows = [row.model_dump() for row in req.ocr_data]

    # 如果没有 AI 密钥，所有 OCR 数据标记为 ocr_only
    if not req.ai_api_key:
        for ocr_row in req.ocr_data:
            verified_rows.append(VerifiedRow(
                data=ocr_row,
                status=VerifyStatus.OCR_ONLY
            ))
        summary["ocr_only"] = len(req.ocr_data)
        return AiVerifySingleResponse(
            verified_rows=verified_rows,
            summary=summary,
            ai_raw_count=0,
            error_message="AI API 密钥未提供"
        )

    # 下载图片
    logger.info(f"AI 验证单张图片: {req.image_url}")
    try:
        img_path = download_image(req.image_url)
    except Exception as e:
        logger.error(f"下载图片失败: {e}")
        for ocr_row in req.ocr_data:
            verified_rows.append(VerifiedRow(
                data=ocr_row,
                status=VerifyStatus.ERROR
            ))
        summary["error"] = len(req.ocr_data)
        return AiVerifySingleResponse(
            verified_rows=verified_rows,
            summary=summary,
            ai_raw_count=0,
            error_message=f"下载图片失败: {str(e)}"
        )

    # 调用 AI 解析
    ai_rows = []
    try:
        ai_rows = await parse_image_with_ai(
            img_path,
            api_key=req.ai_api_key,
            base_url=req.ai_base_url or None,
            model=req.ai_model or None,
            context={}
        )
        ai_raw_count = len(ai_rows)
        logger.info(f"AI 识别 {ai_raw_count} 行")
    except Exception as e:
        error_type = type(e).__name__
        logger.error(f"AI 解析失败: {error_type}: {e}")

        # 判断是超时还是其他错误
        is_timeout = "timeout" in error_type.lower() or "timeout" in str(e).lower()
        status = VerifyStatus.TIMEOUT if is_timeout else VerifyStatus.ERROR

        for ocr_row in req.ocr_data:
            verified_rows.append(VerifiedRow(
                data=ocr_row,
                status=status
            ))
        summary["timeout" if is_timeout else "error"] = len(req.ocr_data)
        return AiVerifySingleResponse(
            verified_rows=verified_rows,
            summary=summary,
            ai_raw_count=0,
            error_message=f"AI {'超时' if is_timeout else '错误'}: {str(e)}"
        )

    # AI 返回空结果，标记所有 OCR 数据为 ocr_only
    if not ai_rows:
        for ocr_row in req.ocr_data:
            verified_rows.append(VerifiedRow(
                data=ocr_row,
                status=VerifyStatus.OCR_ONLY
            ))
        summary["ocr_only"] = len(req.ocr_data)
        return AiVerifySingleResponse(
            verified_rows=verified_rows,
            summary=summary,
            ai_raw_count=0,
            error_message="AI 未识别到任何数据"
        )

    # 对比 OCR 和 AI 结果
    def make_key(row: Dict) -> str:
        """生成唯一键：院校代码 + 专业组代码 + 专业代码"""
        return f"{row.get('university_code', '')}_{row.get('major_group_code', '')}_{row.get('major_code', '')}"

    ocr_map = {make_key(r): r for r in ocr_rows}
    ai_map = {make_key(r): r for r in ai_rows}

    all_keys = set(ocr_map.keys()) | set(ai_map.keys())

    for key in all_keys:
        ocr_row = ocr_map.get(key)
        ai_row = ai_map.get(key)

        if ocr_row and ai_row:
            # 两者都有，检查关键字段是否一致
            diff_fields = []

            # 比较计划数
            ocr_plan = ocr_row.get("plan_count", 0)
            ai_plan = ai_row.get("plan_count", 0)
            if ocr_plan != ai_plan:
                diff_fields.append(f"plan_count(OCR:{ocr_plan}, AI:{ai_plan})")

            # 比较学费
            ocr_tuition = normalize_tuition(ocr_row.get("tuition", ""))
            ai_tuition = normalize_tuition(ai_row.get("tuition", ""))
            if ocr_tuition != ai_tuition:
                diff_fields.append(f"tuition(OCR:{ocr_tuition}, AI:{ai_tuition})")

            # 比较专业名称（模糊匹配）
            ocr_name = ocr_row.get("major_name", "")[:10]
            ai_name = ai_row.get("major_name", "")[:10]
            if ocr_name != ai_name:
                diff_fields.append(f"major_name(OCR:{ocr_name}, AI:{ai_name})")

            if diff_fields:
                # 有冲突
                verified_rows.append(VerifiedRow(
                    data=SupplementaryRow(**ocr_row),
                    status=VerifyStatus.CONFLICT,
                    ai_data=SupplementaryRow(**{
                        "exam_type": ai_row.get("exam_type", ""),
                        "enrollment_type": ai_row.get("enrollment_type", ""),
                        "university_code": ai_row.get("university_code", ""),
                        "university_name": ai_row.get("university_name", ""),
                        "university_location": ai_row.get("university_location", ""),
                        "university_note": ai_row.get("university_note", ""),
                        "major_group_code": ai_row.get("major_group_code", ""),
                        "major_group_subject": ai_row.get("major_group_subject", ""),
                        "major_group_plan": ai_row.get("major_group_plan", 0),
                        "major_code": ai_row.get("major_code", ""),
                        "major_name": ai_row.get("major_name", ""),
                        "major_note": ai_row.get("major_note", ""),
                        "plan_count": ai_row.get("plan_count", 0),
                        "tuition": ai_row.get("tuition", ""),
                    }),
                    diff_fields=diff_fields
                ))
                summary["conflict"] += 1
            else:
                # 一致
                verified_rows.append(VerifiedRow(
                    data=SupplementaryRow(**ocr_row),
                    status=VerifyStatus.MATCHED
                ))
                summary["matched"] += 1

        elif ocr_row:
            # 仅 OCR 有
            verified_rows.append(VerifiedRow(
                data=SupplementaryRow(**ocr_row),
                status=VerifyStatus.OCR_ONLY
            ))
            summary["ocr_only"] += 1

        else:
            # 仅 AI 有
            verified_rows.append(VerifiedRow(
                data=SupplementaryRow(**{
                    "exam_type": ai_row.get("exam_type", ""),
                    "enrollment_type": ai_row.get("enrollment_type", ""),
                    "university_code": ai_row.get("university_code", ""),
                    "university_name": ai_row.get("university_name", ""),
                    "university_location": ai_row.get("university_location", ""),
                    "university_note": ai_row.get("university_note", ""),
                    "major_group_code": ai_row.get("major_group_code", ""),
                    "major_group_subject": ai_row.get("major_group_subject", ""),
                    "major_group_plan": ai_row.get("major_group_plan", 0),
                    "major_code": ai_row.get("major_code", ""),
                    "major_name": ai_row.get("major_name", ""),
                    "major_note": ai_row.get("major_note", ""),
                    "plan_count": ai_row.get("plan_count", 0),
                    "tuition": ai_row.get("tuition", ""),
                }),
                status=VerifyStatus.AI_ONLY
            ))
            summary["ai_only"] += 1

    logger.info(f"AI 校验完成: matched={summary['matched']}, conflict={summary['conflict']}, "
                f"ocr_only={summary['ocr_only']}, ai_only={summary['ai_only']}")

    return AiVerifySingleResponse(
        verified_rows=verified_rows,
        summary=summary,
        ai_raw_count=ai_raw_count,
        error_message=error_message
    )


def run_score_segment_ocr(req: OcrRequest) -> OcrResponse:
    """一分一段表 OCR"""
    all_rows = []
    for i, url in enumerate(req.image_urls):
        logger.info(f"OCR {i+1}/{len(req.image_urls)}: {url}")
        img_path = download_image(url)
        rows = extract_score_rows(img_path)
        logger.info(f"  识别 {len(rows)} 行")
        all_rows.extend(rows)

    # 去重排序
    rows = deduplicate_and_sort(all_rows)
    logger.info(f"去重后: {len(rows)} 行")

    # 校验
    is_valid, errors = validate_data(rows)

    # 填补缺失
    if not is_valid and any("缺失" in e for e in errors):
        rows = fill_missing_scores(rows)
        is_valid, errors = validate_data(rows)

    score_range = f"{rows[0][0]}~{rows[-1][0]}" if rows else ""

    return OcrResponse(
        total_rows=len(rows),
        score_range=score_range,
        is_valid=is_valid,
        errors=errors,
        data=[ScoreRow(score=s, count=c, cumulative_count=cum) for s, c, cum in rows],
    )


def run_supplementary_ocr(req: OcrRequest) -> SupplementaryOcrResponse:
    """征集志愿 OCR（纯 OCR 模式）"""
    all_rows = []
    image_data_counts = []  # 记录每张图片识别的数据行数
    # 跨图片传递状态
    last_exam_type = ""
    last_enrollment_type = ""

    for i, url in enumerate(req.image_urls):
        logger.info(f"征集志愿 OCR {i+1}/{len(req.image_urls)}: {url}")
        img_path = download_image(url)
        rows = extract_supplementary_rows(img_path)
        logger.info(f"  识别 {len(rows)} 行")

        # 记录这张图片的数据行数
        image_data_counts.append(len(rows))

        # 填充空的 exam_type 和 enrollment_type（使用上一张图片的状态）
        for row in rows:
            if row.get("exam_type"):
                last_exam_type = row["exam_type"]
            else:
                row["exam_type"] = last_exam_type

            if row.get("enrollment_type"):
                last_enrollment_type = row["enrollment_type"]
            else:
                row["enrollment_type"] = last_enrollment_type

        all_rows.extend(rows)

    # 合并去重
    rows = merge_supplementary_rows(all_rows)
    logger.info(f"合并后: {len(rows)} 行")

    # 统计
    university_codes = set(r["university_code"] for r in rows)
    major_group_codes = set(
        f"{r['university_code']}_{r['major_group_code']}"
        for r in rows if r.get("major_group_code")
    )

    # 校验
    is_valid, errors = validate_supplementary_data(rows)

    # 构建响应，包含 image_data_counts
    response_data = {
        "total_rows": len(rows),
        "university_count": len(university_codes),
        "major_group_count": len(major_group_codes),
        "is_valid": is_valid,
        "errors": errors,
        "data": [SupplementaryRow(**r) for r in rows],
        "image_data_counts": image_data_counts,  # 新增：每张图片的数据行数
    }

    return response_data


async def run_supplementary_ocr_with_ai(req: OcrRequest) -> SupplementaryOcrWithAIResponse:
    """征集志愿 OCR + AI 校验模式"""
    from ai_parser import parse_image_with_ai, compare_results, merge_results

    all_ocr_rows = []
    all_ai_rows = []
    image_paths = []

    # 跨图片传递状态
    last_exam_type = ""
    last_enrollment_type = ""
    context = {}

    # 第一步：OCR 识别所有图片
    for i, url in enumerate(req.image_urls):
        logger.info(f"征集志愿 OCR {i+1}/{len(req.image_urls)}: {url}")
        img_path = download_image(url)
        image_paths.append(img_path)

        rows = extract_supplementary_rows(img_path)
        logger.info(f"  OCR 识别 {len(rows)} 行")

        # 填充空的 exam_type 和 enrollment_type
        for row in rows:
            if row.get("exam_type"):
                last_exam_type = row["exam_type"]
            else:
                row["exam_type"] = last_exam_type

            if row.get("enrollment_type"):
                last_enrollment_type = row["enrollment_type"]
            else:
                row["enrollment_type"] = last_enrollment_type

        all_ocr_rows.extend(rows)

    # 合并去重 OCR 结果
    ocr_rows = merge_supplementary_rows(all_ocr_rows)
    logger.info(f"OCR 合并后: {len(ocr_rows)} 行")

    # 获取 AI 配置
    ai_api_key = req.ai_api_key
    ai_base_url = req.ai_base_url
    ai_model = req.ai_model

    # 第二步：AI 解析所有图片
    if req.enable_ai and ai_api_key:
        logger.info("开始 AI 解析...")
        context = {}

        for i, img_path in enumerate(image_paths):
            logger.info(f"AI 解析 {i+1}/{len(image_paths)}: {img_path}")
            ai_rows = await parse_image_with_ai(
                img_path,
                api_key=ai_api_key,
                base_url=ai_base_url or None,
                model=ai_model or None,
                context=context
            )
            logger.info(f"  AI 识别 {len(ai_rows)} 行")

            # 更新上下文
            if ai_rows:
                last_row = ai_rows[-1]
                context = {
                    "exam_type": last_row.get("exam_type", ""),
                    "enrollment_type": last_row.get("enrollment_type", ""),
                    "university": {
                        "code": last_row.get("university_code", ""),
                        "name": last_row.get("university_name", "")
                    }
                }

            all_ai_rows.extend(ai_rows)

        # 合并去重 AI 结果
        ai_rows = merge_supplementary_rows(all_ai_rows)
        logger.info(f"AI 合并后: {len(ai_rows)} 行")

        # 第三步：比较 OCR 和 AI 结果
        comparison = compare_results(ocr_rows, ai_rows)
        logger.info(f"比较结果: 匹配 {comparison['summary']['matched_count']}, "
                   f"冲突 {comparison['summary']['conflict_count']}, "
                   f"仅OCR {comparison['summary']['ocr_only_count']}, "
                   f"仅AI {comparison['summary']['ai_only_count']}")

        # 合并结果（冲突时优先使用 OCR，但标记需要审核）
        merged_rows, conflicts = merge_results(ocr_rows, ai_rows, prefer="ocr")

        # 统计
        university_codes = set(r["university_code"] for r in merged_rows)

        # 校验
        is_valid, errors = validate_supplementary_data(merged_rows)

        # 构建比较结果
        compare_result = CompareResult(
            matched=[SupplementaryRow(**item["data"]) for item in comparison["matched"]],
            ocr_only=[SupplementaryRow(**r) for r in comparison["ocr_only"]],
            ai_only=[SupplementaryRow(**r) for r in comparison["ai_only"]],
            conflicts=[
                ConflictItem(
                    ocr=SupplementaryRow(**c["ocr"]),
                    ai=SupplementaryRow(**c["ai"]),
                    diff=c["diff"]
                ) for c in comparison["conflicts"]
            ],
            summary=comparison["summary"]
        )

        return SupplementaryOcrWithAIResponse(
            total_rows=len(merged_rows),
            university_count=len(university_codes),
            is_valid=is_valid,
            errors=errors,
            data=[SupplementaryRow(**r) for r in merged_rows],
            ai_enabled=True,
            comparison=compare_result,
            conflicts_count=len(conflicts),
            needs_review=len(conflicts) > 0
        )

    else:
        # 未启用 AI，返回纯 OCR 结果
        university_codes = set(r["university_code"] for r in ocr_rows)
        is_valid, errors = validate_supplementary_data(ocr_rows)

        return SupplementaryOcrWithAIResponse(
            total_rows=len(ocr_rows),
            university_count=len(university_codes),
            is_valid=is_valid,
            errors=errors,
            data=[SupplementaryRow(**r) for r in ocr_rows],
            ai_enabled=False,
            comparison=None,
            conflicts_count=0,
            needs_review=False
        )


@app.post("/save", response_model=SaveResponse)
def save_data(req: SaveRequest):
    """将 OCR 数据保存到数据库"""
    try:
        rows = [r.model_dump() for r in req.data]
        affected = save_score_segments(rows, req.year, req.province, req.exam_type, req.db_url)
        return SaveResponse(
            success=True,
            affected_rows=affected,
            message=f"成功导入 {len(rows)} 条记录",
        )
    except Exception as e:
        logger.error(f"保存失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"数据库写入失败: {str(e)}")


@app.post("/save-supplementary", response_model=SaveResponse)
def save_supplementary_data(req: SaveSupplementaryRequest):
    """将征集志愿 OCR 数据保存到数据库"""
    try:
        rows = [r.model_dump() for r in req.data]
        new_uni, new_major, new_plan = save_supplementary_plans(
            rows, req.year, req.province, req.exam_type, req.batch, req.db_url
        )
        return SaveResponse(
            success=True,
            affected_rows=new_plan,
            message=f"成功导入: {new_uni} 所院校, {new_major} 个专业, {new_plan} 条招生计划",
        )
    except Exception as e:
        logger.error(f"保存��集志愿失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"数据库写入失败: {str(e)}")


@app.post("/test-local")
def test_local_image(file_path: str, data_type: str = "supplementary"):
    """
    测试本地图片的 OCR 识别效果
    用于调试和验证识别准确率
    """
    try:
        if not os.path.exists(file_path):
            raise HTTPException(status_code=400, detail=f"文件不存在: {file_path}")

        if data_type == "supplementary":
            rows = extract_supplementary_rows(file_path)
            rows = merge_supplementary_rows(rows)
            is_valid, errors = validate_supplementary_data(rows)
            return {
                "file": file_path,
                "data_type": data_type,
                "total_rows": len(rows),
                "university_count": len(set(r["university_code"] for r in rows)) if rows else 0,
                "is_valid": is_valid,
                "errors": errors,
                "data": rows,
            }
        else:
            rows = extract_score_rows(file_path)
            rows = deduplicate_and_sort(rows)
            is_valid, errors = validate_data(rows)
            return {
                "file": file_path,
                "data_type": data_type,
                "total_rows": len(rows),
                "score_range": f"{rows[0][0]}~{rows[-1][0]}" if rows else "",
                "is_valid": is_valid,
                "errors": errors,
                "data": [{"score": s, "count": c, "cumulative_count": cum} for s, c, cum in rows],
            }
    except Exception as e:
        logger.error(f"测试失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"OCR 测试失败: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("OCR_SERVICE_PORT", 8100))
    uvicorn.run(app, host="0.0.0.0", port=port)
