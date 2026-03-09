"""
高考一分一段表 OCR 导入脚本

从省教育考试院官网下载一分一段表图片，通过 RapidOCR 识别提取数据，
经过严格校验后写入 MySQL 数据库。

用法:
  cd scripts/import-score-segments
  pip install -r requirements.txt
  python import_score_segments.py --year=2025 --exam-type=物理类
  python import_score_segments.py --year=2025 --exam-type=物理类 --json-only
  python import_score_segments.py --from-json=output/2025_四川_物理类.json

支持:
  - 多年份、多省份、多考试类型
  - 自动下载图片并缓存
  - RapidOCR 识别（无需安装 Tesseract）
  - 严格数据校验（分数连续性、累计人数一致性）
  - JSON 备份 + MySQL 写入
"""

import os
import re
import sys
import json
import argparse
import requests
from rapidocr_onnxruntime import RapidOCR
from typing import List, Tuple, Dict
import mysql.connector


# ==================== 图片 URL 配置 ====================
# 按 (年份, 省份, 考试类型) 索引
IMAGE_URL_REGISTRY: Dict[Tuple[int, str, str], List[str]] = {
    (2025, "四川", "物理类"): [
        "https://www.sceea.cn/Upload/image/20250625/20250625184111_2608.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184111_4725.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184111_6328.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184111_7773.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184111_9703.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184112_3180.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184112_5619.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184112_7044.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184112_8113.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184112_9858.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184113_1833.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184113_3434.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184113_4858.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184113_6818.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184113_8427.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184113_9541.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184114_1795.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184114_3382.jpg",
        "https://www.sceea.cn/Upload/image/20250625/20250625184114_5421.jpg",
    ],
}

# 全局 OCR 实例（复用避免重复加载模型）
_ocr_instance = None


def get_ocr() -> RapidOCR:
    global _ocr_instance
    if _ocr_instance is None:
        _ocr_instance = RapidOCR()
    return _ocr_instance


def download_images(urls: List[str], cache_dir: str) -> List[str]:
    """下载图片到本地缓存目录"""
    os.makedirs(cache_dir, exist_ok=True)
    paths = []
    for i, url in enumerate(urls):
        filename = f"page_{i+1:02d}.jpg"
        filepath = os.path.join(cache_dir, filename)
        if os.path.exists(filepath):
            print(f"  [缓存] {filename}")
        else:
            print(f"  [下载] {url} -> {filename}")
            resp = requests.get(url, timeout=30, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                "Referer": "https://www.sceea.cn/",
            })
            resp.raise_for_status()
            with open(filepath, "wb") as f:
                f.write(resp.content)
        paths.append(filepath)
    return paths


def extract_rows_from_image(img_path: str) -> List[Tuple[int, int, int]]:
    """
    用 RapidOCR 识别单张图片，基于 bounding box 坐标智能分组为行。
    返回 [(分数, 人数, 累计人数), ...]
    """
    ocr = get_ocr()
    result, _ = ocr(img_path)

    if not result:
        return []

    # 收集所有识别结果：(y_center, x_center, text)
    items = []
    for box, text, confidence in result:
        y_center = (box[0][1] + box[2][1]) / 2
        x_center = (box[0][0] + box[2][0]) / 2
        items.append((y_center, x_center, text.strip(), confidence))

    # 按 y 坐标分组为行（同一行的 y 坐标差 < 30px）
    items.sort(key=lambda x: x[0])
    row_groups: List[List] = []
    current_group = [items[0]]

    for item in items[1:]:
        if abs(item[0] - current_group[-1][0]) < 30:
            current_group.append(item)
        else:
            row_groups.append(current_group)
            current_group = [item]
    row_groups.append(current_group)

    # 解析每一行
    rows = []
    for group in row_groups:
        # 按 x 坐标排序（左→右：分数、人数、累计人数）
        group.sort(key=lambda x: x[1])

        # 提取数字
        nums = []
        for _, _, text, _ in group:
            # 去掉中文字符（如"分"），只保留数字
            digits = re.findall(r'\d+', text)
            if digits:
                nums.append(int(digits[0]))

        if len(nums) == 3:
            score, count, cumulative = nums
            if 100 <= score <= 750 and count >= 0 and cumulative >= 0:
                rows.append((score, count, cumulative))
        elif len(nums) == 2:
            # 有些行人数为0时 OCR 可能漏掉，只识别到分数和累计人数
            # 通过 x 坐标判断：如果两个数字分别在左侧和右侧
            positions = []
            for _, x, text, _ in group:
                digits = re.findall(r'\d+', text)
                if digits:
                    positions.append((x, int(digits[0])))
            if len(positions) == 2:
                positions.sort(key=lambda p: p[0])
                x1, v1 = positions[0]
                x2, v2 = positions[1]
                # 左侧是分数（x~160），右侧是累计人数（x~679）
                if x1 < 300 and x2 > 500 and 100 <= v1 <= 750:
                    rows.append((v1, 0, v2))

    return rows


