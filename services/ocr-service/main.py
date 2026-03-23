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

# 加载 .env 文件
from dotenv import load_dotenv
load_dotenv()

import requests as http_requests
from bs4 import BeautifulSoup
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import mysql.connector

# OCR 延迟导入（模型加载较慢）
_ocr_instance = None
_ocr_engine = None  # "paddle" or "rapid"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
os.makedirs(CACHE_DIR, exist_ok=True)

# OCR 引擎选择：
# - "baidu": 百度云 OCR API（通用文字识别高精度版），需要 API Key
# - "paddleocr_vl": PaddleOCR-VL 视觉语言模型（千帆平台），需要 API Key
# - "paddleocr": PaddleOCR Docker 服务，本地高精度方案
# - "paddle": PaddleOCR (ppocr-onnx)，本地运行
# - "rapid": RapidOCR，轻量级本地方案
OCR_ENGINE = os.environ.get("OCR_ENGINE", "baidu")  # 默认使用百度云 OCR

# PaddleOCR Docker 服务地址
PADDLEOCR_SERVICE_URL = os.environ.get("PADDLEOCR_SERVICE_URL", "http://localhost:8101")

# 百度云 OCR 配置（传统 OCR API）
BAIDU_OCR_API_KEY = os.environ.get("BAIDU_OCR_API_KEY", "")
BAIDU_OCR_SECRET_KEY = os.environ.get("BAIDU_OCR_SECRET_KEY", "")
_baidu_access_token = None
_baidu_token_expires = 0

# PaddleOCR-VL 配置（千帆平台视觉语言模型）
# API 文档: https://cloud.baidu.com/doc/qianfan-api/s/zmho8omz3
QIANFAN_API_KEY = os.environ.get("QIANFAN_API_KEY", "")
QIANFAN_BASE_URL = "https://qianfan.baidubce.com"

# AIStudio Layout-Parsing 配置
# 基于 PaddleOCR 的版面分析 API，支持表格识别
AISTUDIO_API_URL = os.environ.get("AISTUDIO_API_URL", "https://lf1ev8v7o4maja97.aistudio-app.com/layout-parsing")
AISTUDIO_TOKEN = os.environ.get("AISTUDIO_TOKEN", "")


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
    source_url: str = Field("", description="数据来源网页 URL")
    # 单引擎模式选项
    engine: str = Field("", description="指定 OCR 引擎: baidu / paddleocr_vl / aistudio / paddleocr / rapid（留空使用默认）")
    # AI 校验选项
    enable_ai: bool = Field(False, description="是否启用 AI 校验")
    ai_api_key: str = Field("", description="AI API 密钥")
    ai_base_url: str = Field("", description="AI API 基础 URL")
    ai_model: str = Field("", description="AI 模型名称")
    # 图像预处理增强选项
    enable_preprocess: bool = Field(False, description="是否启用图像预处理增强（多变体投票）")

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
    source_url: str = ""          # 数据来源网页 URL
    page_number: int = 0          # 数据所在页码


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


# ==================== 百度云 OCR ====================

def get_baidu_access_token() -> str:
    """
    获取百度云 OCR 的 access_token
    token 有效期 30 天，会自动缓存
    """
    global _baidu_access_token, _baidu_token_expires
    import time

    # 检查缓存的 token 是否有效（提前 1 小时刷新）
    if _baidu_access_token and time.time() < _baidu_token_expires - 3600:
        return _baidu_access_token

    if not BAIDU_OCR_API_KEY or not BAIDU_OCR_SECRET_KEY:
        raise ValueError("百度云 OCR API Key 或 Secret Key 未配置")

    url = "https://aip.baidubce.com/oauth/2.0/token"
    params = {
        "grant_type": "client_credentials",
        "client_id": BAIDU_OCR_API_KEY,
        "client_secret": BAIDU_OCR_SECRET_KEY
    }

    response = http_requests.post(url, params=params, timeout=10)
    result = response.json()

    if "access_token" not in result:
        raise ValueError(f"获取百度 access_token 失败: {result}")

    _baidu_access_token = result["access_token"]
    # token 有效期 30 天
    _baidu_token_expires = time.time() + result.get("expires_in", 2592000)
    logger.info("百度云 OCR access_token 获取成功")

    return _baidu_access_token


def run_baidu_ocr(img_path: str) -> List[Tuple]:
    """
    调用百度云 OCR API 识别图片

    使用通用文字识别（高精度含位置版）接口
    https://aip.baidubce.com/rest/2.0/ocr/v1/accurate

    Returns:
        List of (box, text, confidence)
    """
    import base64

    access_token = get_baidu_access_token()

    # 读取图片并 base64 编码
    with open(img_path, "rb") as f:
        img_data = base64.b64encode(f.read()).decode("utf-8")

    # 调用高精度含位置版 API
    url = f"https://aip.baidubce.com/rest/2.0/ocr/v1/accurate?access_token={access_token}"
    headers = {"Content-Type": "application/x-www-form-urlencoded"}
    data = {
        "image": img_data,
        "recognize_granularity": "small",  # 定位单字符位置
        "detect_direction": "true",        # 检测图像朝向
        "paragraph": "false",              # 不输出段落信息
        "probability": "true",             # 返回置信度
    }

    response = http_requests.post(url, headers=headers, data=data, timeout=30)
    result = response.json()

    if "error_code" in result:
        logger.error(f"百度 OCR 错误: {result}")
        raise ValueError(f"百度 OCR 错误: {result.get('error_msg', 'Unknown error')}")

    # 解析结果
    items = []
    for word in result.get("words_result", []):
        text = word.get("words", "")
        location = word.get("location", {})
        probability = word.get("probability", {})

        # 构造 box: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
        left = location.get("left", 0)
        top = location.get("top", 0)
        width = location.get("width", 0)
        height = location.get("height", 0)

        box = [
            [left, top],
            [left + width, top],
            [left + width, top + height],
            [left, top + height]
        ]

        confidence = probability.get("average", 0.9)
        items.append((box, text, confidence))

    logger.info(f"百度 OCR 识别完成: {len(items)} 行")
    return items


def run_paddleocr_docker(img_path: str) -> List[Tuple]:
    """
    调用 PaddleOCR Docker 服务识别图片

    Returns:
        List of (box, text, confidence)
    """
    # 将本地路径转换为 Docker 容器内路径
    # 本地 cache 目录映射到容器的 /data
    filename = os.path.basename(img_path)
    docker_path = f"/data/{filename}"

    response = http_requests.post(
        f"{PADDLEOCR_SERVICE_URL}/ocr",
        json={"image_path": docker_path},
        timeout=60
    )
    response.raise_for_status()
    result = response.json()

    if "error" in result:
        raise ValueError(result["error"])

    items = []
    for item in result.get("items", []):
        box = item["box"]
        text = item["text"]
        confidence = item["confidence"]
        items.append((box, text, confidence))

    logger.info(f"PaddleOCR Docker 识别完成: {len(items)} 行")
    return items


def run_paddleocr_vl(img_path: str) -> List[Tuple]:
    """
    调用 PaddleOCR-VL 视觉语言模型（千帆平台）识别图片

    PaddleOCR-VL 是基于视觉语言模型的 OCR，具有更强的理解能力，
    支持表格识别、版面分析等高级功能。

    API 文档: https://cloud.baidu.com/doc/qianfan-api/s/zmho8omz3

    Returns:
        List of (box, text, confidence)
    """
    import base64

    if not QIANFAN_API_KEY:
        raise ValueError("千帆 API Key 未配置 (QIANFAN_API_KEY)")

    # 读取图片并 base64 编码
    with open(img_path, "rb") as f:
        img_data = base64.b64encode(f.read()).decode("utf-8")

    # 获取图片格式
    ext = os.path.splitext(img_path)[1].lower()
    if ext in (".jpg", ".jpeg"):
        mime_type = "image/jpeg"
    elif ext == ".png":
        mime_type = "image/png"
    else:
        mime_type = "image/jpeg"

    # 构建请求
    url = f"{QIANFAN_BASE_URL}/v2/ocr/paddleocr"
    headers = {
        "Authorization": f"Bearer {QIANFAN_API_KEY}",
        "Content-Type": "application/json"
    }

    # 请求参数
    # 参考: https://cloud.baidu.com/doc/qianfan-api/s/zmho8omz3
    payload = {
        "model": "paddleocr-vl-0.9b",
        "file": f"data:{mime_type};base64,{img_data}",
        "fileType": 1,  # 1=图像文件
        "useChartRecognition": True,   # 启用表格识别
        "useLayoutDetection": True,    # 启用版面检测
        "useDocUnwarping": False,      # 文档矫正（征集志愿图片通常不需要）
        "layoutNms": True,             # NMS 后处理，移除重叠区域
        "temperature": 0,              # 低温度获得稳定输出
        "topP": 1.0,
        "minPixels": 147384,
        "maxPixels": 2822400,
        "visualize": False             # 不需要可视化结果
    }

    logger.info(f"调用 PaddleOCR-VL API...")
    response = http_requests.post(url, headers=headers, json=payload, timeout=120)

    if response.status_code != 200:
        logger.error(f"PaddleOCR-VL API 错误: {response.status_code} {response.text[:500]}")
        raise ValueError(f"PaddleOCR-VL API 错误: {response.status_code}")

    result = response.json()

    # 解析响应
    # PaddleOCR-VL 返回格式与传统 OCR 不同，需要适配
    items = []

    # 检查是否有错误
    if "error" in result:
        raise ValueError(f"PaddleOCR-VL 错误: {result.get('error')}")

    # 解析 OCR 结果
    # 新版响应格式: {"result": {"layoutParsingResults": [{"prunedResult": {"parsing_res_list": [...]}}]}}
    ocr_data = result.get("result", {})

    # 尝试新版 layoutParsingResults 格式
    layout_results = ocr_data.get("layoutParsingResults", [])
    if layout_results:
        for layout in layout_results:
            pruned = layout.get("prunedResult", {})
            parsing_list = pruned.get("parsing_res_list", [])
            for block in parsing_list:
                text = block.get("block_content", "").strip()
                bbox = block.get("block_bbox", [])
                if text and bbox:
                    # bbox 格式: [x1, y1, x2, y2]
                    x1, y1, x2, y2 = bbox
                    box = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                    # 按行分割文本
                    for line in text.split("\n"):
                        line = line.strip()
                        if line:
                            items.append((box, line, 0.95))
        if items:
            logger.info(f"PaddleOCR-VL 识别完成 (layoutParsing): {len(items)} 行")
            return items

    # 尝试旧版格式
    ocr_items = (
        ocr_data.get("ocr_result", []) or
        ocr_data.get("texts", []) or
        ocr_data.get("items", []) or
        result.get("ocr_result", []) or
        result.get("texts", [])
    )

    if not ocr_items and "result" in result:
        # 可能是纯文本结果，尝试解析
        raw_result = result.get("result", "")
        if isinstance(raw_result, str) and raw_result:
            # VL 模型可能返回结构化文本，按行分割
            lines = raw_result.strip().split("\n")
            y_pos = 0
            for line in lines:
                line = line.strip()
                if line:
                    # 构造虚拟 box（VL 模型可能不返回位置信息）
                    box = [[0, y_pos], [800, y_pos], [800, y_pos + 30], [0, y_pos + 30]]
                    items.append((box, line, 0.95))
                    y_pos += 35
            logger.info(f"PaddleOCR-VL 识别完成 (文本模式): {len(items)} 行")
            return items

    for item in ocr_items:
        if isinstance(item, dict):
            text = item.get("text", "") or item.get("content", "")
            bbox = item.get("bbox", []) or item.get("box", []) or item.get("position", [])
            confidence = item.get("confidence", 0.9) or item.get("score", 0.9)

            if text:
                # 转换 bbox 格式
                if bbox and len(bbox) >= 4:
                    if isinstance(bbox[0], (int, float)):
                        # [x1, y1, x2, y2] 格式
                        x1, y1, x2, y2 = bbox[:4]
                        box = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                    else:
                        # [[x1,y1], [x2,y2], ...] 格式
                        box = bbox
                else:
                    # 没有位置信息，使用默认值
                    box = [[0, 0], [800, 0], [800, 30], [0, 30]]

                items.append((box, text.strip(), confidence))
        elif isinstance(item, str):
            # 纯文本项
            items.append(([[0, 0], [800, 0], [800, 30], [0, 30]], item.strip(), 0.9))

    logger.info(f"PaddleOCR-VL 识别完成: {len(items)} 行")
    return items


