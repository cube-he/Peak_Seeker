"""
图像预处理增强模块

通过对同一张图片进行不同的预处理，生成多个变体，
然后分别进行 OCR 识别，最后合并结果以提高准确率。

原理：
- 单次 OCR 对同一图片结果是确定的（重复调用无意义）
- 但不同的预处理可能让 OCR 更好地识别某些区域
- 通过多种预处理 + 投票机制，可以提高整体准确率

预处理策略：
1. 原图（baseline）
2. 二值化（Otsu 自适应阈值）
3. 对比度增强（CLAHE）
4. 锐化
5. 去噪（高斯模糊 + 锐化）
6. 灰度反转（针对深色背景）
"""

import os
import cv2
import numpy as np
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class PreprocessType(str, Enum):
    """预处理类型"""
    ORIGINAL = "original"           # 原图
    BINARIZE = "binarize"           # 二值化
    CONTRAST = "contrast"           # 对比度增强
    SHARPEN = "sharpen"             # 锐化
    DENOISE = "denoise"             # 去噪
    INVERT = "invert"               # 灰度反转
    BINARIZE_ADAPTIVE = "binarize_adaptive"  # 自适应二值化


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
            preprocess_types: 要应用的预处理类型列表，None 表示全部

        Returns:
            预处理后的图像列表
        """
        if preprocess_types is None:
            preprocess_types = [
                PreprocessType.ORIGINAL,
                PreprocessType.BINARIZE,
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
                    # 原图直接使用
                    results.append(PreprocessedImage(
                        preprocess_type=ptype,
                        image_path=img_path,
                        description="原图"
                    ))
                else:
                    # 应用预处理
                    processed = self._apply_preprocess(img, ptype)
                    if processed is not None:
                        # 保存预处理后的图片
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
            # Otsu 二值化
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

        elif ptype == PreprocessType.BINARIZE_ADAPTIVE:
            # 自适应二值化
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            binary = cv2.adaptiveThreshold(
                gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                cv2.THRESH_BINARY, 11, 2
            )
            return cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)

        elif ptype == PreprocessType.CONTRAST:
            # CLAHE 对比度增强
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            return cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

        elif ptype == PreprocessType.SHARPEN:
            # 锐化
            kernel = np.array([
                [-1, -1, -1],
                [-1,  9, -1],
                [-1, -1, -1]
            ])
            return cv2.filter2D(img, -1, kernel)

        elif ptype == PreprocessType.DENOISE:
            # 去噪（先模糊再锐化）
            blurred = cv2.GaussianBlur(img, (3, 3), 0)
            kernel = np.array([
                [0, -1, 0],
                [-1,  5, -1],
                [0, -1, 0]
            ])
            return cv2.filter2D(blurred, -1, kernel)

        elif ptype == PreprocessType.INVERT:
            # 灰度反转
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
            inverted = cv2.bitwise_not(gray)
            return cv2.cvtColor(inverted, cv2.COLOR_GRAY2BGR)

        return None

    def _get_description(self, ptype: PreprocessType) -> str:
        """获取预处理类型的描述"""
        descriptions = {
            PreprocessType.ORIGINAL: "原图",
            PreprocessType.BINARIZE: "Otsu 二值化",
            PreprocessType.BINARIZE_ADAPTIVE: "自���应二值化",
            PreprocessType.CONTRAST: "CLAHE 对比度增强",
            PreprocessType.SHARPEN: "锐化",
            PreprocessType.DENOISE: "去噪",
            PreprocessType.INVERT: "灰度反转",
        }
        return descriptions.get(ptype, ptype.value)


def merge_ocr_results_by_voting(
    results: List[Tuple[str, List[Dict]]],
    key_fields: List[str] = None,
    priority_sources: List[str] = None
) -> List[Dict]:
    """
    通过投票机制合并多个 OCR 结果

    Args:
        results: [(preprocess_type, rows), ...] 各预处理的识别结果
        key_fields: 用于匹配记录的字段
        priority_sources: 优先级高的来源列表（平票时优先选择）

    Returns:
        合并后的结果
    """
    if not results:
        return []

    if key_fields is None:
        key_fields = ["university_code", "major_code", "exam_type"]

    if priority_sources is None:
        # 默认优先级：原图 > 对比度增强 > 锐化 > 其他
        priority_sources = ["original", "contrast", "sharpen", "binarize", "denoise"]

    # 按记录 key 分组
    all_records: Dict[str, Dict[str, Dict]] = {}  # key -> {preprocess_type -> row}

    for preprocess_type, rows in results:
        for row in rows:
            key = "_".join(str(row.get(f, "")) for f in key_fields)
            if key not in all_records:
                all_records[key] = {}
            all_records[key][preprocess_type] = row

    # 对每条记录进行投票合并
    merged = []

    for record_key, preprocess_data in all_records.items():
        if not preprocess_data:
            continue

        # 使用优先级最高的来源作为基础
        base_source = None
        for src in priority_sources:
            if src in preprocess_data:
                base_source = src
                break
        if base_source is None:
            base_source = list(preprocess_data.keys())[0]

        base_row = preprocess_data[base_source].copy()

        # 对关键字段进行投票
        vote_fields = [
            "major_group_code", "major_group_subject", "major_group_plan",
            "plan_count", "tuition", "major_name", "major_note"
        ]

        for field in vote_fields:
            values = {}  # value -> [(source, priority)]
            for ptype, row in preprocess_data.items():
                val = row.get(field)
                if val is not None and val != "" and val != 0:
                    val_str = str(val)
                    if val_str not in values:
                        values[val_str] = []
                    # 记录来源和优先级
                    priority = priority_sources.index(ptype) if ptype in priority_sources else 999
                    values[val_str].append((ptype, priority))

            if values:
                # 选择出现次数最多的值，平票时选择优先级最高的
                def score(val_str):
                    sources = values[val_str]
                    count = len(sources)
                    best_priority = min(p for _, p in sources)
                    # 票数优先，然后是优先级（越小越好）
                    return (count, -best_priority)

                best_val = max(values.keys(), key=score)

                # 尝试转换回原始类型
                original_val = base_row.get(field)
                if isinstance(original_val, int):
                    try:
                        best_val = int(best_val)
                    except ValueError:
                        pass
                base_row[field] = best_val

        merged.append(base_row)

    return merged


def merge_with_confidence(
    results: List[Tuple[str, List[Dict]]],
    key_fields: List[str] = None
) -> Tuple[List[Dict], Dict[str, float]]:
    """
    合并结果并计算每条记录的置信度

    Args:
        results: [(source, rows), ...] 各来源的识别结果
        key_fields: 用于匹配记录的字段

    Returns:
        (合并后的结果, {record_key: confidence})
    """
    if not results:
        return [], {}

    if key_fields is None:
        key_fields = ["university_code", "major_code", "exam_type"]

    # 按记录 key 分组
    all_records: Dict[str, Dict[str, Dict]] = {}

    for source, rows in results:
        for row in rows:
            key = "_".join(str(row.get(f, "")) for f in key_fields)
            if key not in all_records:
                all_records[key] = {}
            all_records[key][source] = row

    merged = []
    confidences = {}

    total_sources = len(results)

    for record_key, source_data in all_records.items():
        if not source_data:
            continue

        # 计算置信度：有多少来源识别到了这条记录
        source_count = len(source_data)
        base_confidence = source_count / total_sources

        # 检查关键字段的一致性
        vote_fields = ["plan_count", "tuition", "major_group_code"]
        consistency_score = 0

        for field in vote_fields:
            values = set()
            for row in source_data.values():
                val = row.get(field)
                if val is not None and val != "" and val != 0:
                    values.add(str(val))

            if len(values) <= 1:
                # 所有来源一致
                consistency_score += 1

        # 最终置信度 = 来源覆盖率 * 0.5 + 一致性 * 0.5
        field_consistency = consistency_score / len(vote_fields) if vote_fields else 1
        confidence = base_confidence * 0.5 + field_consistency * 0.5

        confidences[record_key] = confidence

        # 使用第一个来源作为基础
        base_row = list(source_data.values())[0].copy()
        base_row["_confidence"] = confidence
        base_row["_source_count"] = source_count
        merged.append(base_row)

    return merged, confidences


# ==================== 便捷函数 ====================

def preprocess_for_ocr(
    img_path: str,
    strategies: List[str] = None
) -> List[PreprocessedImage]:
    """
    便捷函数：为 OCR 准备多个预处理版本

    Args:
        img_path: 图片路径
        strategies: 预处理策略列表，可选值：
            - "fast": 只用原图和对比度增强（2个）
            - "standard": 原图 + 二值化 + 对比度 + 锐化（4个）
            - "full": 所有预处理（6个）
            - 或直接传入 PreprocessType 列表

    Returns:
        预处理后的图像列表
    """
    preprocessor = ImagePreprocessor()

    if strategies is None or strategies == ["standard"]:
        preprocess_types = [
            PreprocessType.ORIGINAL,
            PreprocessType.BINARIZE,
            PreprocessType.CONTRAST,
            PreprocessType.SHARPEN,
        ]
    elif strategies == ["fast"]:
        preprocess_types = [
            PreprocessType.ORIGINAL,
            PreprocessType.CONTRAST,
        ]
    elif strategies == ["full"]:
        preprocess_types = list(PreprocessType)
    else:
        # 假设传入的是 PreprocessType 列表
        preprocess_types = strategies

    return preprocessor.preprocess_image(img_path, preprocess_types)