def ocr_all_images(image_paths: List[str]) -> List[Tuple[int, int, int]]:
    """对所有图片进行 OCR，合并结果"""
    all_rows = []
    for i, path in enumerate(image_paths):
        print(f"  OCR 第 {i+1}/{len(image_paths)} 张: {os.path.basename(path)}", end="")
        rows = extract_rows_from_image(path)
        if rows:
            print(f"  -> {len(rows)} 行 ({rows[0][0]}~{rows[-1][0]})")
        else:
            print(f"  -> 0 行")
        all_rows.extend(rows)
    return all_rows


def deduplicate_and_sort(rows: List[Tuple[int, int, int]]) -> List[Tuple[int, int, int]]:
    """去重并按分数降序排列"""
    score_map: Dict[int, Tuple[int, int]] = {}
    for score, count, cumulative in rows:
        if score not in score_map:
            score_map[score] = (count, cumulative)
        else:
            existing = score_map[score]
            if cumulative >= existing[1]:
                score_map[score] = (count, cumulative)

    result = [(score, data[0], data[1]) for score, data in score_map.items()]
    result.sort(key=lambda x: x[0], reverse=True)
    return result


def validate_data(rows: List[Tuple[int, int, int]], verbose: bool = True) -> Tuple[bool, List[str]]:
    """
    严格校验数据完整性：
    1. 分数必须连续
    2. 累计人数必须单调递增
    3. 累计人数 = 上一行累计人数 + 本行人数
    """
    errors = []

    if not rows:
        return False, ["没有识别到任何数据"]

    max_score = rows[0][0]
    min_score = rows[-1][0]
    expected_count = max_score - min_score + 1

    if verbose:
        print(f"  数据范围: {max_score} ~ {min_score} 分")
        print(f"  总行数: {len(rows)}, 期望: {expected_count}")

    # 检查1: 分数连续性
    score_set = set(r[0] for r in rows)
    missing = [s for s in range(max_score, min_score - 1, -1) if s not in score_set]
    if missing:
        errors.append(f"缺失 {len(missing)} 个分数点: {missing[:20]}{'...' if len(missing) > 20 else ''}")

    # 检查2: 累计人数单调递增
    for i in range(1, len(rows)):
        if rows[i][2] < rows[i-1][2]:
            errors.append(f"分数 {rows[i][0]}: 累计 {rows[i][2]} < 上行 {rows[i-1][2]}")

    # 检查3: 人数与累计人数一致性
    for i in range(1, len(rows)):
        expected_cum = rows[i-1][2] + rows[i][1]
        if abs(rows[i][2] - expected_cum) > 1:
            errors.append(
                f"分数 {rows[i][0]}: 累计 {rows[i][2]} != "
                f"上行累计 {rows[i-1][2]} + 人数 {rows[i][1]} = {expected_cum}"
            )

    return len(errors) == 0, errors


