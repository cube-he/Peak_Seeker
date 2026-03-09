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

class ScoreRow(BaseModel):
    score: int
    count: int
    cumulative_count: int


class SupplementaryRow(BaseModel):
    """征集志愿数据行"""
    university_code: str
    university_name: str
    major_code: str
    major_name: str
    plan_count: int


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
    is_valid: bool
    errors: List[str]
    data: List[SupplementaryRow]

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
    格式特点（每行一个信息，不是传统表格）：
    - 院校行: "0048华中师范大学（湖北省武汉市）"
    - 专业组行: "专业组101（再选科目：不限）" + 右侧计划数
    - 专业行: "18特殊教育（国家公费师范生）" + 右侧计划数 + 收费
    """
    ocr = get_ocr()
    result, _ = ocr(img_path)

    logger.info(f"OCR 原始结果数量: {len(result) if result else 0}")

    if not result:
        return []

    # 收集识别结果并按 y 坐标排序
    items = []
    for box, text, confidence in result:
        y_center = (box[0][1] + box[2][1]) / 2
        items.append({"y": y_center, "text": text.strip()})

    items.sort(key=lambda x: x["y"])

    rows = []
    current_university_code = ""
    current_university_name = ""

    # 跳过的关键词
    skip_keywords = [
        "附件", "普通高校", "征集志愿", "请考生", "填报志愿", "相关内容",
        "院校代号、名称", "计划收费", "特别提醒", "院校备注", "历史类",
        "物理类", "地方优师", "定向医学", "再选科目",
        "专业组", "切忌盲目", "后果自负", "服务县", "招考机构",
        "教育部", "有关规", "通知如", "填报时间", "填报对象",
        "考试院", "录取照顾", "控制分数", "自由可投", "合格考生",
        "资格审核", "招生类别", "特殊类型"
    ]

    for item in items:
        text = item["text"]

        # 跳过纯数字（计划数）、"免费"、短文本
        if re.match(r'^[\d免费]+$', text) or len(text) < 4:
            continue

        # 先尝试匹配专业行（优先级最高）
        major_match = re.match(r'^(\d{1,2}[A-Z]?)([一-鿿].+)$', text)
        if major_match and current_university_code:
            major_code = major_match.group(1)
            major_name_raw = major_match.group(2)
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
            continue

        # 跳过标题、说明等
        if any(kw in text for kw in skip_keywords):
            continue

        # 匹配院校行: "0048华中师范大学（湖北省武汉市）" 或 "0056西南大学（重庆市）"
        uni_match = re.match(r'^(\d{4})([一-鿿]+[大学院]+)[（(]', text)
        if uni_match:
            current_university_code = uni_match.group(1)
            current_university_name = uni_match.group(2)
            logger.info(f"  发现院校: {current_university_code} {current_university_name}")
            continue


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
    """
    # 按院校代码+专业代码去重
    seen = set()
    unique_rows = []

    for row in rows:
        key = f"{row['university_code']}_{row['major_code']}_{row['major_name']}"
        if key not in seen:
            seen.add(key)
            unique_rows.append(row)

    # 按院校代码排序
    unique_rows.sort(key=lambda x: x["university_code"])
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
    """征集志愿 OCR"""
    all_rows = []
    for i, url in enumerate(req.image_urls):
        logger.info(f"征集志愿 OCR {i+1}/{len(req.image_urls)}: {url}")
        img_path = download_image(url)
        rows = extract_supplementary_rows(img_path)
        logger.info(f"  识别 {len(rows)} 行")
        all_rows.extend(rows)

    # 合并去重
    rows = merge_supplementary_rows(all_rows)
    logger.info(f"合并后: {len(rows)} 行")

    # 统计院校数
    university_codes = set(r["university_code"] for r in rows)

    # 校验
    is_valid, errors = validate_supplementary_data(rows)

    return SupplementaryOcrResponse(
        total_rows=len(rows),
        university_count=len(university_codes),
        is_valid=is_valid,
        errors=errors,
        data=[SupplementaryRow(**r) for r in rows],
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
