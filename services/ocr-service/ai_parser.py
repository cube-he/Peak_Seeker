"""
AI 解析模块 - 使用视觉大模型解析征集志愿图片

用于与 OCR 结果互相校验，提高数据准确性。
"""

import os
import re
import json
import base64
import logging
from typing import List, Dict, Optional, Tuple
import httpx

logger = logging.getLogger(__name__)

# AI 配置（从环境变量读取）
AI_API_KEY = os.environ.get("AI_API_KEY", "")
AI_BASE_URL = os.environ.get("AI_BASE_URL", "https://api.deepseek.com/v1")
AI_MODEL = os.environ.get("AI_MODEL", "deepseek-chat")

# 征集志愿解析的系统提示词
SUPPLEMENTARY_SYSTEM_PROMPT = """你是一个专业的高考志愿数据解析助手。你的任务是从四川省教育考试院发布的征集志愿图片中提取结构化数据。

## 数据层级结构

征集志愿数据有以下层级：
1. 考试类型：历史类 / 物理类
2. 招生类型：国家公费师范生、省级公费师范生、地方优师专项、农村订单定向医学生、其他等
3. 院校：包含院校代码（4位数字）、院校名称、所在地
4. 专业组：包含专业组代码（3位数字）、再选科目要求、专业组计划数
5. 专业：包含专业代码（1-2位数字或字母数字组合）、专业名称、计划数、学费

## 数据格式示例

```
一、历史类
  (1)国家公费师范生
    院校代号、名称及专业代号、名称    计划收费
    0048华中师范大学（湖北省武汉市）
    专业组101（再选科目：不限）        7
      18特殊教育（国家公费师范生）     1  免费
      19学前教育（国家公费师范生）     2  免费
    院校备注：执行部委属...
```

## 关键解析规则

1. **学费格式**：
   - "免费" 表示免学费
   - 数字如 "6000"、"5400" 表示学费金额（元）
   - "2免费" 表示计划数2，学费免费（连写情况）

2. **计划数和学费的位置**：
   - 专业行右侧有两列数字：左边是计划数，右边是学费
   - 如果只有一个数字且>100，通常是学费
   - 如果只有一个数字且<=100，通常是计划数

3. **跨行专业名称**：
   - 当专业名称很长时会跨多行
   - 计划数和学费在最后一行

## 输出格式

请以 JSON 数组格式输出，每个专业一条记录：
```json
[
  {
    "exam_type": "历史类",
    "enrollment_type": "国家公费师范生",
    "university_code": "0048",
    "university_name": "华中师范大学",
    "university_location": "湖北省武汉市",
    "major_group_code": "101",
    "major_group_subject": "不限",
    "major_code": "18",
    "major_name": "特殊教育",
    "major_note": "国家公费师范生",
    "plan_count": 1,
    "tuition": "免费"
  }
]
```

注意：
- plan_count 必须是整数
- tuition 是字符串，如 "免费" 或 "6000元"
- 如果无法确定某个字段，使用空字符串或0
- 只输出 JSON 数组，不要有其他文字"""


def encode_image_to_base64(image_path: str) -> str:
    """将图片编码为 base64"""
    with open(image_path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")


def get_image_media_type(image_path: str) -> str:
    """获取图片的 MIME 类型"""
    ext = os.path.splitext(image_path)[1].lower()
    media_types = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
    }
    return media_types.get(ext, "image/jpeg")


