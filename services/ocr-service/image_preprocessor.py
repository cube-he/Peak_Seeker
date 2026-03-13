"""
图像预处理增强模块

通过对同一张图片进行不同的预处理，生成多个变体，
然后分别进行 OCR 识别，最后通过投票机制合并结果以提高准确率。

原理：
- 单次 OCR 对同一图片结果是确定的（重复调用无意义）
- 但不同的预处理可能让 OCR 更好地识别某些区域
- 通过多种预处理 + 投票机制，可以提高整体准确率

预处理策略：
1. 原图（baseline）
2. 对比度增强（CLAHE）
3. 锐化
4. 二值化（Otsu 自适应阈值）
"""

import os
import cv2
import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from enum import Enum
from collections import Counter
import logging

logger = logging.getLogger(__name__)


class PreprocessType(str, Enum):
    """预处理类型"""
    ORIGINAL = "original"           # 原图
    CONTRAST = "contrast"           # 对比度增强
    SHARPEN = "sharpen"             # 锐化
    BINARIZE = "binarize"           # 二值化


@dataclass
class PreprocessedImage:
    """预处理后的图像"""
    preprocess_type: PreprocessType
    image_path: str
    description: str


class ImagePreprocessor:
    """图像预处理器"""

    def __init__(self, cache_dir: str = None):
        self.cache_dir = cache_dir or os.path.join(os.path.dirname(__file__), "cache", "preprocessed")
        os.makedirs(self.cache_dir, exist_ok=True)

    def preprocess_image(
        self,
        img_path: str,
        preprocess_types: List[PreprocessType] = None
    ) -> List[PreprocessedImage]:
        """
        对图像进行多种预处理

        Args:
            img_path: 原始图片路径
            preprocess_types: 要应用的预处理类型列表

        Returns:
            预处理后的图像列表
        """
        if preprocess_types is None:
            preprocess_types = [
                PreprocessType.ORIGINAL,
                PreprocessType.CONTRAST,
                PreprocessType.SHARPEN,
            ]

        # 读取原图
        img = cv2.imread(img_path)
        if img is None:
            logger.error(f"无法读取图片: {img_path}")
            return []

        results = []
        base_name = os.path.splitext(os.path.basename(img_path))[0]

        for ptype in preprocess_types:
            try:
                if ptype == PreprocessType.ORIGINAL:
                    results.append(PreprocessedImage(
                        preprocess_type=ptype,
                        image_path=img_path,
                        description="原图"
                    ))
                else:
                    processed = self._apply_preprocess(img, ptype)
                    if processed is not None:
                        output_path = os.path.join(
                            self.cache_dir,
                            f"{base_name}_{ptype.value}.jpg"
                        )
                        cv2.imwrite(output_path, processed)
                        results.append(PreprocessedImage(
                            preprocess_type=ptype,
                            image_path=output_path,
                            description=self._get_description(ptype)
                        ))
            except Exception as e:
                logger.warning(f"预处理 {ptype.value} 失败: {e}")

        return results

    def _apply_preprocess(self, img: np.ndarray, ptype: PreprocessType) -> Optional[np.ndarray]:
        """应用单个预处理"""

        if ptype == PreprocessType.BINARIZE:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

        elif ptype == PreprocessType.CONTRAST:
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

        elif ptype == PreprocessType.SHARPEN:
            kernel = np.array([
                [-1, -1, -1],
                [-1,  9, -1],
                [-1, -1, -1]
            ])
            return cv2.filter2D(img, -1, kernel)

        return None

    def _get_description(self, ptype: PreprocessType) -> str:
        """获取预处理类型的描述"""
        descriptions = {
            PreprocessType.ORIGINAL: "原图",
            PreprocessType.BINARIZE: "二值化",
            PreprocessType.CONTRAST: "对比度增强",
            PreprocessType.SHARPEN: "锐化",
        }
        return descriptions.get(ptype, ptype.value)


