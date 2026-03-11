"""
多引擎交叉校验模块

对同一张图片使用多个 OCR 引擎识别，通过交叉比对确保数据准确性。
支持的引擎：
1. 百度云 OCR (baidu)
2. PaddleOCR Docker (paddleocr)
3. RapidOCR (rapid)
4. AI 视觉模型 (ai)

校验策略：
- 多数一致原则：3个及以上引擎结果一致则高置信度
- 差异标记：结果不一致时标记待人工审核
- 字段级校验：关键字段（专业代码、计划数、学费）逐一比对
"""

import os
import re
import json
import logging
import asyncio
from typing import List, Dict, Tuple, Optional, Set
from enum import Enum
from dataclasses import dataclass, field
from collections import Counter

logger = logging.getLogger(__name__)


class VerifyConfidence(str, Enum):
    """校验置信度"""
    HIGH = "high"           # 所有引擎一致
    MEDIUM = "medium"       # 多数引擎一致
    LOW = "low"             # 引擎结果分歧
    SINGLE = "single"       # 仅单引擎识别到
    CONFLICT = "conflict"   # 存在冲突，需人工审核


class ReviewStatus(str, Enum):
    """审核状态"""
    AUTO_APPROVED = "auto_approved"     # 自动通过（高置信度）
    PENDING_REVIEW = "pending_review"   # 待人工审核
    MANUAL_APPROVED = "manual_approved" # 人工已审核通过
    MANUAL_REJECTED = "manual_rejected" # 人工已审核拒绝


@dataclass
class EngineResult:
    """单引擎识别结果"""
    engine: str
    success: bool
    data: List[Dict] = field(default_factory=list)
    error: str = ""
    raw_text: str = ""  # 原始 OCR 文本（用于调试）


@dataclass
class FieldComparison:
    """字段比对结果"""
    field_name: str
    values: Dict[str, any]  # engine -> value
    is_consistent: bool
    majority_value: any = None
    confidence: float = 0.0


@dataclass
class RecordValidation:
    """单条记录的校验结果"""
    # 记录标识
    record_key: str  # university_code + major_code + major_name

    # 各引擎的数据
    engine_data: Dict[str, Dict] = field(default_factory=dict)

    # 字段级比对
    field_comparisons: Dict[str, FieldComparison] = field(default_factory=dict)

    # 最终数据（合并后）
    merged_data: Dict = field(default_factory=dict)

    # 校验结果
    confidence: VerifyConfidence = VerifyConfidence.SINGLE
    review_status: ReviewStatus = ReviewStatus.PENDING_REVIEW
    conflict_fields: List[str] = field(default_factory=list)

    # 审核信息
    review_note: str = ""


@dataclass
class ValidationReport:
    """校验报告"""
    # 引擎执行情况
    engines_used: List[str] = field(default_factory=list)
    engines_success: List[str] = field(default_factory=list)
    engines_failed: Dict[str, str] = field(default_factory=dict)

    # 记录统计
    total_records: int = 0
    high_confidence: int = 0
    medium_confidence: int = 0
    low_confidence: int = 0
    conflicts: int = 0

    # 详细结果
    records: List[RecordValidation] = field(default_factory=list)

    # 汇总
    auto_approved_count: int = 0
    pending_review_count: int = 0

    def to_dict(self) -> Dict:
        return {
            "engines_used": self.engines_used,
            "engines_success": self.engines_success,
            "engines_failed": self.engines_failed,
            "total_records": self.total_records,
            "high_confidence": self.high_confidence,
            "medium_confidence": self.medium_confidence,
            "low_confidence": self.low_confidence,
            "conflicts": self.conflicts,
            "auto_approved_count": self.auto_approved_count,
            "pending_review_count": self.pending_review_count,
        }


def make_record_key(row: Dict) -> str:
    """生成记录唯一标识"""
    uni_code = str(row.get("university_code", "")).strip()
    major_code = str(row.get("major_code", "")).strip()
    major_name = str(row.get("major_name", ""))[:15].strip()
    return f"{uni_code}_{major_code}_{major_name}"