def run_aistudio_layout_parsing(img_path: str) -> List[Tuple]:
    """
    调用 AIStudio Layout-Parsing API 识别图片

    基于 PaddleOCR 的版面分析 API，支持表格识别。
    API 地址: https://lf1ev8v7o4maja97.aistudio-app.com/layout-parsing

    API 文档格式:
    - Authorization: token {TOKEN}  (注意不是 Bearer)
    - 请求参数: file (base64), fileType (0=PDF, 1=图片)
    - 响应格式: result.layoutParsingResults[].markdown.text

    Returns:
        List of (box, text, confidence)
    """
    import base64

    if not AISTUDIO_TOKEN:
        raise ValueError("AIStudio Token 未配置 (AISTUDIO_TOKEN)")

    # 读取图片并 base64 编码
    with open(img_path, "rb") as f:
        img_data = base64.b64encode(f.read()).decode("ascii")

    # 构建请求 - 注意 Authorization 格式是 "token {TOKEN}" 而不是 "Bearer"
    headers = {
        "Authorization": f"token {AISTUDIO_TOKEN}",
        "Content-Type": "application/json"
    }

    # 请求参数 - 按照 API 文档格式
    payload = {
        "file": img_data,
        "fileType": 1,  # 1 表示图片，0 表示 PDF
        # 可选参数
        "useDocOrientationClassify": False,
        "useDocUnwarping": False,
        "useChartRecognition": False,
    }

    logger.info(f"调用 AIStudio Layout-Parsing API...")
    response = http_requests.post(AISTUDIO_API_URL, headers=headers, json=payload, timeout=120)

    if response.status_code != 200:
        logger.error(f"AIStudio API 错误: {response.status_code} {response.text[:500]}")
        raise ValueError(f"AIStudio API 错误: {response.status_code}")

    result = response.json()

    # 解析响应
    items = []

    # 检查是否有错误
    if "error" in result:
        error_msg = result.get("error") or result.get("message") or "Unknown error"
        raise ValueError(f"AIStudio 错误: {error_msg}")

    # 解析 OCR 结果 - 按照 API 文档格式
    # 响应格式: {"result": {"layoutParsingResults": [{"markdown": {"text": "...", "images": {}}}]}}
    ocr_data = result.get("result", {})

    # 解析 layoutParsingResults 格式（API 文档标准格式）
    layout_results = ocr_data.get("layoutParsingResults", [])
    if layout_results:
        y_offset = 0
        for res in layout_results:
            markdown_data = res.get("markdown", {})
            markdown_text = markdown_data.get("text", "")

            if markdown_text:
                # 按行分割 markdown 文本
                for line in markdown_text.split("\n"):
                    line = line.strip()
                    if line:
                        # 生成虚拟坐标（因为 markdown 格式没有坐标信息）
                        box = [[0, y_offset], [800, y_offset], [800, y_offset + 30], [0, y_offset + 30]]
                        items.append((box, line, 0.95))
                        y_offset += 35

        if items:
            logger.info(f"AIStudio 识别完成 (layoutParsingResults): {len(items)} 行")
            return items

    # 尝试解析 layouts 格式（备用格式）
    layouts = ocr_data.get("layouts", [])
    if layouts:
        for layout in layouts:
            text = layout.get("text", "").strip()
            bbox = layout.get("bbox", []) or layout.get("box", [])
            confidence = layout.get("confidence", 0.9) or layout.get("score", 0.9)

            if text and bbox:
                # bbox 格式: [x1, y1, x2, y2] 或 [[x1,y1], [x2,y2], ...]
                if isinstance(bbox[0], (int, float)):
                    x1, y1, x2, y2 = bbox[:4]
                    box = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                else:
                    box = bbox

                # 按行分割文本
                for line in text.split("\n"):
                    line = line.strip()
                    if line:
                        items.append((box, line, confidence))

        if items:
            logger.info(f"AIStudio 识别完成 (layouts): {len(items)} 行")
            return items

    # 尝试解析 texts 格式（备用格式）
    texts = ocr_data.get("texts", []) or ocr_data.get("ocr_result", [])
    if texts:
        for item in texts:
            if isinstance(item, dict):
                text = item.get("text", "") or item.get("content", "")
                bbox = item.get("bbox", []) or item.get("box", []) or item.get("position", [])
                confidence = item.get("confidence", 0.9) or item.get("score", 0.9)

                if text:
                    if bbox and len(bbox) >= 4:
                        if isinstance(bbox[0], (int, float)):
                            x1, y1, x2, y2 = bbox[:4]
                            box = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                        else:
                            box = bbox
                    else:
                        box = [[0, 0], [800, 0], [800, 30], [0, 30]]

                    items.append((box, text.strip(), confidence))
            elif isinstance(item, str):
                items.append(([[0, 0], [800, 0], [800, 30], [0, 30]], item.strip(), 0.9))

        if items:
            logger.info(f"AIStudio 识别完成 (texts): {len(items)} 行")
            return items

    # 尝试解析 parsing_res_list 格式（类似 PaddleOCR-VL）
    parsing_list = ocr_data.get("parsing_res_list", [])
    if parsing_list:
        for block in parsing_list:
            text = block.get("block_content", "").strip()
            bbox = block.get("block_bbox", [])
            if text and bbox:
                x1, y1, x2, y2 = bbox
                box = [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]
                for line in text.split("\n"):
                    line = line.strip()
                    if line:
                        items.append((box, line, 0.95))

        if items:
            logger.info(f"AIStudio 识别完成 (parsing_res_list): {len(items)} 行")
            return items

    # 如果没有解析到数据，记录原始响应用于调试
    logger.warning(f"AIStudio 返回格式未知，原始响应: {str(result)[:500]}")
    logger.info(f"AIStudio 识别完成: {len(items)} 行")
    return items


# ==================== OCR Engine ====================

def get_ocr():
    """
    获取本地 OCR 实例（用于非百度云模式）
    """
    global _ocr_instance, _ocr_engine

    if _ocr_instance is None:
        if OCR_ENGINE == "paddle":
            try:
                logger.info("正在加载 ppocr-onnx 模型...")
                from ppocronnx import TextSystem
                _ocr_instance = TextSystem()
                _ocr_engine = "paddle"
                logger.info("ppocr-onnx 模型加载完成")
                return _ocr_instance
            except ImportError:
                logger.warning("ppocr-onnx 未安装，回退到 RapidOCR")
            except Exception as e:
                logger.warning(f"ppocr-onnx 加载失败: {e}，回退到 RapidOCR")

        # 回退到 RapidOCR
        logger.info("正在加载 RapidOCR 模型...")
        from rapidocr_onnxruntime import RapidOCR
        _ocr_instance = RapidOCR()
        _ocr_engine = "rapid"
        logger.info("RapidOCR 模型加载完成")

    return _ocr_instance


def run_ocr(img_path: str) -> List[Tuple]:
    """
    统一的 OCR 调用接口

    Returns:
        List of (box, text, confidence)
        - box: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] 四个角点坐标
        - text: 识别的文字
        - confidence: 置信度
    """
    global _ocr_engine

    # 优先使用百度云 OCR（传统 API）
    if OCR_ENGINE == "baidu" and BAIDU_OCR_API_KEY:
        try:
            result = run_baidu_ocr(img_path)
            _ocr_engine = "baidu"
            return result
        except Exception as e:
            logger.warning(f"百度云 OCR 失败: {e}，回退到本地 OCR")

    # PaddleOCR-VL 视觉语言模型（千帆平台）
    if OCR_ENGINE == "paddleocr_vl" and QIANFAN_API_KEY:
        try:
            result = run_paddleocr_vl(img_path)
            _ocr_engine = "paddleocr_vl"
            return result
        except Exception as e:
            logger.warning(f"PaddleOCR-VL 失败: {e}，回退到本地 OCR")

    # PaddleOCR Docker 服务
    if OCR_ENGINE == "paddleocr" or (OCR_ENGINE == "baidu" and not BAIDU_OCR_API_KEY):
        try:
            result = run_paddleocr_docker(img_path)
            _ocr_engine = "paddleocr"
            return result
        except Exception as e:
            logger.warning(f"PaddleOCR Docker 失败: {e}，回退到 RapidOCR")

    # 本地 OCR
    import cv2
    ocr = get_ocr()

    if _ocr_engine == "paddle":
        img = cv2.imread(img_path)
        if img is None:
            logger.error(f"无法读取图片: {img_path}")
            return []

        result = ocr.detect_and_ocr(img)
        if not result:
            return []

        items = []
        for item in result:
            box = item.box.tolist()
            text = item.ocr_text
            confidence = item.score
            items.append((box, text, confidence))
        return items
    else:
        # RapidOCR
        result, _ = ocr(img_path)
        return result if result else []