def merge_ocr_results_by_voting(
    results: List[Tuple[str, List[Dict]]],
    key_fields: List[str] = None
) -> List[Dict]:
    """
    通过投票机制合并多个 OCR 结果

    策略：
    1. 按 key 匹配记录
    2. 对每个字段进行投票，选择出现次数最多的值
    3. 平票时优先选择原图的结果

    Args:
        results: [(source_name, rows), ...] 各来源的识别结果
        key_fields: 用于匹配记录的字段

    Returns:
        合并后的结果
    """
    if not results:
        return []

    if key_fields is None:
        key_fields = ["university_code", "major_code", "exam_type", "major_group_code"]

    # 优先级：原图 > 对比度 > 锐化 > 二值化
    priority_order = ["original", "contrast", "sharpen", "binarize"]

    # 按记录 key 分组
    all_records: Dict[str, Dict[str, Dict]] = {}

    for source, rows in results:
        for row in rows:
            key = "_".join(str(row.get(f, "")) for f in key_fields)
            if key not in all_records:
                all_records[key] = {}
            all_records[key][source] = row

    merged = []

    for record_key, source_data in all_records.items():
        if not source_data:
            continue

        # 选择优先级最高的来源作为基础
        base_source = None
        for src in priority_order:
            if src in source_data:
                base_source = src
                break
        if base_source is None:
            base_source = list(source_data.keys())[0]

        base_row = source_data[base_source].copy()

        # 对关键数值字段进行投票
        vote_fields = ["plan_count", "tuition", "major_group_plan"]

        for field in vote_fields:
            values_with_source = []
            for src, row in source_data.items():
                val = row.get(field)
                if val is not None and val != "" and val != 0:
                    priority = priority_order.index(src) if src in priority_order else 999
                    values_with_source.append((str(val), priority, src))

            if values_with_source:
                # 统计每个值的票数
                value_counts = Counter(v[0] for v in values_with_source)
                max_count = max(value_counts.values())

                # 找出票数最多的值
                top_values = [v for v, c in value_counts.items() if c == max_count]

                if len(top_values) == 1:
                    best_val = top_values[0]
                else:
                    # 平票时选择优先级最高的
                    best_val = None
                    best_priority = 999
                    for val, priority, src in values_with_source:
                        if val in top_values and priority < best_priority:
                            best_val = val
                            best_priority = priority

                # 转换回原始类型
                if best_val is not None:
                    original_val = base_row.get(field)
                    if isinstance(original_val, int):
                        try:
                            best_val = int(best_val)
                        except ValueError:
                            pass
                    base_row[field] = best_val

        # 记录来源信息
        base_row["_sources"] = list(source_data.keys())
        base_row["_source_count"] = len(source_data)

        merged.append(base_row)

    return merged


def run_ocr_with_preprocessing(
    img_path: str,
    ocr_func,
    parse_func,
    context: Dict = None,
    preprocess_types: List[PreprocessType] = None
) -> Tuple[List[Dict], Dict]:
    """
    使用多种预处理运行 OCR 并合并结果

    Args:
        img_path: 图片路径
        ocr_func: OCR 函数，接收图片路径，返回 OCR 结果
        parse_func: 解析函数，接收 (img_path, context, ocr_result)，返回解析后的数据
        context: 上下文信息
        preprocess_types: 预处理类型列表

    Returns:
        (合并后的数据, 统计信息)
    """
    preprocessor = ImagePreprocessor()

    if preprocess_types is None:
        preprocess_types = [
            PreprocessType.ORIGINAL,
            PreprocessType.CONTRAST,
            PreprocessType.SHARPEN,
        ]

    # 生成预处理变体
    variants = preprocessor.preprocess_image(img_path, preprocess_types)

    if not variants:
        logger.error(f"无法生成预处理变体: {img_path}")
        return [], {}

    # 对每个变体运行 OCR
    results = []
    stats = {
        "variants_count": len(variants),
        "variant_results": {}
    }

    for variant in variants:
        try:
            ocr_result = ocr_func(variant.image_path)
            rows = parse_func(variant.image_path, context, ocr_result)
            results.append((variant.preprocess_type.value, rows))
            stats["variant_results"][variant.preprocess_type.value] = len(rows)
            logger.info(f"  {variant.description}: {len(rows)} 条")
        except Exception as e:
            logger.warning(f"  {variant.description} 失败: {e}")
            stats["variant_results"][variant.preprocess_type.value] = f"error: {e}"

    # 投票合并
    merged = merge_ocr_results_by_voting(results)
    stats["merged_count"] = len(merged)

    return merged, stats