def fill_missing_scores(rows: List[Tuple[int, int, int]]) -> List[Tuple[int, int, int]]:
    """填补缺失的分数点（人数=0，累计人数=上一行）"""
    if not rows:
        return rows

    score_map = {r[0]: (r[1], r[2]) for r in rows}
    max_score = rows[0][0]
    min_score = rows[-1][0]

    filled = []
    prev_cumulative = 0
    filled_count = 0

    for score in range(max_score, min_score - 1, -1):
        if score in score_map:
            count, cumulative = score_map[score]
            filled.append((score, count, cumulative))
            prev_cumulative = cumulative
        else:
            filled.append((score, 0, prev_cumulative))
            filled_count += 1

    if filled_count > 0:
        print(f"  填补了 {filled_count} 个缺失分数点")

    return filled


def save_to_database(
    rows: List[Tuple[int, int, int]],
    year: int,
    province: str,
    exam_type: str,
    db_config: dict,
) -> int:
    """将数据写入 MySQL 数据库"""
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

    batch = [(year, province, exam_type, score, count, cumulative)
             for score, count, cumulative in rows]

    cursor.executemany(sql, batch)
    conn.commit()
    affected = cursor.rowcount
    cursor.close()
    conn.close()
    return affected


def save_to_json(rows: List[Tuple[int, int, int]], output_path: str,
                 year: int, province: str, exam_type: str):
    """将数据保存为 JSON 文件"""
    data = {
        "year": year,
        "province": province,
        "examType": exam_type,
        "totalRows": len(rows),
        "scoreRange": f"{rows[0][0]}~{rows[-1][0]}" if rows else "",
        "data": [
            {"score": s, "count": c, "cumulativeCount": cum}
            for s, c, cum in rows
        ],
    }
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  JSON 已保存: {output_path}")