def run_ocr_with_engine(img_path: str, engine: str = "") -> List[Tuple]:
    """
    使用指定引擎运行 OCR

    Args:
        img_path: 图片路径
        engine: 引擎名称 (baidu / paddleocr_vl / aistudio / paddleocr / rapid)
                留空则使用默认引擎

    Returns:
        List of (box, text, confidence)
    """
    if not engine:
        return run_ocr(img_path)

    logger.info(f"使用指定引擎: {engine}")

    if engine == "baidu":
        if not BAIDU_OCR_API_KEY:
            raise ValueError("百度 OCR API Key 未配置")
        return run_baidu_ocr(img_path)

    elif engine == "paddleocr_vl":
        if not QIANFAN_API_KEY:
            raise ValueError("千帆 API Key 未配置")
        return run_paddleocr_vl(img_path)

    elif engine == "aistudio":
        if not AISTUDIO_TOKEN:
            raise ValueError("AIStudio Token 未配置")
        result = run_aistudio_layout_parsing(img_path)
        # AIStudio 返回 Markdown/HTML 格式，需要转换为纯文本
        return _convert_aistudio_to_plain_text(result)

    elif engine == "paddleocr":
        return run_paddleocr_docker(img_path)

    elif engine == "rapid":
        ocr = get_ocr()
        result, _ = ocr(img_path)
        return result if result else []

    else:
        logger.warning(f"未知引擎 {engine}，使用默认引擎")
        return run_ocr(img_path)


def _convert_aistudio_to_plain_text(items: List[Tuple]) -> List[Tuple]:
    """
    将 AIStudio 的 Markdown/HTML 格式转换为纯文本

    AIStudio 返回的文本可能包含：
    - HTML 表格: <table>...</table>
    - Markdown 表格: | col1 | col2 | col3 |
    - Markdown 标题: ## 标题
    - 普通文本

    需要提取其中的纯文本内容，并智能拆分表格单元格。
    """
    import re
    from html import unescape

    result = []
    y_offset = 0
    x_offset = 0

    def add_item(text: str, x: int = 0):
        """添加一个文本项"""
        nonlocal y_offset
        if text and len(text.strip()) > 0:
            new_box = [[x, y_offset], [x + 200, y_offset], [x + 200, y_offset + 30], [x, y_offset + 30]]
            result.append((new_box, text.strip(), 0.95))

    def process_table_row(row_text: str):
        """处理表格行，拆分为多个单元格"""
        nonlocal y_offset, x_offset
        x_offset = 0

        # 移除 Markdown 表格的 | 分隔符
        cells = [c.strip() for c in row_text.split('|') if c.strip()]

        if not cells:
            return

        # 检查是否是表头分隔行（如 |---|---|）
        if all(re.match(r'^[-:]+$', c) for c in cells):
            return

        # 为每个单元格创建独立的文本项
        for cell in cells:
            if cell:
                add_item(cell, x_offset)
                x_offset += 200

        y_offset += 35

    for box, text, confidence in items:
        # 跳过空文本
        if not text or not text.strip():
            continue

        # 处理 HTML 表格
        if '<table' in text.lower():
            # 提取表格中的文本内容
            text = re.sub(r'<tr[^>]*>', '\n', text)
            text = re.sub(r'<td[^>]*>', '|', text)
            text = re.sub(r'</td>', '|', text)
            text = re.sub(r'<[^>]+>', '', text)  # 移除所有 HTML 标签
            text = unescape(text)  # 解码 HTML 实体

            # 按行处理
            for line in text.split('\n'):
                line = line.strip()
                if line:
                    process_table_row(line)

        # 处理 Markdown 表格行
        elif '|' in text and re.search(r'\|.*\|', text):
            for line in text.split('\n'):
                line = line.strip()
                if line and '|' in line:
                    process_table_row(line)

        else:
            # 处理 Markdown 标题
            if text.startswith('##'):
                text = text.lstrip('#').strip()

            # 检查是否是包含专业信息的行（代码 + 空格 + 名称 + 数字）
            # 格式如: "47 外国语言文学类（小语种）... 1 6000"
            major_line_match = re.match(
                r'^(\d{1,2}|[A-Z][A-Z0-9]?)\s+([一-鿿].+?)\s+(\d+)\s+(\d+|免费)(.*)$',
                text.strip()
            )
            if major_line_match:
                # 拆分为：专业代码+名称、计划数、学费
                code = major_line_match.group(1)
                name = major_line_match.group(2)
                plan = major_line_match.group(3)
                tuition = major_line_match.group(4)

                # 合并代码和名称（去掉空格）
                add_item(f"{code}{name}", 0)
                add_item(plan, 600)
                add_item(tuition if tuition != "免费" else "免费", 700)
                y_offset += 35
                continue

            # 普通文本直接添加
            if text.strip():
                add_item(text.strip(), 0)
                y_offset += 35

    logger.info(f"AIStudio 格式转换: {len(items)} -> {len(result)} 行")
    return result


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


def extract_score_rows(img_path: str, engine: str = "") -> List[Tuple[int, int, int]]:
    """OCR 识别单张图片，提取一分一段表数据"""
    result = run_ocr_with_engine(img_path, engine)

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


# ==================== 四川省行政区划字典（用于地名校验）====================

SICHUAN_DISTRICTS = {
    # 成都市
    "锦江区", "青羊区", "金牛区", "武侯区", "成华区", "龙泉驿区", "青白江区", "新都区",
    "温江区", "双流区", "郫都区", "新津区", "简阳市", "都江堰市", "彭州市", "邛崃市",
    "崇州市", "金堂县", "大邑县", "蒲江县",
    # 自贡市
    "自流井区", "贡井区", "大安区", "沿滩区", "荣县", "富顺县",
    # 攀枝花市
    "东区", "西区", "仁和区", "米易县", "盐边县",
    # 泸州市
    "江阳区", "纳溪区", "龙马潭区", "泸县", "合江县", "叙永县", "古蔺县",
    # 德阳市
    "旌阳区", "罗江区", "广汉市", "什邡市", "绵竹市", "中江县",
    # 绵阳市
    "涪城区", "游仙区", "安州区", "江油市", "三台县", "盐亭县", "梓潼县", "北川羌族自治县", "平武县",
    # 广元市
    "利州区", "昭化区", "朝天区", "旺苍县", "青川县", "剑阁县", "苍溪县",
    # 遂宁市
    "船山区", "安居区", "蓬溪县", "大英县", "射洪市",
    # 内江市
    "市中区", "东兴区", "威远县", "资中县", "隆昌市",
    # 乐山市
    "市中区", "沙湾区", "五通桥区", "金口河区", "峨眉山市", "犍为县", "井研县", "夹江县",
    "沐川县", "峨边彝族自治县", "马边彝族自治县",
    # 南充市
    "顺庆区", "高坪区", "嘉陵区", "阆中市", "南部县", "营山县", "蓬安县", "仪陇县", "西充县",
    # 眉山市
    "东坡区", "彭山区", "仁寿县", "洪雅县", "丹棱县", "青神县",
    # 宜宾市
    "翠屏区", "南溪区", "叙州区", "江安县", "长宁县", "高县", "珙县", "筠连县", "兴文县", "屏山县",
    # 广安市
    "广安区", "前锋区", "华蓥市", "岳池县", "武胜县", "邻水县",
    # 达州市
    "通川区", "达川区", "万源市", "宣汉县", "开江县", "大竹县", "渠县",
    # 雅安市
    "雨城区", "名山区", "荥经县", "汉源县", "石棉县", "天全县", "芦山县", "宝兴县",
    # 巴中市
    "巴州区", "恩阳区", "通江县", "南江县", "平昌县",
    # 资阳市
    "雁江区", "安岳县", "乐至县",
    # 阿坝藏族羌族自治州
    "马尔康市", "汶川县", "理县", "茂县", "松潘县", "九寨沟县", "金川县", "小金县",
    "黑水县", "壤塘县", "阿坝县", "若尔盖县", "红原县",
    # 甘孜藏族自治州
    "康定市", "泸定县", "丹巴县", "九龙县", "雅江县", "道孚县", "炉霍县", "甘孜县",
    "新龙县", "德格县", "白玉县", "石渠县", "色达县", "理塘县", "巴塘县", "乡城县", "稻城县", "得荣县",
    # 凉山彝族自治州
    "西昌市", "木里藏族自治县", "盐源县", "德昌县", "会理市", "会东县", "宁南县", "普格县",
    "布拖县", "金阳县", "昭觉县", "喜德县", "冕宁县", "越西县", "甘洛县", "美姑县", "雷波县",
    # 市级
    "成都市", "自贡市", "攀枝花市", "泸州市", "德阳市", "绵阳市", "广元市", "遂宁市",
    "内江市", "乐山市", "南充市", "眉山市", "宜宾市", "广安市", "达州市", "雅安市",
    "巴中市", "资阳市", "阿坝州", "甘孜州", "凉山州",
}

# 常见 OCR 形近字错误映射
OCR_SIMILAR_CHAR_MAP = {
    "闻": "阆",  # 阆中市
    "朗": "阆",
    "间": "阆",
    "闵": "阆",
    "闰": "阆",
    "闸": "阆",
    "闽": "阆",  # 闽(min) -> 阆(lang)
    "阑": "阆",
    "兰": "阆",  # 可能的简化字错误
}


def correct_district_name(text: str) -> str:
    """校正地名中的 OCR 形近字错误"""
    # 先尝试直接替换已知的错误字符
    corrected = text
    for wrong, right in OCR_SIMILAR_CHAR_MAP.items():
        corrected = corrected.replace(wrong, right)

    # 如果替换后的地名在字典中，返回校正后的结果
    # 提取可能的地名部分（县/市/区）
    for district in SICHUAN_DISTRICTS:
        if district in corrected:
            return corrected

    # 如果没有匹配，返回原文本
    return text