async def parse_image_with_ai(
    image_path: str,
    api_key: str = None,
    base_url: str = None,
    model: str = None,
    context: Dict = None,
    max_retries: int = 2
) -> List[Dict]:
    """
    使用 AI 视觉模型解析征集志愿图片

    Args:
        image_path: 图片本地路径
        api_key: AI API 密钥
        base_url: AI API 基础 URL
        model: AI 模型名称
        context: 上下文信息（上一张图片的状态）
        max_retries: 最大重试次数

    Returns:
        解析出的专业数据列表
    """
    api_key = api_key or AI_API_KEY
    base_url = base_url or AI_BASE_URL
    model = model or AI_MODEL

    if not api_key:
        logger.warning("AI API 密钥未配置，跳过 AI 解析")
        return []

    # 编码图片
    image_base64 = encode_image_to_base64(image_path)
    media_type = get_image_media_type(image_path)

    # 构建用户提示词
    user_prompt = "请解析这张征集志愿图片中的所有专业数据。"
    if context:
        if context.get("exam_type"):
            user_prompt += f"\n当前考试类型：{context['exam_type']}"
        if context.get("enrollment_type"):
            user_prompt += f"\n当前招生类型：{context['enrollment_type']}"
        if context.get("university"):
            uni = context["university"]
            user_prompt += f"\n当前院校：{uni.get('code', '')} {uni.get('name', '')}"

    # 构建请求
    messages = [
        {"role": "system", "content": SUPPLEMENTARY_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": user_prompt},
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{media_type};base64,{image_base64}"
                    }
                }
            ]
        }
    ]

    last_error = None
    for attempt in range(max_retries + 1):
        try:
            # 设置更长的超时时间：连接 30 秒，读取 180 秒
            timeout = httpx.Timeout(connect=30.0, read=180.0, write=30.0, pool=30.0)
            async with httpx.AsyncClient(timeout=timeout) as client:
                logger.info(f"调用 AI API (尝试 {attempt + 1}/{max_retries + 1}): {base_url}/chat/completions, model={model}")
                response = await client.post(
                    f"{base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": model,
                        "messages": messages,
                        "max_tokens": 8192,
                        "temperature": 0.1  # 低温度以获得更稳定的输出
                    }
                )

                logger.info(f"AI API 响应状态: {response.status_code}")
                if response.status_code != 200:
                    logger.error(f"AI API 请求失败: {response.status_code} {response.text[:500]}")
                    last_error = f"HTTP {response.status_code}"
                    if attempt < max_retries:
                        import asyncio
                        await asyncio.sleep(2 ** attempt)  # 指数退避
                        continue
                    return []

                result = response.json()
                content = result.get("choices", [{}])[0].get("message", {}).get("content", "")

                # 如果 content 为空，记录完整响应以便调试
                if not content:
                    logger.warning(f"AI 返回空内容，完整响应: {json.dumps(result, ensure_ascii=False)[:1000]}")
                    last_error = "Empty response"
                    if attempt < max_retries:
                        import asyncio
                        await asyncio.sleep(2 ** attempt)
                        continue
                    return []

                logger.info(f"AI 返回内容长度: {len(content)}, 前200字符: {content[:200]}")

                # 解析 JSON 输出
                parsed = parse_ai_response(content)
                if not parsed and attempt < max_retries:
                    logger.warning(f"AI 返回内容无法解析，重试...")
                    last_error = "Parse failed"
                    import asyncio
                    await asyncio.sleep(2 ** attempt)
                    continue

                return parsed

        except httpx.TimeoutException as e:
            logger.warning(f"AI API 超时 (尝试 {attempt + 1}): {e}")
            last_error = f"Timeout: {e}"
            if attempt < max_retries:
                import asyncio
                await asyncio.sleep(2 ** attempt)
                continue
        except Exception as e:
            logger.error(f"AI 解析失败 (尝试 {attempt + 1}): {type(e).__name__}: {e}")
            last_error = str(e)
            if attempt < max_retries:
                import asyncio
                await asyncio.sleep(2 ** attempt)
                continue

    logger.error(f"AI 解析最终失败，最后错误: {last_error}")
    return []


def parse_ai_response(content: str) -> List[Dict]:
    """解析 AI 返回的 JSON 内容"""
    try:
        # 尝试直接解析
        data = json.loads(content)
        if isinstance(data, list):
            return data
        return []
    except json.JSONDecodeError:
        # 尝试提取 JSON 数组
        match = re.search(r'\[[\s\S]*\]', content)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass

        logger.warning(f"无法解析 AI 响应: {content[:200]}...")
        return []


