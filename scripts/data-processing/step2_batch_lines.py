"""
Step 2: 批次线处理
输入: data/01_核心录取数据/批次线_四川.json (3年, 嵌套结构)
输出: scripts/data-processing/output/batch_lines.json + .sql
目标表: BatchLine (year, province, batch, examType, batchType, score)
"""
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

def load_source():
    path = os.path.join(DATA_DIR, '01_核心录取数据', '批次线_四川.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def process(raw_data):
    """展平嵌套结构: [{year, batches: [...]}] → 扁平行"""
    results = []
    errors = []
    seen_keys = set()

    for year_block in raw_data:
        year_str = year_block.get('year', '')
        batches = year_block.get('batches', [])

        for b in batches:
            year = int(year_str) if year_str else int(b.get('year', 0))
            batch = b.get('batch', '').strip()
            course = b.get('course', '').strip()
            batch_type = b.get('batchType', '').strip()
            score = b.get('score')

            if not batch or not course or score is None:
                errors.append(f"Year {year}: incomplete record batch={batch} course={course} score={score}")
                continue

            score = int(score) if score else 0
            if score <= 0:
                errors.append(f"Year {year}: {batch}/{course} score={score}, skipped")
                continue

            # 唯一键: (year, province, batch, examType)
            key = (year, '四川', batch, course)
            if key in seen_keys:
                errors.append(f"Duplicate: {key}")
                continue
            seen_keys.add(key)

            results.append({
                'year': year,
                'province': '四川',
                'batch': batch,
                'examType': course,
                'batchType': batch_type,
                'score': score,
            })

    return results, errors

def generate_sql(records):
    lines = [
        "-- 批次线数据导入",
        "-- 总记录数: {}".format(len(records)),
        "",
        "TRUNCATE TABLE batch_lines RESTART IDENTITY CASCADE;",
        "",
    ]
    values = []
    for r in records:
        batch = r['batch'].replace("'", "''")
        exam_type = r['examType'].replace("'", "''")
        batch_type = r['batchType'].replace("'", "''")
        province = r['province'].replace("'", "''")
        values.append(
            f"  ({r['year']}, '{province}', '{batch}', '{exam_type}', "
            f"'{batch_type}', {r['score']}, NOW(), NOW())"
        )
    lines.append(
        "INSERT INTO batch_lines "
        "(year, province, batch, exam_type, batch_type, score, created_at, updated_at) "
        "VALUES"
    )
    lines.append(",\n".join(values) + ";")
    return "\n".join(lines)

def main():
    print("=" * 60)
    print("Step 2: 批次线处理")
    print("=" * 60)

    raw = load_source()
    print(f"加载: {len(raw)} 个年份块")

    records, errors = process(raw)
    print(f"处理后有效: {len(records)} 条")
    if errors:
        print(f"跳过/错误: {len(errors)} 条")
        for e in errors[:10]:
            print(f"  {e}")

    # 统计
    print(f"\n年份分布:")
    year_counts = {}
    for r in records:
        y = r['year']
        year_counts[y] = year_counts.get(y, 0) + 1
    for y in sorted(year_counts):
        print(f"  {y}: {year_counts[y]} 条")

    print(f"\n批次类型分布:")
    bt_counts = {}
    for r in records:
        bt = r['batchType']
        bt_counts[bt] = bt_counts.get(bt, 0) + 1
    for bt, c in sorted(bt_counts.items(), key=lambda x: -x[1]):
        print(f"  {bt}: {c}")

    # 输出
    json_path = os.path.join(OUTPUT_DIR, 'batch_lines.json')
    sql_path = os.path.join(OUTPUT_DIR, 'batch_lines.sql')

    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)
    print(f"\nJSON: {json_path}")

    sql = generate_sql(records)
    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write(sql)
    print(f"SQL: {sql_path}")

    print(f"\n完成 ✓")
    return records

if __name__ == '__main__':
    main()