def extract_plan_and_tuition(group: List[Dict], img_width: float) -> Tuple[int, str]:
    """
    从行数据中提取计划数和学费

    改进版本：
    1. 处理 "数字免费" 连写格式（如 "2免费"、"4免费"）
    2. 处理计划数在专业名称之前出现的情况
    3. 更智能地区分计划数和学费

    Args:
        group: 同一行的所有文本项
        img_width: 图片宽度

    Returns:
        (plan_count, tuition)
    """
    plan_count = 0
    tuition = ""

    # 定义右侧区域阈值（图片宽度的 50%，放宽一点以捕获更多数据）
    right_zone_threshold = img_width * 0.50

    # 收集所有可能的计划数和学费数据
    all_items = []

    for item in group:
        txt = item["text"].strip()
        x = item["x_left"]

        # 跳过左侧的专业名称区域（但不要太严格）
        if x < right_zone_threshold:
            # 检查是否是独立的数字或学费（可能是计划数在专业名称之前）
            if not re.match(r'^[\d免费元]+$', txt):
                continue

        # "数字免费" 格式（如 "2免费"、"4免费"、"6免费"）
        num_free_match = re.match(r'^(\d{1,2})(免费)$', txt)
        if num_free_match:
            plan_count = int(num_free_match.group(1))
            tuition = "免费"
            return plan_count, tuition

        # "数字元" 格式（如 "6000元"）
        num_yuan_match = re.match(r'^(\d+)(元)$', txt)
        if num_yuan_match:
            all_items.append((x, txt, int(num_yuan_match.group(1)), "tuition_with_yuan"))
            continue

        # 纯 "免费"
        if txt == "免费":
            all_items.append((x, txt, None, "tuition_free"))
            continue

        # 包含 "元" 的学费信息
        if "元" in txt:
            all_items.append((x, txt, None, "tuition"))
            continue

        # 纯数字
        num_match = re.match(r'^(\d+)$', txt)
        if num_match:
            val = int(num_match.group(1))
            all_items.append((x, txt, val, "number"))

    # 按 X 坐标排序
    all_items.sort(key=lambda item: item[0])

    # 分类处理
    numbers = [(x, val, txt) for x, txt, val, typ in all_items if typ == "number"]
    tuition_free = [item for item in all_items if item[3] == "tuition_free"]
    tuition_yuan = [item for item in all_items if item[3] in ("tuition", "tuition_with_yuan")]

    # 确定学费
    if tuition_free:
        tuition = "免费"
    elif tuition_yuan:
        # 取最右边的学费信息
        tuition_yuan.sort(key=lambda x: x[0], reverse=True)
        txt = tuition_yuan[0][1]
        if tuition_yuan[0][3] == "tuition_with_yuan":
            tuition = f"{tuition_yuan[0][2]}元"
        else:
            tuition = txt

    # 确定计划数
    if numbers:
        numbers.sort(key=lambda n: n[0])

        if len(numbers) >= 2:
            # 多个数字：左边是计划数，右边可能是学费
            plan_count = numbers[0][1]
            if not tuition and numbers[-1][1] > 100:
                tuition = f"{numbers[-1][1]}元"
        else:
            # 单个数字
            val = numbers[0][1]
            txt = numbers[0][2]

            # 检查是否是 OCR 把 "计划数+学费" 识别成了一个数字
            if len(txt) == 5 and val >= 10000:
                # 如 "16875" -> 计划数 1, 学费 6875
                first_digit = int(txt[0])
                last_four = int(txt[1:])
                if 1 <= first_digit <= 9 and 3000 <= last_four <= 9999:
                    plan_count = first_digit
                    if not tuition:
                        tuition = f"{last_four}元"
                elif not tuition:
                    tuition = f"{val}元"
            elif len(txt) == 6 and val >= 100000:
                # 如 "126875" -> 计划数 12, 学费 6875
                first_two = int(txt[:2])
                last_four = int(txt[2:])
                if 1 <= first_two <= 99 and 3000 <= last_four <= 9999:
                    plan_count = first_two
                    if not tuition:
                        tuition = f"{last_four}元"
                elif not tuition:
                    tuition = f"{val}元"
            elif val > 1000:
                # 大于 1000 的数字通常是学费
                if not tuition:
                    tuition = f"{val}元"
            elif val <= 100:
                # 小于等于 100 的数字通常是计划数
                plan_count = val

    return plan_count, tuition


def extract_plan_and_tuition_from_row(row_items: List[Dict], img_width: float, major_x_right: float = 0) -> Tuple[int, str]:
    """
    从整行数据中提取计划数和学费（改进版）

    专门处理计划数在专业名称之前出现的情况

    Args:
        row_items: 整行的所有文本项
        img_width: 图片宽度
        major_x_right: 专业名称的右边界 X 坐��

    Returns:
        (plan_count, tuition)
    """
    plan_count = 0
    tuition = ""

    # 收集专业名称右侧的所有数字和学费信息
    right_items = []

    for item in row_items:
        txt = item["text"].strip()
        x = item["x_left"]

        # 只处理专业名称右侧的内容
        if major_x_right > 0 and x < major_x_right - 20:
            continue

        # "数字免费" 格式
        num_free_match = re.match(r'^(\d{1,2})(免费)$', txt)
        if num_free_match:
            return int(num_free_match.group(1)), "免费"

        if txt == "免费":
            tuition = "免费"
            continue

        if "元" in txt:
            match = re.search(r'(\d+)', txt)
            if match:
                tuition = f"{match.group(1)}元"
            else:
                tuition = txt
            continue

        # 纯数字
        num_match = re.match(r'^(\d+)$', txt)
        if num_match:
            val = int(num_match.group(1))
            right_items.append((x, val, txt))

    # 处理数字
    if right_items:
        right_items.sort(key=lambda x: x[0])

        if len(right_items) >= 2:
            plan_count = right_items[0][1]
            if not tuition and right_items[-1][1] > 100:
                tuition = f"{right_items[-1][1]}元"
        else:
            val = right_items[0][1]
            if val <= 100:
                plan_count = val
            elif not tuition:
                tuition = f"{val}元"

    return plan_count, tuition


def extract_page_number(ocr_result: List[Tuple], img_height: float = None) -> int:
    """
    从 OCR 结果中提取页码

    四川省考试院征集志愿 PDF 页码格式为 "- X -" 或 "—X—"，位于页面底部左右两侧交替出现：
    - 奇数页：右下角
    - 偶数页：左下角

    Args:
        ocr_result: OCR 识别结果 [(box, text, confidence), ...]
        img_height: 图片高度（可选，用于确定底部区域）

    Returns:
        页码数字，如果未找到返回 0
    """
    if not ocr_result:
        return 0

    # 页码匹配模式（"- X -" 格式，优先级最高）
    page_patterns = [
        r'^[—一-]\s*(\d+)\s*[—一-]$',  # "—9—" "- 1 -" 等（完全匹配）
        r'^-\s*(\d+)\s*-$',             # "- 1 -"
        r'^—\s*(\d+)\s*—$',             # "— 1 —"
        r'[—一-]\s*(\d+)\s*[—一-]',     # 宽松匹配：文本中包含 "- X -"
    ]

    # 第一轮：在所有 OCR 结果中查找 "- X -" 格式（不限位置）
    # 这是最可靠的页码格式
    for box, text, confidence in ocr_result:
        text = text.strip()
        for pattern in page_patterns:
            match = re.search(pattern, text)
            if match:
                page_num = int(match.group(1))
                if 1 <= page_num <= 999:
                    logger.info(f"提取到页码: {page_num} (来自格式匹配: '{text}')")
                    return page_num

    # 如果没有找到 "- X -" 格式，再按位置查找
    # 估算图片高度（取所有 box 的最大 y 坐标）
    if img_height is None:
        img_height = max(box[2][1] for box, _, _ in ocr_result) * 1.1

    # 估算图片宽度
    img_width = max(box[2][0] for box, _, _ in ocr_result) * 1.1

    logger.info(f"页码提取: 图片尺寸估算 {img_width:.0f}x{img_height:.0f}")

    # 收集所有文本及其位置
    all_items = []
    for box, text, confidence in ocr_result:
        y_center = (box[0][1] + box[2][1]) / 2
        x_center = (box[0][0] + box[2][0]) / 2
        all_items.append({
            "text": text.strip(),
            "x": x_center,
            "y": y_center,
            "is_left": x_center < img_width * 0.4,   # 左侧 40%
            "is_right": x_center > img_width * 0.6,  # 右侧 40%
            "is_bottom": y_center > img_height * 0.85,  # 底部 15%
        })

    # 按 y 坐标降序排序（最底部的在前）
    all_items.sort(key=lambda x: x["y"], reverse=True)

    # 取最底部的 15 个元素
    bottom_items = all_items[:15]

    bottom_info = [(item['text'], f"x={item['x']:.0f}", f"y={item['y']:.0f}", 'L' if item['is_left'] else 'R' if item['is_right'] else 'M', 'B' if item['is_bottom'] else '') for item in bottom_items]
    logger.info(f"页码提取: 最底部15个文本 {bottom_info}")

    # 第二轮：在底部左右两侧查找 "第 X 页" 或 "X/Y" 格式
    other_patterns = [
        r'^第\s*(\d+)\s*页',           # "第 1 页"
        r'^(\d+)\s*/\s*\d+$',          # "1/10"
    ]

    for item in bottom_items:
        if not (item["is_left"] or item["is_right"]):
            continue
        text = item["text"]
        for pattern in other_patterns:
            match = re.search(pattern, text)
            if match:
                page_num = int(match.group(1))
                if 1 <= page_num <= 999:
                    side = "左侧" if item["is_left"] else "右侧"
                    logger.info(f"提取到页码: {page_num} (来自{side}: '{text}')")
                    return page_num

    # 第三轮：在底部左右两侧查找纯数字（仅限最底部的元素）
    # 只有当该数字是底部区域最靠下的元素时才认为是页码
    if bottom_items:
        first_item = bottom_items[0]  # 最底部的元素
        text = first_item["text"].strip()
        # 检查是否是纯数字且在左下或右下角
        if (first_item["is_left"] or first_item["is_right"]) and first_item["is_bottom"]:
            if re.match(r'^\d{1,3}$', text):
                num = int(text)
                if 1 <= num <= 200:
                    side = "左下角" if first_item["is_left"] else "右下角"
                    logger.info(f"提取到页码: {num} (来自{side}纯数字: '{text}')")
                    return num

    logger.warning(f"未找到页码")
    return 0


# ==================== 征集志愿 OCR ====================