def compare_results(
    ocr_results: List[Dict],
    ai_results: List[Dict]
) -> Dict:
    """
    比较 OCR 和 AI 的解析结果

    Returns:
        {
            "matched": [...],      # 两者一致的记录
            "ocr_only": [...],     # 仅 OCR 有的记录
            "ai_only": [...],      # 仅 AI 有的记录
            "conflicts": [...]     # 两者冲突的记录（需人工审核）
        }
    """
    matched = []
    ocr_only = []
    ai_only = []
    conflicts = []

    # 创建索引：院校代码 + 专业代码 + 专业名称
    def make_key(row: Dict) -> str:
        return f"{row.get('university_code', '')}_{row.get('major_code', '')}_{row.get('major_name', '')[:10]}"

    ocr_map = {make_key(r): r for r in ocr_results}
    ai_map = {make_key(r): r for r in ai_results}

    all_keys = set(ocr_map.keys()) | set(ai_map.keys())

    for key in all_keys:
        ocr_row = ocr_map.get(key)
        ai_row = ai_map.get(key)

        if ocr_row and ai_row:
            # 两者都有，检查关键字段是否一致
            plan_match = ocr_row.get("plan_count") == ai_row.get("plan_count")
            tuition_match = normalize_tuition(ocr_row.get("tuition", "")) == normalize_tuition(ai_row.get("tuition", ""))

            if plan_match and tuition_match:
                matched.append({
                    "data": ocr_row,
                    "source": "both"
                })
            else:
                conflicts.append({
                    "ocr": ocr_row,
                    "ai": ai_row,
                    "diff": {
                        "plan_count": not plan_match,
                        "tuition": not tuition_match
                    }
                })
        elif ocr_row:
            ocr_only.append(ocr_row)
        else:
            ai_only.append(ai_row)

    return {
        "matched": matched,
        "ocr_only": ocr_only,
        "ai_only": ai_only,
        "conflicts": conflicts,
        "summary": {
            "total_ocr": len(ocr_results),
            "total_ai": len(ai_results),
            "matched_count": len(matched),
            "conflict_count": len(conflicts),
            "ocr_only_count": len(ocr_only),
            "ai_only_count": len(ai_only)
        }
    }


def normalize_tuition(tuition: str) -> str:
    """
    标准化学费字符串以便比较

    处理各种 OCR/AI 识别变体：
    - "免费" / "0" / "0元" -> "免费"
    - "6875元" / "6875" -> "6875元"
    - "16875元" -> 可能是 OCR 错误（计划数1+学费6875），需要特殊处理
    """
    if not tuition:
        return ""
    tuition = str(tuition).strip()
    if tuition == "免费" or tuition == "0" or tuition == "0元":
        return "免费"

    # 提取数字
    match = re.search(r'(\d+)', tuition)
    if match:
        num = int(match.group(1))
        # 常见学费范围：3000-15000
        # 如果数字超过 15000 且以常见学费结尾，可能是 OCR 错误
        if num > 15000:
            num_str = str(num)
            # 检查是否是 "计划数+学费" 的错误合并
            for tuition_len in [4, 5]:  # 学费通常是 4-5 位数
                if len(num_str) > tuition_len:
                    potential_tuition = int(num_str[-tuition_len:])
                    if 3000 <= potential_tuition <= 15000:
                        return f"{potential_tuition}元"
        return f"{num}元"
    return tuition


def merge_results(
    ocr_results: List[Dict],
    ai_results: List[Dict],
    prefer: str = "ocr"
) -> Tuple[List[Dict], List[Dict]]:
    """
    合并 OCR 和 AI 结果

    Args:
        ocr_results: OCR 解析结果
        ai_results: AI 解析结果
        prefer: 冲突时优先使用哪个来源 ("ocr" 或 "ai")

    Returns:
        (merged_results, conflicts_for_review)
    """
    comparison = compare_results(ocr_results, ai_results)

    merged = []
    conflicts_for_review = []

    # 添加匹配的记录
    for item in comparison["matched"]:
        merged.append(item["data"])

    # 处理冲突
    for conflict in comparison["conflicts"]:
        if prefer == "ocr":
            merged.append(conflict["ocr"])
        else:
            merged.append(conflict["ai"])
        # 标记需要人工审核
        conflicts_for_review.append(conflict)

    # 添加仅一方有的记录（可能是漏识别）
    for row in comparison["ocr_only"]:
        merged.append(row)
    for row in comparison["ai_only"]:
        merged.append(row)

    return merged, conflicts_for_review