def load_from_json(json_path: str) -> List[Tuple[int, int, int]]:
    """从 JSON 文件加载数据"""
    with open(json_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    rows = [(d["score"], d["count"], d["cumulativeCount"]) for d in data["data"]]
    print(f"  从 JSON 加载 {len(rows)} 行数据")
    return rows


def get_db_config_from_env() -> dict:
    """从 .env 文件或环境变量获取数据库配置"""
    env_path = os.path.join(os.path.dirname(__file__), "../../apps/server/.env")
    db_url = None

    if os.path.exists(env_path):
        with open(env_path, "r") as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_URL="):
                    db_url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break

    if not db_url:
        db_url = os.environ.get("DATABASE_URL", "")

    if not db_url:
        raise ValueError("未找到 DATABASE_URL，请检查 apps/server/.env 或设置环境变量")

    match = re.match(r'mysql://([^:]+):([^@]+)@([^:]+):(\d+)/(.+?)(\?.*)?$', db_url)
    if not match:
        raise ValueError(f"无法解析 DATABASE_URL: {db_url}")

    return {
        "user": match.group(1),
        "password": match.group(2),
        "host": match.group(3),
        "port": int(match.group(4)),
        "database": match.group(5),
    }


def get_image_urls(year: int, province: str, exam_type: str) -> List[str]:
    """获取图片 URL 列表"""
    key = (year, province, exam_type)
    if key not in IMAGE_URL_REGISTRY:
        available = [f"{y}年 {p} {e}" for y, p, e in IMAGE_URL_REGISTRY.keys()]
        raise ValueError(
            f"未配置 {year}年 {province} {exam_type} 的图片 URL。\n"
            f"已配置: {', '.join(available) if available else '无'}\n"
            f"请在 IMAGE_URL_REGISTRY 中添加对应的图片 URL 列表。"
        )
    return IMAGE_URL_REGISTRY[key]


def main():
    parser = argparse.ArgumentParser(description="高考一分一段表 OCR 导入工具")
    parser.add_argument("--year", type=int, default=2025, help="高考年份")
    parser.add_argument("--province", default="四川", help="省份")
    parser.add_argument("--exam-type", default="物理类", help="考试类型（物理类/历史类）")
    parser.add_argument("--from-json", help="从 JSON 文件导入（跳过 OCR）")
    parser.add_argument("--json-only", action="store_true", help="只输出 JSON，不写数据库")
    parser.add_argument("--cache-dir", help="图片缓存目录（默认自动生成）")
    args = parser.parse_args()

    print("=" * 60)
    print(f"  高考一分一段表导入工具 (RapidOCR)")
    print(f"  年份: {args.year}  省份: {args.province}  类型: {args.exam_type}")
    print("=" * 60)

    if args.from_json:
        print(f"\n[1/4] 从 JSON 文件加载...")
        rows = load_from_json(args.from_json)
    else:
        # Step 1: 下载图片
        print(f"\n[1/4] 下载图片...")
        image_urls = get_image_urls(args.year, args.province, args.exam_type)
        cache_dir = args.cache_dir or os.path.join(
            os.path.dirname(__file__), "cache",
            f"{args.year}_{args.exam_type.replace('/', '_')}"
        )
        image_paths = download_images(image_urls, cache_dir)
        print(f"  共 {len(image_paths)} 张图片")

        # Step 2: OCR 识别
        print(f"\n[2/4] RapidOCR 识别中...")
        raw_rows = ocr_all_images(image_paths)
        print(f"\n  原始识别: {len(raw_rows)} 行")

        rows = deduplicate_and_sort(raw_rows)
        print(f"  去重后: {len(rows)} 行")

    # Step 3: 数据校验
    print(f"\n[3/4] 数据校验...")
    is_valid, errors = validate_data(rows)

    if not is_valid:
        print(f"\n  ⚠ 发现 {len(errors)} 个问题:")
        for err in errors[:30]:
            print(f"    - {err}")

        if any("缺失" in e for e in errors):
            print(f"\n  尝试填补缺失分数...")
            rows = fill_missing_scores(rows)
            is_valid, errors2 = validate_data(rows, verbose=False)
            if is_valid:
                print(f"  ✓ 填补后数据校验通过")
            else:
                print(f"  仍有 {len(errors2)} 个问题:")
                for err in errors2[:10]:
                    print(f"    - {err}")
    else:
        print(f"  ✓ 数据校验通过！共 {len(rows)} 行，分数连续，累计人数递增")

    # 保存 JSON
    json_dir = os.path.join(os.path.dirname(__file__), "output")
    json_path = os.path.join(json_dir, f"{args.year}_{args.province}_{args.exam_type}.json")
    save_to_json(rows, json_path, args.year, args.province, args.exam_type)

    if args.json_only:
        print(f"\n  --json-only 模式，跳过数据库写入")
        sys.exit(0 if is_valid else 1)

    # Step 4: 写入数据库
    if not is_valid:
        print(f"\n  ⚠ 数据存在问题，是否仍要写入数据库？")
        confirm = input("  输入 'yes' 确认: ").strip()
        if confirm != 'yes':
            print("  已取消")
            return

    print(f"\n[4/4] 写入数据库...")
    try:
        db_config = get_db_config_from_env()
        print(f"  数据库: {db_config['host']}:{db_config['port']}/{db_config['database']}")
        affected = save_to_database(rows, args.year, args.province, args.exam_type, db_config)
        print(f"  ✓ 成功写入 {len(rows)} 条记录 (affected: {affected})")
    except Exception as e:
        print(f"  ✗ 数据库写入失败: {e}")
        print(f"  数据已保存到 JSON: {json_path}")
        print(f"  可稍后使用 --from-json={json_path} 重新导入")
        sys.exit(1)

    print(f"\n{'=' * 60}")
    print(f"  导入完成！")
    print(f"  分数范围: {rows[0][0]} ~ {rows[-1][0]}")
    print(f"  总记录数: {len(rows)}")
    print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