def extract_supplementary_rows(img_path: str, context: Dict = None, ocr_result: List = None) -> List[Dict]:
    """
    OCR 识别四川省考试院征集志愿格式 - 重构版本

    采用"状态机 + 块累加"机制，解决以下问题：
    1. 括号解析逻辑崩塌 - 专门定位 (专业备注: 进行靶向切割
    2. 折行与跨页数据丢失 - 块累加器机制
    3. 数字错位 - 组计划数校验
    4. 全局状态跨页串台 - 实时更新全局 Context
    5. 形近字错误 - 地名字典校验

    Args:
        img_path: 图片路径
        context: 上一张图片的上下文状态（用于跨页延续）
        ocr_result: 可选，已有的 OCR 结果（用于多引擎校验时避免重复调用 OCR）

    Returns:
        解析出的专业数据列表
    """
    # 如果提供了 OCR 结果，直接使用；否则调用 OCR
    if ocr_result is not None:
        result = ocr_result
        logger.info(f"使用已有 OCR 结果，数量: {len(result) if result else 0}")
    else:
        result = run_ocr(img_path)
        logger.info(f"OCR 引擎: {_ocr_engine}, 原始结果数量: {len(result) if result else 0}")

    if not result:
        return []

    # 获取图片宽度，用于计算 X 坐标的相对位置
    max_x_right = max(box[2][0] for box, _, _ in result)
    img_width = max_x_right * 1.05
    logger.info(f"估算图片宽度: {img_width:.0f}px")

    # 收集识别结果
    items = []
    for box, text, confidence in result:
        y_center = (box[0][1] + box[2][1]) / 2
        x_left = box[0][0]
        x_right = box[2][0]
        items.append({
            "y": y_center,
            "x_left": x_left,
            "x_right": x_right,
            "text": text.strip(),
            "confidence": confidence
        })

    # 按 y 坐标分组为行
    # 改进：使用更小的阈值 (10px) 来避免将不同行合并
    # 同时考虑文本内容：如果是院校行或专业组行，应该单独成行
    items.sort(key=lambda x: x["y"])
    row_groups = []
    current_group = [items[0]]

    ROW_Y_THRESHOLD = 10  # 减小阈值，避免将不同行合并

    for item in items[1:]:
        y_diff = abs(item["y"] - current_group[-1]["y"])

        # 如果 y 差距小于阈值，可能是同一行
        if y_diff < ROW_Y_THRESHOLD:
            current_group.append(item)
        else:
            row_groups.append(current_group)
            current_group = [item]
    row_groups.append(current_group)

    # 后处理：检查是否有行被错误合并
    # 如果一行中同时包含院校信息和专业组信息，需要拆分
    final_row_groups = []
    for group in row_groups:
        group.sort(key=lambda x: x["x_left"])
        texts = [item["text"] for item in group]
        all_text = " ".join(texts)

        # 检查是否需要拆分
        has_university = any(re.match(r'^\d{4}[一-鿿]+', t) for t in texts)
        has_major_group = any("专业组" in t for t in texts)

        if has_university and has_major_group:
            # 需要拆分：院校行和专业组行
            uni_items = []
            group_items = []
            for item in group:
                if re.match(r'^\d{4}[一-鿿]+', item["text"]):
                    uni_items.append(item)
                elif "专业组" in item["text"] or re.match(r'^\d{1,3}$', item["text"]):
                    group_items.append(item)
                else:
                    # 根据 y 坐标决定归属
                    if uni_items and abs(item["y"] - uni_items[0]["y"]) < 5:
                        uni_items.append(item)
                    else:
                        group_items.append(item)

            if uni_items:
                final_row_groups.append(uni_items)
            if group_items:
                final_row_groups.append(group_items)
        else:
            final_row_groups.append(group)

    row_groups = final_row_groups

    # 调试：打印分组结果
    for i, group in enumerate(row_groups):
        group.sort(key=lambda x: x["x_left"])
        texts = [item["text"] for item in group]
        logger.info(f"[{i:2d}] {texts}")

    rows = []

    # ========== 状态机：从上下文恢复或初始化 ==========
    current_exam_type = context.get("exam_type", "") if context else ""
    current_enrollment_type = context.get("enrollment_type", "") if context else ""
    current_university = context.get("university", {}) if context else {}
    current_major_group = context.get("major_group", {}) if context else {}

    # 核心：专业区块累加器（用于处理跨行专业）
    current_major_block = None

    def save_major_block():
        """保存当前累加的专业区块"""
        nonlocal current_major_block
        if not current_major_block:
            return

        block = current_major_block
        current_major_block = None

        # 解析专业名称和备注
        full_text = block["text"]

        # 校正地名中的 OCR 形近字错误
        full_text = correct_district_name(full_text)

        # 策略：定位 (专业备注: 或 (包含专业: 进行靶向切割
        major_name = ""
        major_note = ""

        # 查找专业备注的位置
        note_patterns = [
            r'[（(]专业备注[：:]\s*([^）)]+)[）)]?',
            r'[（(]包含专业[：:]\s*([^）)]+)[）)]?',
        ]

        note_match = None
        for pattern in note_patterns:
            note_match = re.search(pattern, full_text)
            if note_match:
                major_note = note_match.group(1).strip()
                # 专业名称是备注之前的部分
                major_name = full_text[:note_match.start()].strip()
                break

        if not note_match:
            # 没有找到专业备注，尝试提取第一个括号内的内容作为备注
            paren_match = re.match(r'^([^（(]+)[（(]([^）)]+)[）)]', full_text)
            if paren_match:
                major_name = paren_match.group(1).strip()
                major_note = paren_match.group(2).strip()
            else:
                # 没有括号，整个文本作为专业名称
                major_name = re.split(r'[（(]', full_text)[0].strip()

        # 跳过无效专业名
        if len(major_name) < 2:
            logger.warning(f"    跳过无效专业: {full_text[:50]}")
            return

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
            "major_code": block["code"],
            "major_name": major_name,
            "major_note": major_note,
            "plan_count": block.get("plan", 1),
            "tuition": block.get("tuition", ""),
        }

        rows.append(row)
        logger.info(f"    专业: {block['code']} {major_name} 计划:{block.get('plan', 1)} {block.get('tuition', '')}")

    # ========== 主循环：逐行处理 ==========
    for group in row_groups:
        group.sort(key=lambda x: x["x_left"])
        first_text = group[0]["text"] if group else ""
        all_text = " ".join([item["text"] for item in group])

        # 1. 检测考试类型: "一、历史类" 或 "二、物理类"
        # 优先级最高，必须在处理任何其他内容之前检测
        if re.search(r'[一二三]、\s*历史类', all_text) or (
            "历史类" in all_text and "物理类" not in all_text and len(all_text) < 25
        ):
            save_major_block()  # 保存之前的专业
            current_exam_type = "历史类"
            logger.info(f">>> 考试类型切换: 历史类")
            continue
        if re.search(r'[一二三]、\s*物理类', all_text) or (
            "物理类" in all_text and "历史类" not in all_text and len(all_text) < 25
        ):
            save_major_block()  # 保存之前的专业
            current_exam_type = "物理类"
            logger.info(f">>> 考试类型切换: 物理类")
            continue

        # 2. 检测招生类型: "(1)国家公费师范生" 或 "(5)其他"
        enroll_match = re.match(r'^[（(](\d{1,2})[）)]\s*(.*)$', first_text.strip())
        if enroll_match and len(first_text) < 25:
            enrollment_name = enroll_match.group(2).strip()
            if not enrollment_name and len(group) > 1:
                for item in group[1:]:
                    txt = item["text"].strip()
                    if txt and not re.match(r'^\d+$', txt):
                        enrollment_name = txt
                        break
            if not enrollment_name:
                enrollment_name = f"类型{enroll_match.group(1)}"
            if enrollment_name and not any(kw in enrollment_name for kw in ["院校", "专业", "计划收费"]):
                save_major_block()  # 保存之前的专业
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

        # 4. 检测院校行: "0048华中师范大学（湖北省武汉市）" 或 "0012 北京语言大学(北京市)"
        # 注意：AIStudio 返回的格式可能在代码和名称之间有空格
        uni_match = re.match(r'^(\d{4})\s*([一-鿿]+(?:大学|学院|学校)[一-鿿]*)[（(]([^）)]+)[）)]', first_text)
        if uni_match:
            save_major_block()  # 保存之前的专业
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
            save_major_block()  # 保存之前的���业
            group_plan = 0
            # 提取专业组计划数（通常在行末尾的数字）
            for item in reversed(group):
                num_match = re.match(r'^(\d+)$', item["text"])
                if num_match:
                    val = int(num_match.group(1))
                    if 1 <= val <= 200:  # 合理的计划数范围
                        group_plan = val
                        break

            current_major_group = {
                "code": group_match.group(1),
                "subject": group_match.group(2),
                "plan": group_plan,
                "majors_plan_sum": 0  # 用于校验
            }
            logger.info(f"  >> 专业组: {current_major_group['code']} 计划:{group_plan}")
            continue

        # 6. 检测新专业行
        # 专业代码格式：纯数字(18, 47)、数字+字母(7S)、字母+字母(BL)、字母+数字(K1)、带[V]标记(G7[V])
        # 注意：OCR 可能将 [V] 识别为各种变体：【V】、【V]、［V]、[V］、【VJ 等
        #
        # 改进：不仅检查 first_text，还要检查整行是否包含专业代码
        # 因为有时计划数和学费会出现在专业名称之前（OCR 识别顺序问题）

        is_new_major = False
        major_code = ""
        major_text = ""
        major_item = None  # 记录专业名称所在的 item

        # [V] 标记的正则：兼容各种中英文方括号变体
        # 包括：[V]、【V】、【V]、［V]、[V］、【VJ、[VJ 等
        v_mark_pattern = r'[\[【［][VvＶ][\]】］J]?'

        # 专业代码模式：支持纯数字(18, 47)、字母数字组合(BL, 7S, K1)
        # 注意：纯数字代码通常是 2 位，需要与计划数/学费区分
        major_code_pattern = r'([A-Z][A-Z0-9]?|[0-9][A-Z]|[0-9]{2})'

        # 首先尝试从 first_text 检测
        if not re.match(r'^\d{1,2}(免费|元|\d{4,})?\s*$', first_text.strip()):
            # 模式1：代码紧跟中文（如 "47外国语言文学类" 或 "BL地理科学"）
            major_match = re.match(rf'^{major_code_pattern}({v_mark_pattern})?([一-鿿]{{2,}}.*)', first_text)
            if major_match and current_university.get("code"):
                is_new_major = True
                major_code = major_match.group(1)
                if major_match.group(2):
                    major_code += "[V]"  # 统一标准化为 [V]
                major_text = major_match.group(3)
                major_item = group[0]

        # 如果 first_text 不是专业，检查整行其他元素
        # 这处理了计划数/学费出现在专业名称之前的情况
        if not is_new_major and current_university.get("code"):
            for item in group:
                txt = item["text"].strip()
                # 跳过纯数字（可能是计划数/学费）、免费、学费等
                # 但不跳过 2 位数字后紧跟中文的情况
                if re.match(r'^[\d免费元]+$', txt):
                    continue
                if re.match(r'^\d+元$', txt):
                    continue

                # 尝试匹配专业代码+名称
                major_match = re.match(rf'^{major_code_pattern}({v_mark_pattern})?([一-鿿]{{2,}}.*)', txt)
                if major_match:
                    is_new_major = True
                    major_code = major_match.group(1)
                    if major_match.group(2):
                        major_code += "[V]"  # 统一标准化为 [V]
                    major_text = major_match.group(3)
                    major_item = item
                    break

        if is_new_major:
            # 遇到新专业代码，先保存上一个专业
            save_major_block()

            # 提取计划数和学费
            # 使用改进版函数，传入专业名称的位置信息
            if major_item:
                plan_count, tuition = extract_plan_and_tuition_from_row(group, img_width, major_item.get("x_right", 0))
            else:
                plan_count, tuition = extract_plan_and_tuition(group, img_width)

            # 如果没有提取到计划数，尝试从行首的数字获取
            if plan_count == 0:
                for item in group:
                    txt = item["text"].strip()
                    if item == major_item:
                        break
                    num_match = re.match(r'^(\d{1,2})$', txt)
                    if num_match:
                        plan_count = int(num_match.group(1))
                        break

            # 开启新的专业区块
            current_major_block = {
                "code": major_code,
                "text": major_text,
                "plan": plan_count if plan_count > 0 else 1,
                "tuition": tuition
            }
            logger.info(f"    新专业: {major_code} {major_text[:30]}... 计划:{plan_count} {tuition}")
            continue

        # 7. 折行累加：不是特殊标题、学校、专业组、新专业时
        if current_major_block:
            # 检查是否是纯数字行（可能是计划数和学费）
            all_nums = all(re.match(r'^[\d免费元]+$', item["text"]) for item in group)

            if all_nums:
                # 纯数字行，尝试提取计划数和学费
                plan, tuition = extract_plan_and_tuition(group, img_width)
                if plan > 0 and current_major_block.get("plan", 0) <= 1:
                    current_major_block["plan"] = plan
                if tuition and not current_major_block.get("tuition"):
                    current_major_block["tuition"] = tuition
                logger.info(f"      续行数字: 计划={plan} 学费={tuition}")
            else:
                # 文本行，拼接到专业名称
                continuation_text = " ".join([item["text"] for item in group if not re.match(r'^[\d免费元]+$', item["text"])])
                current_major_block["text"] += continuation_text
                # 同时检查是否有计划数和学费
                plan, tuition = extract_plan_and_tuition(group, img_width)
                if plan > 0 and current_major_block.get("plan", 0) <= 1:
                    current_major_block["plan"] = plan
                if tuition and not current_major_block.get("tuition"):
                    current_major_block["tuition"] = tuition
                logger.info(f"      续行文本: {continuation_text[:30]}...")

    # 循环结束后，保存最后一个专业
    save_major_block()

    # 专业组计划数校验
    validate_group_plans(rows)

    logger.info(f"解析完成，共 {len(rows)} 条记录")
    return rows