def normalize_value(field_name: str, value: any) -> any:
    """标准化字段值以便比较"""
    if value is None:
        return None

    if field_name == "tuition":
        # 学费标准化
        val = str(value).strip()
        if val == "免费" or val == "0" or val == "0元":
            return "免费"
        match = re.search(r'(\d+)', val)
        if match:
            return f"{match.group(1)}元"
        return val

    if field_name == "plan_count":
        # 计划数标准化为整数
        try:
            return int(value)
        except (ValueError, TypeError):
            return 0

    if field_name in ("university_code", "major_code", "major_group_code"):
        # 代码标准化
        return str(value).strip().upper()

    if field_name in ("university_name", "major_name"):
        # 名称标准化：去除空格和标点
        val = str(value).strip()
        val = re.sub(r'\s+', '', val)
        return val

    return value


def compare_field(field_name: str, values: Dict[str, any]) -> FieldComparison:
    """比较单个字段在各引擎间的值"""
    # 标准化所有值
    normalized = {
        engine: normalize_value(field_name, val)
        for engine, val in values.items()
        if val is not None and val != ""
    }

    if not normalized:
        return FieldComparison(
            field_name=field_name,
            values=values,
            is_consistent=True,
            majority_value=None,
            confidence=0.0
        )

    # 统计各值出现次数
    value_counts = Counter(normalized.values())
    most_common = value_counts.most_common(1)[0]
    majority_value, majority_count = most_common

    total_engines = len(normalized)
    is_consistent = len(value_counts) == 1
    confidence = majority_count / total_engines if total_engines > 0 else 0.0

    return FieldComparison(
        field_name=field_name,
        values=values,
        is_consistent=is_consistent,
        majority_value=majority_value,
        confidence=confidence
    )


# 关键字段列表（必须校验的字段）
CRITICAL_FIELDS = [
    "university_code",
    "major_code",
    "major_name",
    "plan_count",
    "tuition"
]

# 次要字段列表（可选校验）
SECONDARY_FIELDS = [
    "university_name",
    "major_group_code",
    "major_note",
    "enrollment_type"
]


def validate_record(record_key: str, engine_data: Dict[str, Dict]) -> RecordValidation:
    """校验单条记录"""
    validation = RecordValidation(
        record_key=record_key,
        engine_data=engine_data
    )

    engines = list(engine_data.keys())
    num_engines = len(engines)

    if num_engines == 0:
        validation.confidence = VerifyConfidence.SINGLE
        validation.review_status = ReviewStatus.PENDING_REVIEW
        return validation

    # 比较关键字段
    all_consistent = True
    conflict_fields = []

    for field_name in CRITICAL_FIELDS:
        values = {
            engine: data.get(field_name)
            for engine, data in engine_data.items()
        }

        comparison = compare_field(field_name, values)
        validation.field_comparisons[field_name] = comparison

        if not comparison.is_consistent:
            all_consistent = False
            conflict_fields.append(field_name)

    validation.conflict_fields = conflict_fields

    # 确定置信度
    if num_engines == 1:
        validation.confidence = VerifyConfidence.SINGLE
        validation.review_status = ReviewStatus.PENDING_REVIEW
    elif all_consistent:
        if num_engines >= 3:
            validation.confidence = VerifyConfidence.HIGH
            validation.review_status = ReviewStatus.AUTO_APPROVED
        else:
            validation.confidence = VerifyConfidence.MEDIUM
            validation.review_status = ReviewStatus.AUTO_APPROVED
    else:
        # 检查多数一致性
        consistent_count = sum(
            1 for fc in validation.field_comparisons.values()
            if fc.is_consistent
        )

        if consistent_count >= len(CRITICAL_FIELDS) - 1:
            # 只有1个字段不一致
            validation.confidence = VerifyConfidence.MEDIUM
            validation.review_status = ReviewStatus.PENDING_REVIEW
        else:
            validation.confidence = VerifyConfidence.CONFLICT
            validation.review_status = ReviewStatus.PENDING_REVIEW

    # 合并数据（使用多数值或第一个引擎的值）
    merged = {}
    first_engine_data = engine_data[engines[0]]

    for field_name in CRITICAL_FIELDS + SECONDARY_FIELDS:
        comparison = validation.field_comparisons.get(field_name)
        if comparison and comparison.majority_value is not None:
            merged[field_name] = comparison.majority_value
        elif field_name in first_engine_data:
            merged[field_name] = first_engine_data[field_name]

    # 补充其他字段
    for key, value in first_engine_data.items():
        if key not in merged:
            merged[key] = value

    validation.merged_data = merged

    return validation


