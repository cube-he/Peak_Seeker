"""
Step 1: 一分一段表处理
输入: data/01_核心录取数据/一分一段表_四川_2017_2025_完整.json (12,245条)
输出: scripts/data-processing/output/score_segments.json + .sql
目标表: ScoreSegment (year, province, examType, score, count, cumulativeCount)
"""
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

def load_source():
    path = os.path.join(DATA_DIR, '01_核心录取数据', '一分一段表_四川_2017_2025_完整.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # 完整版是dict结构，实际数据在 "一分一段列表" key 下
    if isinstance(data, dict):
        return data.get('一分一段列表', data.get('data', []))
    return data

def process(raw_records):
    """处理原始记录，输出符合ScoreSegment schema的数据"""
    results = []
    errors = []
    seen_keys = set()

    for i, r in enumerate(raw_records):
        year = r.get('year')
        course = r.get('course', '')
        score = r.get('score')
        same_count = r.get('sameCount', 0)
        cumulative = r.get('cumulativeCount', 0)

        # 基本校验
        if year is None or score is None:
            errors.append(f"Row {i}: missing year or score")
            continue

        year = int(year)
        score = int(score)
        same_count = int(same_count) if same_count else 0
        cumulative = int(cumulative) if cumulative else 0

        # 过滤无效记录: score=0 的行
        if score <= 0:
            errors.append(f"Row {i}: score={score} invalid, skipped")
            continue

        # examType 保留原始科类名称
        exam_type = course.strip()
        if not exam_type:
            errors.append(f"Row {i}: empty course, skipped")
            continue

        # 去重: (year, province, examType, score) 是唯一键
        key = (year, '四川', exam_type, score)
        if key in seen_keys:
            errors.append(f"Row {i}: duplicate key {key}, skipped")
            continue
        seen_keys.add(key)

        results.append({
            'year': year,
            'province': '四川',
            'examType': exam_type,
            'score': score,
            'count': same_count,
            'cumulativeCount': cumulative,
        })

    return results, errors

def validate(records):
    """验证: 累计人数应单调递增(同年同科类, 分数降低时)"""
    issues = []
    # 按 (year, examType) 分组
    groups = {}
    for r in records:
        key = (r['year'], r['examType'])
        groups.setdefault(key, []).append(r)

    for (year, exam_type), group in groups.items():
        # 按分数降序排列(高分在前)
        sorted_group = sorted(group, key=lambda x: -x['score'])
        prev_cumulative = 0
        for r in sorted_group:
            if r['cumulativeCount'] < prev_cumulative:
                issues.append(
                    f"  {year}/{exam_type}: score={r['score']}, "
                    f"cumulative={r['cumulativeCount']} < prev={prev_cumulative}"
                )
            prev_cumulative = r['cumulativeCount']

    return issues

def generate_sql(records):
    """生成 SQL INSERT 语句"""
    lines = [
        "-- 一分一段表数据导入",
        "-- 生成时间: auto-generated",
        "-- 总记录数: {}".format(len(records)),
        "",
        "TRUNCATE TABLE score_segments RESTART IDENTITY CASCADE;",
        "",
    ]
    batch_size = 500
    for i in range(0, len(records), batch_size):
        batch = records[i:i+batch_size]
        values = []
        for r in batch:
            province = r['province'].replace("'", "''")
            exam_type = r['examType'].replace("'", "''")
            values.append(
                f"  ({r['year']}, '{province}', '{exam_type}', "
                f"{r['score']}, {r['count']}, {r['cumulativeCount']}, "
                f"NOW(), NOW())"
            )
        lines.append(
            "INSERT INTO score_segments "
            "(year, province, exam_type, score, count, cumulative_count, created_at, updated_at) "
            "VALUES"
        )
        lines.append(",\n".join(values) + ";")
        lines.append("")

    return "\n".join(lines)

def main():
    print("=" * 60)
    print("Step 1: 一分一段表处理")
    print("=" * 60)

    # 1. 加载
    raw = load_source()
    print(f"加载原始数据: {len(raw)} 条")

    # 2. 处理
    records, errors = process(raw)
    print(f"处理后有效: {len(records)} 条")
    if errors:
        print(f"跳过/错误: {len(errors)} 条")
        for e in errors[:10]:
            print(f"  {e}")
        if len(errors) > 10:
            print(f"  ... 还有 {len(errors)-10} 条")

    # 3. 统计
    years = {}
    for r in records:
        key = f"{r['year']}/{r['examType']}"
        years[key] = years.get(key, 0) + 1
    print(f"\n年份×科类分布:")
    for k in sorted(years.keys()):
        print(f"  {k}: {years[k]} 条")

    # 4. 验证
    issues = validate(records)
    if issues:
        print(f"\n验证问题 ({len(issues)} 处):")
        for iss in issues[:20]:
            print(iss)
    else:
        print(f"\n验证通过: 所有累计人数单调递增 ✓")

    # 5. 输出
    json_path = os.path.join(OUTPUT_DIR, 'score_segments.json')
    sql_path = os.path.join(OUTPUT_DIR, 'score_segments.sql')

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"\nJSON 输出: {json_path} ({len(records)} 条)")

    sql = generate_sql(records)
    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write(sql)
    print(f"SQL 输出: {sql_path}")

    print(f"\n完成 ✓")
    return records

if __name__ == '__main__':
    main()