def validate_group_plans(rows: List[Dict]) -> None:
    """
    校验并修复专业组计划数

    功能：
    1. 如果专业组计划数为 0，用该组各专业计划数之和填充
    2. 如果专业组计划数与专业计划数之和不匹配，记录警告日志

    注意：同一专业组代码在不同考试类型（历史类/物理类）下是独立的，
    需要按 院校代码 + 考试类型 + 专业组代码 进行分组校验
    """
    # 按 院校+考试类型+专业组 分组
    groups = {}
    for row in rows:
        # 使用 exam_type 区分同一专业组在不同考试类型下的情况
        key = f"{row.get('university_code', '')}_{row.get('exam_type', '')}_{row.get('major_group_code', '')}"
        if key not in groups:
            groups[key] = {
                "group_plan": row.get("major_group_plan", 0),
                "majors": [],
                "exam_type": row.get("exam_type", "")
            }
        groups[key]["majors"].append(row)

    # 校验并修复每个专业组
    for key, data in groups.items():
        group_plan = data["group_plan"]
        majors_sum = sum(m.get("plan_count", 0) for m in data["majors"])

        uni_code = data["majors"][0].get("university_code", "") if data["majors"] else ""
        group_code = data["majors"][0].get("major_group_code", "") if data["majors"] else ""
        exam_type = data.get("exam_type", "")

        # 如果专业组计划数为 0，用专业计划数之和填充
        if group_plan == 0 and majors_sum > 0:
            logger.info(
                f"📝 自动填充专业组计划数: 院校{uni_code} [{exam_type}] 专业组{group_code} "
                f"计划数={majors_sum}"
            )
            for major in data["majors"]:
                major["major_group_plan"] = majors_sum
        elif group_plan > 0 and majors_sum != group_plan:
            logger.warning(
                f"⚠️ 计划数校验失败: 院校{uni_code} [{exam_type}] 专业组{group_code} "
                f"组计划={group_plan} 专业计划之和={majors_sum}"
            )


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

    注意：同一专业在不同考试类型（历史类/物理类）下是不同的记录，
    需要包含 exam_type 在去重 key 中
    """
    # 按院校代码+考试类型+专业组+专业代码去重，保持原始顺序
    seen = set()
    unique_rows = []

    for row in rows:
        # 包含 exam_type 和 major_group_code 以区分不同考试类型和专业组的同名专业
        key = f"{row.get('university_code', '')}_{row.get('exam_type', '')}_{row.get('major_group_code', '')}_{row.get('major_code', '')}_{row.get('major_name', '')}"
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
    engine = OCR_ENGINE
    if engine == "baidu":
        engine_status = "baidu" if BAIDU_OCR_API_KEY else "baidu (no key)"
    elif engine == "paddleocr_vl":
        engine_status = "paddleocr_vl" if QIANFAN_API_KEY else "paddleocr_vl (no key)"
    elif engine == "paddleocr":
        # 检查 PaddleOCR Docker 服务是否可用
        try:
            resp = http_requests.get(f"{PADDLEOCR_SERVICE_URL}/health", timeout=5)
            engine_status = "paddleocr" if resp.status_code == 200 else "paddleocr (unavailable)"
        except:
            engine_status = "paddleocr (unavailable)"
    else:
        engine_status = _ocr_engine or "not_loaded"

    return {
        "status": "ok",
        "ocr_engine": engine_status,
        "ocr_loaded": engine in ("baidu", "paddleocr", "paddleocr_vl") or _ocr_instance is not None,
        "baidu_configured": bool(BAIDU_OCR_API_KEY and BAIDU_OCR_SECRET_KEY),
        "qianfan_configured": bool(QIANFAN_API_KEY),
        "paddleocr_url": PADDLEOCR_SERVICE_URL if engine == "paddleocr" else None
    }


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
def handle_ocr(req: OcrRequest):
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
    """一分一段表 OCR（支持指定引擎）"""
    all_rows = []

    # 获取指定的引擎
    specified_engine = getattr(req, 'engine', '') or ''
    if specified_engine:
        logger.info(f"使用指定引擎: {specified_engine}")

    for i, url in enumerate(req.image_urls):
        logger.info(f"OCR {i+1}/{len(req.image_urls)}: {url}")
        img_path = download_image(url)
        rows = extract_score_rows(img_path, specified_engine)
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
    """征集志愿 OCR（纯 OCR 模式，支持图像预处理增强和指定引擎）"""
    all_rows = []
    image_data_counts = []  # 记录每张图片识别的数据行数
    # 跨图片传递状态
    last_exam_type = ""
    last_enrollment_type = ""
    context = {}  # 用于跨图片传递上下文

    # 获取指定的引擎
    specified_engine = getattr(req, 'engine', '') or ''
    if specified_engine:
        logger.info(f"使用指定引擎: {specified_engine}")

    # 是否启用预处理增强
    use_preprocess = getattr(req, 'enable_preprocess', False)
    if use_preprocess:
        from image_preprocessor import run_ocr_with_preprocessing
        logger.info("启用图像预处理增强模式")

    for i, url in enumerate(req.image_urls):
        logger.info(f"征集志愿 OCR {i+1}/{len(req.image_urls)}: {url}")
        img_path = download_image(url)

        # 使用指定引擎或默认引擎运行 OCR
        ocr_result = run_ocr_with_engine(img_path, specified_engine)

        # 从 OCR 结果中提取页码
        page_number = extract_page_number(ocr_result)
        logger.info(f"  图片 {i+1} 页码: {page_number}")

        # 解析数据行
        if use_preprocess:
            # 使用预处理增强模式：多变体 + 投票
            ocr_func = lambda p: run_ocr_with_engine(p, specified_engine)
            rows, preprocess_stats = run_ocr_with_preprocessing(
                img_path,
                ocr_func=ocr_func,
                parse_func=extract_supplementary_rows,
                context=context
            )
            logger.info(f"  预处理增强: {preprocess_stats.get('variant_results', {})}")
        else:
            # 普通模式
            rows = extract_supplementary_rows(img_path, context, ocr_result)

        logger.info(f"  识别 {len(rows)} 行")

        # 为每条数据添加来源 URL 和页码
        for row in rows:
            row["source_url"] = req.source_url
            row["page_number"] = page_number
            # 移除预处理模块添加的内部字段
            row.pop("_sources", None)
            row.pop("_source_count", None)

        # 更新上下文（用于下一张图片）
        if rows:
            last_row = rows[-1]
            context = {
                "exam_type": last_row.get("exam_type", ""),
                "enrollment_type": last_row.get("enrollment_type", ""),
                "university": {
                    "code": last_row.get("university_code", ""),
                    "name": last_row.get("university_name", ""),
                    "location": last_row.get("university_location", ""),
                    "note": last_row.get("university_note", ""),
                },
                "major_group": {
                    "code": last_row.get("major_group_code", ""),
                    "subject": last_row.get("major_group_subject", ""),
                    "plan": last_row.get("major_group_plan", 0),
                }
            }

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
    image_page_numbers = []  # 记录每张图片的页码

    # 跨图片传递状态
    last_exam_type = ""
    last_enrollment_type = ""
    context = {}

    # 第一步：OCR 识别所有图片
    for i, url in enumerate(req.image_urls):
        logger.info(f"征集志愿 OCR {i+1}/{len(req.image_urls)}: {url}")
        img_path = download_image(url)
        image_paths.append(img_path)

        # 先运行 OCR 获取原始结果
        ocr_result = run_ocr(img_path)

        # 从 OCR 结果中提取页码
        page_number = extract_page_number(ocr_result)
        image_page_numbers.append(page_number)
        logger.info(f"  图片 {i+1} 页码: {page_number}")

        rows = extract_supplementary_rows(img_path, context, ocr_result)
        logger.info(f"  OCR 识别 {len(rows)} 行")

        # 为每条数据添加来源 URL 和页码
        for row in rows:
            row["source_url"] = req.source_url
            row["page_number"] = page_number

        # 更新上下文（用于下一张图片）
        if rows:
            last_row = rows[-1]
            context = {
                "exam_type": last_row.get("exam_type", ""),
                "enrollment_type": last_row.get("enrollment_type", ""),
                "university": {
                    "code": last_row.get("university_code", ""),
                    "name": last_row.get("university_name", ""),
                    "location": last_row.get("university_location", ""),
                    "note": last_row.get("university_note", ""),
                },
                "major_group": {
                    "code": last_row.get("major_group_code", ""),
                    "subject": last_row.get("major_group_subject", ""),
                    "plan": last_row.get("major_group_plan", 0),
                }
            }

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

            # 为 AI 识别的数据也添加来源 URL 和页码
            page_number = image_page_numbers[i] if i < len(image_page_numbers) else 0
            for row in ai_rows:
                row["source_url"] = req.source_url
                row["page_number"] = page_number

            # 更新上下文
            if ai_rows:
                last_row = ai_rows[-1]
                context = {
                    "exam_type": last_row.get("exam_type", ""),
                    "enrollment_type": last_row.get("enrollment_type", ""),
                    "university": {
                        "code": last_row.get("university_code", ""),
                        "name": last_row.get("university_name", ""),
                        "location": last_row.get("university_location", ""),
                        "note": last_row.get("university_note", ""),
                    },
                    "major_group": {
                        "code": last_row.get("major_group_code", ""),
                        "subject": last_row.get("major_group_subject", ""),
                        "plan": last_row.get("major_group_plan", 0),
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


# ==================== 多引擎交叉校验 API ====================

class MultiEngineOcrRequest(BaseModel):
    """多引擎 OCR 请求"""
    image_urls: List[str] = Field(..., description="图片 URL 列表")
    data_type: str = Field("supplementary", description="数据类型: score_segment / supplementary")
    year: int = Field(..., description="年份")
    province: str = Field("四川", description="省份")
    exam_type: str = Field("物理类", description="考试类型")
    batch: str = Field("本科一批", description="批次")
    source_url: str = Field("", description="数据来源网页 URL")
    # 单引擎模式
    single_engine_mode: bool = Field(False, description="单引擎模式：自动选择最佳引擎")
    preferred_engine: str = Field("", description="指定单引擎（留空则自动选择最佳引擎）")
    # 引擎开关（多引擎模式时生效）
    enable_baidu: bool = Field(True, description="启用百度云 OCR")
    enable_paddleocr_vl: bool = Field(False, description="启用 PaddleOCR-VL 视觉语言模型")
    enable_aistudio: bool = Field(False, description="启用 AIStudio Layout-Parsing")
    enable_paddleocr: bool = Field(True, description="启用 PaddleOCR Docker")
    enable_rapid: bool = Field(True, description="启用 RapidOCR")
    enable_ai: bool = Field(True, description="启用 AI 视觉模型")
    # AI 配置
    ai_api_key: str = Field("", description="AI API 密钥")
    ai_base_url: str = Field("", description="AI API 基础 URL")
    ai_model: str = Field("", description="AI 模型名称")


class EngineResultSummary(BaseModel):
    """单引擎结果摘要"""
    engine: str
    success: bool
    record_count: int
    error: str = ""


class FieldDiff(BaseModel):
    """字段差异"""
    field_name: str
    values: Dict[str, str]  # engine -> value
    is_consistent: bool
    majority_value: str = ""


class RecordValidationResult(BaseModel):
    """单条记录校验结果"""
    record_key: str
    confidence: str  # high / medium / low / conflict / single
    review_status: str  # auto_approved / pending_review
    merged_data: Dict
    engine_sources: List[str]  # 哪些引擎识别到了这条记录
    conflict_fields: List[str] = []
    field_diffs: List[FieldDiff] = []
    review_note: str = ""


class MultiEngineValidationResponse(BaseModel):
    """多引擎校验响应"""
    # 引擎执行情况
    engines_used: List[str]
    engines_success: List[str]
    engines_failed: Dict[str, str]
    engine_results: List[EngineResultSummary]

    # 统计
    total_records: int
    high_confidence: int
    medium_confidence: int
    low_confidence: int
    conflicts: int
    auto_approved_count: int
    pending_review_count: int

    # 数据
    approved_data: List[SupplementaryRow]  # 自动通过的数据
    pending_review_data: List[RecordValidationResult]  # 待审核的数据

    # 校验结果
    is_valid: bool
    errors: List[str]


@app.post("/ocr-multi-engine", response_model=MultiEngineValidationResponse)
async def run_multi_engine_ocr(req: MultiEngineOcrRequest):
    """
    多引擎交叉校验 OCR

    使用多个 OCR 引擎（百度云、PaddleOCR、RapidOCR、AI视觉模型）同时识别，
    通过交叉比对确保数据准确性。

    支持两种模式：
    1. 多引擎模式（默认）：使用多个引擎交叉校验
    2. 单引擎模式：自动选择最佳引擎或使用指定引擎

    校验策略：
    - 所有引擎一致：高置信度，自动通过
    - 多数引擎一致：中置信度，自动通过
    - 引擎结果分歧：标记待人工审核
    """
    from multi_engine_validator import (
        MultiEngineValidator,
        SupplementaryValidator,
        ScoreSegmentValidator,
        VerifyConfidence,
        ReviewStatus
    )

    logger.info(f"开始多引擎校验，图片数量: {len(req.image_urls)}, 单引擎模式: {req.single_engine_mode}")

    # 创建校验器
    ai_config = {
        "api_key": req.ai_api_key,
        "base_url": req.ai_base_url,
        "model": req.ai_model
    } if req.ai_api_key else None

    # 单引擎模式处理
    if req.single_engine_mode:
        # 创建临时校验器用于选择最佳引擎
        temp_validator = MultiEngineValidator(
            enable_baidu=req.enable_baidu,
            enable_paddleocr_vl=req.enable_paddleocr_vl,
            enable_aistudio=req.enable_aistudio,
            enable_paddleocr=req.enable_paddleocr,
            enable_rapid=req.enable_rapid,
            enable_ai=req.enable_ai and bool(req.ai_api_key),
            ai_config=ai_config
        )

        # 确定使用哪个引擎
        if req.preferred_engine:
            # 用户指定了引擎
            selected_engine = req.preferred_engine
            logger.info(f"单引擎模式：使用用户指定引擎 {selected_engine}")
        else:
            # 自动选择最佳引擎
            selected_engine = temp_validator.get_best_single_engine(req.data_type)
            if not selected_engine:
                raise HTTPException(status_code=400, detail="没有可用的 OCR 引擎")
            logger.info(f"单引擎模式：自动选择最佳引擎 {selected_engine}")

        # 创建只启用选定引擎的校验器
        validator = MultiEngineValidator(
            enable_baidu=(selected_engine == "baidu"),
            enable_paddleocr_vl=(selected_engine == "paddleocr_vl"),
            enable_aistudio=(selected_engine == "aistudio"),
            enable_paddleocr=(selected_engine == "paddleocr"),
            enable_rapid=(selected_engine == "rapid"),
            enable_ai=(selected_engine == "ai"),
            ai_config=ai_config
        )
    else:
        # 多引擎模式
        validator = MultiEngineValidator(
            enable_baidu=req.enable_baidu,
            enable_paddleocr_vl=req.enable_paddleocr_vl,
            enable_aistudio=req.enable_aistudio,
            enable_paddleocr=req.enable_paddleocr,
            enable_rapid=req.enable_rapid,
            enable_ai=req.enable_ai and bool(req.ai_api_key),
            ai_config=ai_config
        )

    # 下载所有图片
    image_paths = []
    for url in req.image_urls:
        try:
            img_path = download_image(url)
            image_paths.append(img_path)
        except Exception as e:
            logger.error(f"下载图片失败: {url}, {e}")

    if not image_paths:
        raise HTTPException(status_code=400, detail="没有成功下载任何图片")

    # 汇总所有图片的校验结果
    all_engine_results: Dict[str, List[Dict]] = {}  # engine -> all rows
    engines_success = set()
    engines_failed = {}
    image_page_numbers = []  # 每张图片的页码

    context = {}

    # 对每张图片运行所有引擎
    for i, img_path in enumerate(image_paths):
        logger.info(f"处理图片 {i+1}/{len(image_paths)}: {img_path}")

        # 尝试从多个 OCR 引擎结果中提取页码
        page_number = 0
        ocr_engines_for_page = ["baidu", "paddleocr", "rapid"]  # 按优先级排序

        for ocr_engine in ocr_engines_for_page:
            if page_number > 0:
                break
            try:
                # 临时切换引擎获取 OCR 结果
                if ocr_engine == "baidu" and BAIDU_OCR_API_KEY:
                    ocr_result = run_baidu_ocr(img_path)
                elif ocr_engine == "paddleocr":
                    ocr_result = run_paddleocr_docker(img_path)
                elif ocr_engine == "rapid":
                    ocr_result = run_ocr(img_path)  # 默认引擎
                else:
                    continue

                if ocr_result:
                    page_number = extract_page_number(ocr_result)
                    if page_number > 0:
                        logger.info(f"  图片 {i+1} 页码: {page_number} (来自 {ocr_engine})")
            except Exception as e:
                logger.debug(f"  {ocr_engine} 提取页码失败: {e}")

        if page_number == 0:
            logger.warning(f"  图片 {i+1} 未找到页码")
        image_page_numbers.append(page_number)

        engines = validator.get_enabled_engines()

        # 记录当前图片每个引擎识别的结果，用于更新上下文
        current_image_results: Dict[str, List[Dict]] = {}

        for engine in engines:
            try:
                result = await validator.run_single_engine(
                    engine, img_path, req.data_type, context
                )

                if result.success:
                    engines_success.add(engine)
                    if engine not in all_engine_results:
                        all_engine_results[engine] = []
                    # 为每条数据添加来源 URL 和页码
                    for row in result.data:
                        row["source_url"] = req.source_url
                        row["page_number"] = page_number
                    all_engine_results[engine].extend(result.data)
                    current_image_results[engine] = result.data  # 保存当前图片的结果
                    logger.info(f"  {engine}: 识别 {len(result.data)} 条")
                else:
                    if engine not in engines_failed:
                        engines_failed[engine] = result.error
                    logger.warning(f"  {engine}: 失败 - {result.error}")

            except Exception as e:
                logger.error(f"  {engine}: 异常 - {e}")
                if engine not in engines_failed:
                    engines_failed[engine] = str(e)

        # 更新上下文（使用当前图片第一个成功引擎的最后一条结果）
        for engine in engines_success:
            if engine in current_image_results and current_image_results[engine]:
                last_row = current_image_results[engine][-1]
                context = {
                    "exam_type": last_row.get("exam_type", ""),
                    "enrollment_type": last_row.get("enrollment_type", ""),
                    "university": {
                        "code": last_row.get("university_code", ""),
                        "name": last_row.get("university_name", ""),
                        "location": last_row.get("university_location", ""),
                        "note": last_row.get("university_note", ""),
                    },
                    "major_group": {
                        "code": last_row.get("major_group_code", ""),
                        "subject": last_row.get("major_group_subject", ""),
                        "plan": last_row.get("major_group_plan", 0),
                    }
                }
                break

    # 构建引擎结果摘要
    engine_results = []
    for engine in validator.get_enabled_engines():
        if engine in engines_success:
            engine_results.append(EngineResultSummary(
                engine=engine,
                success=True,
                record_count=len(all_engine_results.get(engine, []))
            ))
        else:
            engine_results.append(EngineResultSummary(
                engine=engine,
                success=False,
                record_count=0,
                error=engines_failed.get(engine, "未知错误")
            ))

    if not engines_success:
        raise HTTPException(status_code=500, detail="所有 OCR 引擎都失败了")

    # 去重各引擎结果
    for engine in all_engine_results:
        all_engine_results[engine] = merge_supplementary_rows(all_engine_results[engine])

    # 按记录 key 分组比对
    from multi_engine_validator import make_record_key, validate_record

    all_records: Dict[str, Dict[str, Dict]] = {}  # key -> {engine -> row}

    for engine, rows in all_engine_results.items():
        for row in rows:
            key = make_record_key(row)
            if key not in all_records:
                all_records[key] = {}
            all_records[key][engine] = row

    # 校验每条记录
    approved_data = []
    pending_review_data = []

    stats = {
        "high": 0,
        "medium": 0,
        "low": 0,
        "conflict": 0,
        "auto_approved": 0,
        "pending_review": 0
    }

    for record_key, engine_data in all_records.items():
        validation = validate_record(record_key, engine_data)

        # 统计
        if validation.confidence == VerifyConfidence.HIGH:
            stats["high"] += 1
        elif validation.confidence == VerifyConfidence.MEDIUM:
            stats["medium"] += 1
        elif validation.confidence == VerifyConfidence.LOW:
            stats["low"] += 1
        elif validation.confidence == VerifyConfidence.CONFLICT:
            stats["conflict"] += 1

        if validation.review_status == ReviewStatus.AUTO_APPROVED:
            stats["auto_approved"] += 1
            # 转换为 SupplementaryRow
            approved_data.append(SupplementaryRow(**{
                "exam_type": validation.merged_data.get("exam_type", ""),
                "enrollment_type": validation.merged_data.get("enrollment_type", ""),
                "university_code": validation.merged_data.get("university_code", ""),
                "university_name": validation.merged_data.get("university_name", ""),
                "university_location": validation.merged_data.get("university_location", ""),
                "university_note": validation.merged_data.get("university_note", ""),
                "major_group_code": validation.merged_data.get("major_group_code", ""),
                "major_group_subject": validation.merged_data.get("major_group_subject", ""),
                "major_group_plan": validation.merged_data.get("major_group_plan", 0),
                "major_code": validation.merged_data.get("major_code", ""),
                "major_name": validation.merged_data.get("major_name", ""),
                "major_note": validation.merged_data.get("major_note", ""),
                "plan_count": validation.merged_data.get("plan_count", 0),
                "tuition": validation.merged_data.get("tuition", ""),
                "source_url": validation.merged_data.get("source_url", ""),
                "page_number": validation.merged_data.get("page_number", 0),
            }))
        else:
            stats["pending_review"] += 1
            # 构建字段差异
            field_diffs = []
            for field_name, comparison in validation.field_comparisons.items():
                if not comparison.is_consistent:
                    field_diffs.append(FieldDiff(
                        field_name=field_name,
                        values={k: str(v) for k, v in comparison.values.items()},
                        is_consistent=False,
                        majority_value=str(comparison.majority_value) if comparison.majority_value else ""
                    ))

            pending_review_data.append(RecordValidationResult(
                record_key=record_key,
                confidence=validation.confidence.value,
                review_status=validation.review_status.value,
                merged_data=validation.merged_data,
                engine_sources=list(engine_data.keys()),
                conflict_fields=validation.conflict_fields,
                field_diffs=field_diffs,
                review_note=validation.review_note
            ))

    # 校验
    all_data = [r.model_dump() for r in approved_data]
    is_valid, errors = validate_supplementary_data(all_data) if all_data else (True, [])

    logger.info(
        f"多引擎校验完成: 总计 {len(all_records)} 条, "
        f"高置信 {stats['high']}, 中置信 {stats['medium']}, "
        f"冲突 {stats['conflict']}, 待审核 {stats['pending_review']}"
    )

    return MultiEngineValidationResponse(
        engines_used=validator.get_enabled_engines(),
        engines_success=list(engines_success),
        engines_failed=engines_failed,
        engine_results=engine_results,
        total_records=len(all_records),
        high_confidence=stats["high"],
        medium_confidence=stats["medium"],
        low_confidence=stats["low"],
        conflicts=stats["conflict"],
        auto_approved_count=stats["auto_approved"],
        pending_review_count=stats["pending_review"],
        approved_data=approved_data,
        pending_review_data=pending_review_data,
        is_valid=is_valid,
        errors=errors
    )


class EngineInfo(BaseModel):
    """引擎信息"""
    engine: str
    priority: int
    weight: float
    enabled: bool
    available: bool
    reason: str = ""


class EngineListResponse(BaseModel):
    """引擎列表响应"""
    engines: List[EngineInfo]
    best_engine: Optional[str]
    available_count: int


@app.get("/ocr-engines", response_model=EngineListResponse)
async def get_available_engines(
    data_type: str = "supplementary",
    enable_baidu: bool = True,
    enable_paddleocr_vl: bool = False,
    enable_aistudio: bool = False,
    enable_paddleocr: bool = True,
    enable_rapid: bool = True,
    enable_ai: bool = True,
    ai_api_key: str = ""
):
    """
    获取可用的 OCR 引擎列表

    返回所有引擎的状态信息，包括：
    - 是否启用
    - 是否可用（API Key 是否配置）
    - 优先级排序
    - 推荐的最佳单引擎
    """
    from multi_engine_validator import MultiEngineValidator

    ai_config = {"api_key": ai_api_key} if ai_api_key else None

    validator = MultiEngineValidator(
        enable_baidu=enable_baidu,
        enable_paddleocr_vl=enable_paddleocr_vl,
        enable_aistudio=enable_aistudio,
        enable_paddleocr=enable_paddleocr,
        enable_rapid=enable_rapid,
        enable_ai=enable_ai and bool(ai_api_key),
        ai_config=ai_config
    )

    engines_info = validator.get_available_engines(data_type)
    best_engine = validator.get_best_single_engine(data_type)

    available_count = sum(1 for e in engines_info if e["enabled"] and e["available"])

    return EngineListResponse(
        engines=[EngineInfo(**e) for e in engines_info],
        best_engine=best_engine,
        available_count=available_count
    )


@app.post("/validate-single-image")
async def validate_single_image(
    image_url: str,
    data_type: str = "supplementary",
    enable_baidu: bool = True,
    enable_paddleocr_vl: bool = False,
    enable_paddleocr: bool = True,
    enable_rapid: bool = True,
    enable_ai: bool = False,
    ai_api_key: str = "",
    ai_base_url: str = "",
    ai_model: str = ""
):
    """
    单张图片多引擎校验（用于调试和测试）
    """
    from multi_engine_validator import (
        MultiEngineValidator,
        VerifyConfidence,
        ReviewStatus
    )

    # 下载图片
    img_path = download_image(image_url)

    # 创建校验器
    ai_config = {
        "api_key": ai_api_key,
        "base_url": ai_base_url,
        "model": ai_model
    } if ai_api_key else None

    validator = MultiEngineValidator(
        enable_baidu=enable_baidu,
        enable_paddleocr_vl=enable_paddleocr_vl,
        enable_paddleocr=enable_paddleocr,
        enable_rapid=enable_rapid,
        enable_ai=enable_ai and bool(ai_api_key),
        ai_config=ai_config
    )

    # 运行校验
    report = await validator.validate_image(img_path, data_type)

    return {
        "image_url": image_url,
        "engines_used": report.engines_used,
        "engines_success": report.engines_success,
        "engines_failed": report.engines_failed,
        "total_records": report.total_records,
        "high_confidence": report.high_confidence,
        "medium_confidence": report.medium_confidence,
        "conflicts": report.conflicts,
        "auto_approved": report.auto_approved_count,
        "pending_review": report.pending_review_count,
        "records": [
            {
                "key": r.record_key,
                "confidence": r.confidence.value,
                "status": r.review_status.value,
                "data": r.merged_data,
                "engines": list(r.engine_data.keys()),
                "conflicts": r.conflict_fields
            }
            for r in report.records
        ]
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("OCR_SERVICE_PORT", 8100))
    uvicorn.run(app, host="0.0.0.0", port=port)