class MultiEngineValidator:
    """多引擎交叉校验器"""

    def __init__(
        self,
        enable_baidu: bool = True,
        enable_paddleocr: bool = True,
        enable_rapid: bool = True,
        enable_ai: bool = True,
        ai_config: Dict = None
    ):
        self.enable_baidu = enable_baidu
        self.enable_paddleocr = enable_paddleocr
        self.enable_rapid = enable_rapid
        self.enable_ai = enable_ai
        self.ai_config = ai_config or {}

        # 引擎实例缓存
        self._rapid_ocr = None

    def get_enabled_engines(self) -> List[str]:
        """获取启用的引擎列表"""
        engines = []
        if self.enable_baidu:
            engines.append("baidu")
        if self.enable_paddleocr:
            engines.append("paddleocr")
        if self.enable_rapid:
            engines.append("rapid")
        if self.enable_ai:
            engines.append("ai")
        return engines

    async def run_single_engine(
        self,
        engine: str,
        img_path: str,
        data_type: str,
        context: Dict = None
    ) -> EngineResult:
        """运行单个引擎"""
        try:
            if engine == "baidu":
                return await self._run_baidu(img_path, data_type, context)
            elif engine == "paddleocr":
                return await self._run_paddleocr(img_path, data_type, context)
            elif engine == "rapid":
                return await self._run_rapid(img_path, data_type, context)
            elif engine == "ai":
                return await self._run_ai(img_path, data_type, context)
            else:
                return EngineResult(engine=engine, success=False, error=f"未知引擎: {engine}")
        except Exception as e:
            logger.error(f"引擎 {engine} 执行失败: {e}")
            return EngineResult(engine=engine, success=False, error=str(e))

    async def _run_baidu(self, img_path: str, data_type: str, context: Dict) -> EngineResult:
        """运行百度云 OCR"""
        try:
            # 临时切换 OCR 引擎
            import main
            original_engine = main.OCR_ENGINE

            if not main.BAIDU_OCR_API_KEY:
                return EngineResult(engine="baidu", success=False, error="百度 OCR API Key 未配置")

            # 直接调用百度 OCR
            ocr_result = main.run_baidu_ocr(img_path)

            # 解析结果
            if data_type == "supplementary":
                data = self._parse_supplementary_from_raw_ocr(ocr_result, img_path, context)
            else:
                data = self._parse_score_segment_from_raw_ocr(ocr_result)

            return EngineResult(engine="baidu", success=True, data=data)
        except Exception as e:
            return EngineResult(engine="baidu", success=False, error=str(e))

    async def _run_paddleocr(self, img_path: str, data_type: str, context: Dict) -> EngineResult:
        """运行 PaddleOCR Docker"""
        try:
            import main
            ocr_result = main.run_paddleocr_docker(img_path)

            if data_type == "supplementary":
                data = self._parse_supplementary_from_raw_ocr(ocr_result, img_path, context)
            else:
                data = self._parse_score_segment_from_raw_ocr(ocr_result)

            return EngineResult(engine="paddleocr", success=True, data=data)
        except Exception as e:
            return EngineResult(engine="paddleocr", success=False, error=str(e))

    async def _run_rapid(self, img_path: str, data_type: str, context: Dict) -> EngineResult:
        """运行 RapidOCR"""
        try:
            if self._rapid_ocr is None:
                from rapidocr_onnxruntime import RapidOCR
                self._rapid_ocr = RapidOCR()

            result, _ = self._rapid_ocr(img_path)
            if not result:
                return EngineResult(engine="rapid", success=True, data=[])

            # 转换格式
            ocr_result = []
            for box, text, confidence in result:
                ocr_result.append((box, text, confidence))

            if data_type == "supplementary":
                data = self._parse_supplementary_from_raw_ocr(ocr_result, img_path, context)
            else:
                data = self._parse_score_segment_from_raw_ocr(ocr_result)

            return EngineResult(engine="rapid", success=True, data=data)
        except Exception as e:
            return EngineResult(engine="rapid", success=False, error=str(e))

    async def _run_ai(self, img_path: str, data_type: str, context: Dict) -> EngineResult:
        """运行 AI 视觉模型"""
        if data_type != "supplementary":
            return EngineResult(engine="ai", success=False, error="AI 仅支持征集志愿解析")

        try:
            from ai_parser import parse_image_with_ai

            data = await parse_image_with_ai(
                img_path,
                api_key=self.ai_config.get("api_key"),
                base_url=self.ai_config.get("base_url"),
                model=self.ai_config.get("model"),
                context=context
            )

            return EngineResult(engine="ai", success=True, data=data)
        except Exception as e:
            return EngineResult(engine="ai", success=False, error=str(e))

    def _parse_supplementary_from_raw_ocr(
        self,
        ocr_result: List[Tuple],
        img_path: str,
        context: Dict
    ) -> List[Dict]:
        """从原始 OCR 结果解析征集志愿数据

        直接调用 main.py 中经过优化的解析函数，传入已有的 OCR 结果，
        避免重复调用 OCR 引擎，同时复用完整的解析逻辑。
        """
        import main

        if not ocr_result:
            return []

        # 调用 main.py 的解析函数，传入 ocr_result 参数避免重复 OCR
        return main.extract_supplementary_rows(img_path, context, ocr_result=ocr_result)

    def _parse_score_segment_from_raw_ocr(self, ocr_result: List[Tuple]) -> List[Dict]:
        """从原始 OCR 结果解析一分一段表数据"""
        import re

        if not ocr_result:
            return []

        # 收集识别结果
        items = []
        for box, text, confidence in ocr_result:
            y_center = (box[0][1] + box[2][1]) / 2
            x_center = (box[0][0] + box[2][0]) / 2
            items.append((y_center, x_center, text.strip(), confidence))

        # 按 y 坐标分组为行
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
            group.sort(key=lambda x: x[1])

            nums = []
            for _, _, text, _ in group:
                digits = re.findall(r'\d+', text)
                if digits:
                    nums.append(int(digits[0]))

            if len(nums) == 3:
                score, count, cumulative = nums
                if 100 <= score <= 750 and count >= 0 and cumulative >= 0:
                    rows.append({
                        "score": score,
                        "count": count,
                        "cumulative_count": cumulative
                    })

        return rows

    async def validate_image(
        self,
        img_path: str,
        data_type: str = "supplementary",
        context: Dict = None
    ) -> ValidationReport:
        """
        对单张图片进行多引擎校验

        Args:
            img_path: 图片路径
            data_type: 数据类型 (supplementary / score_segment)
            context: 上下文信息

        Returns:
            ValidationReport: 校验报告
        """
        report = ValidationReport()
        engines = self.get_enabled_engines()
        report.engines_used = engines

        logger.info(f"开始多引擎校验，启用引擎: {engines}")

        # 并行运行所有引擎
        tasks = [
            self.run_single_engine(engine, img_path, data_type, context)
            for engine in engines
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # 收集结果
        engine_results: Dict[str, EngineResult] = {}
        for engine, result in zip(engines, results):
            if isinstance(result, Exception):
                report.engines_failed[engine] = str(result)
                logger.error(f"引擎 {engine} 异常: {result}")
            elif isinstance(result, EngineResult):
                if result.success:
                    report.engines_success.append(engine)
                    engine_results[engine] = result
                    logger.info(f"引擎 {engine} 成功，识别 {len(result.data)} 条记录")
                else:
                    report.engines_failed[engine] = result.error
                    logger.warning(f"引擎 {engine} 失败: {result.error}")

        if not engine_results:
            logger.error("所有引擎都失败了")
            return report

        # 按记录 key 分组
        all_records: Dict[str, Dict[str, Dict]] = {}

        for engine, result in engine_results.items():
            for row in result.data:
                key = make_record_key(row)
                if key not in all_records:
                    all_records[key] = {}
                all_records[key][engine] = row

        # 校验每条记录
        for record_key, engine_data in all_records.items():
            validation = validate_record(record_key, engine_data)
            report.records.append(validation)

            # 统计
            if validation.confidence == VerifyConfidence.HIGH:
                report.high_confidence += 1
            elif validation.confidence == VerifyConfidence.MEDIUM:
                report.medium_confidence += 1
            elif validation.confidence == VerifyConfidence.LOW:
                report.low_confidence += 1
            elif validation.confidence == VerifyConfidence.CONFLICT:
                report.conflicts += 1

            if validation.review_status == ReviewStatus.AUTO_APPROVED:
                report.auto_approved_count += 1
            else:
                report.pending_review_count += 1

        report.total_records = len(report.records)

        logger.info(
            f"校验完成: 总计 {report.total_records} 条, "
            f"高置信 {report.high_confidence}, 中置信 {report.medium_confidence}, "
            f"冲突 {report.conflicts}, 待审核 {report.pending_review_count}"
        )

        return report

    def get_approved_data(self, report: ValidationReport) -> List[Dict]:
        """获取自动通过的数据"""
        return [
            record.merged_data
            for record in report.records
            if record.review_status == ReviewStatus.AUTO_APPROVED
        ]

    def get_pending_review_data(self, report: ValidationReport) -> List[RecordValidation]:
        """获取待人工审核的数据"""
        return [
            record
            for record in report.records
            if record.review_status == ReviewStatus.PENDING_REVIEW
        ]


# ==================== 一分一段表专用校验 ====================

class ScoreSegmentValidator:
    """一分一段表多引擎校验器"""

    def __init__(self, validator: MultiEngineValidator):
        self.validator = validator

    async def validate_score_segment(
        self,
        img_path: str,
        context: Dict = None
    ) -> ValidationReport:
        """校验一分一段表"""
        report = await self.validator.validate_image(
            img_path,
            data_type="score_segment",
            context=context
        )

        # 额外的数学校验
        self._apply_math_validation(report)

        return report

    def _apply_math_validation(self, report: ValidationReport):
        """应用数学校验规则"""
        # 按分数排序
        records = sorted(
            report.records,
            key=lambda r: r.merged_data.get("score", 0),
            reverse=True
        )

        prev_cumulative = 0

        for record in records:
            data = record.merged_data
            score = data.get("score", 0)
            count = data.get("count", 0)
            cumulative = data.get("cumulative_count", 0)

            # 校验1: 累计人数必须递增
            if cumulative < prev_cumulative:
                record.confidence = VerifyConfidence.CONFLICT
                record.review_status = ReviewStatus.PENDING_REVIEW
                record.conflict_fields.append("cumulative_count")
                record.review_note = f"累计人数异常: {cumulative} < 上一分数 {prev_cumulative}"

            # 校验2: 累计人数 = 上一累计 + 本分数人数
            expected_cumulative = prev_cumulative + count
            if cumulative != expected_cumulative and count > 0:
                # 允许小误差（OCR 可能有误）
                if abs(cumulative - expected_cumulative) > 5:
                    record.confidence = VerifyConfidence.LOW
                    record.review_status = ReviewStatus.PENDING_REVIEW
                    record.review_note = f"累计人数不匹配: 期望 {expected_cumulative}, 实际 {cumulative}"

            prev_cumulative = cumulative


# ==================== 征集志愿专用校验 ====================

class SupplementaryValidator:
    """征集志愿多引擎校验器"""

    def __init__(self, validator: MultiEngineValidator):
        self.validator = validator

    async def validate_supplementary(
        self,
        img_path: str,
        context: Dict = None
    ) -> ValidationReport:
        """校验征集志愿"""
        report = await self.validator.validate_image(
            img_path,
            data_type="supplementary",
            context=context
        )

        # 额外的业务校验
        self._apply_business_validation(report)

        return report

    def _apply_business_validation(self, report: ValidationReport):
        """应用业务校验规则"""
        # 按院校分组
        university_groups: Dict[str, List[RecordValidation]] = {}

        for record in report.records:
            uni_code = record.merged_data.get("university_code", "")
            if uni_code not in university_groups:
                university_groups[uni_code] = []
            university_groups[uni_code].append(record)

        for uni_code, records in university_groups.items():
            # 按专业组分组
            group_records: Dict[str, List[RecordValidation]] = {}

            for record in records:
                group_code = record.merged_data.get("major_group_code", "")
                if group_code not in group_records:
                    group_records[group_code] = []
                group_records[group_code].append(record)

            # 校验专业组计划数 = 各专业计划数之和
            for group_code, group_recs in group_records.items():
                if not group_code:
                    continue

                group_plan = group_recs[0].merged_data.get("major_group_plan", 0)
                if group_plan == 0:
                    continue

                total_major_plan = sum(
                    r.merged_data.get("plan_count", 0)
                    for r in group_recs
                )

                if total_major_plan != group_plan:
                    # 标记所有该专业组的记录
                    for record in group_recs:
                        if record.review_status == ReviewStatus.AUTO_APPROVED:
                            record.review_status = ReviewStatus.PENDING_REVIEW
                            record.confidence = VerifyConfidence.LOW
                        record.review_note = (
                            f"专业组 {group_code} 计划数不匹配: "
                            f"组计划 {group_plan}, 专业合计 {total_major_plan}"
                        )


# ==================== 便捷函数 ====================

async def validate_supplementary_image(
    img_path: str,
    enable_baidu: bool = True,
    enable_paddleocr: bool = True,
    enable_rapid: bool = True,
    enable_ai: bool = True,
    ai_config: Dict = None,
    context: Dict = None
) -> ValidationReport:
    """
    便捷函数：校验征集志愿图片

    Args:
        img_path: 图片路径
        enable_*: 是否启用各引擎
        ai_config: AI 配置 {api_key, base_url, model}
        context: 上下文信息

    Returns:
        ValidationReport: 校验报告
    """
    validator = MultiEngineValidator(
        enable_baidu=enable_baidu,
        enable_paddleocr=enable_paddleocr,
        enable_rapid=enable_rapid,
        enable_ai=enable_ai,
        ai_config=ai_config
    )

    supp_validator = SupplementaryValidator(validator)
    return await supp_validator.validate_supplementary(img_path, context)


async def validate_score_segment_image(
    img_path: str,
    enable_baidu: bool = True,
    enable_paddleocr: bool = True,
    enable_rapid: bool = True,
    context: Dict = None
) -> ValidationReport:
    """
    便捷函数：校验一分一段表图片

    Args:
        img_path: 图片路径
        enable_*: 是否启用各引擎
        context: 上下文信息

    Returns:
        ValidationReport: 校验报告
    """
    validator = MultiEngineValidator(
        enable_baidu=enable_baidu,
        enable_paddleocr=enable_paddleocr,
        enable_rapid=enable_rapid,
        enable_ai=False  # 一分一段表不使用 AI
    )

    score_validator = ScoreSegmentValidator(validator)
    return await score_validator.validate_score_segment(img_path, context)
