"""
Step 7: 导入增值数据（体检受限 + 招生章程已在Step 6处理）
输入:
  - data/07_政策文件/体检受限专业对照表.json (1,974条)
处理:
  - 转为可导入的结构化数据
  - 按severity分类: hard(不予录取) vs soft(不宜就读)
输出:
  - output/health_restrictions.json
  - output/health_restrictions.sql
"""
import json
import sys
import os

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')


def main():
    print("=" * 60)
    print("Step 7: 增值数据处理")
    print("=" * 60)

    # 1. 体检受限
    print("\n--- 体检受限专业对照表 ---")
    path = os.path.join(DATA_DIR, '07_政策文件', '体检受限专业对照表.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    records = data.get('records', data) if isinstance(data, dict) else data
    print(f"原始记录: {len(records)} 条")

    # 处理
    result = []
    for r in records:
        result.append({
            'conditionCode': r.get('condition_code', ''),
            'conditionName': r.get('condition_name', ''),
            'restrictionType': r.get('restriction_type', ''),
            'severity': r.get('severity', ''),
            'section': r.get('section', ''),
            'restrictionScope': r.get('restriction_scope', ''),
            'majorCategory': r.get('major_category', ''),
            'majorCode': r.get('major_code', ''),
            'majorName': r.get('major_name', ''),
        })

    # 统计
    from collections import Counter
    severity_counts = Counter(r['severity'] for r in result)
    type_counts = Counter(r['restrictionType'] for r in result)
    print(f"严重程度分布:")
    for s, c in severity_counts.most_common():
        print(f"  {s}: {c}")
    print(f"限制类型分布:")
    for t, c in type_counts.most_common():
        print(f"  {t}: {c}")

    # 去重
    unique_conditions = len(set(r['conditionCode'] for r in result))
    unique_majors = len(set(r['majorName'] for r in result if r['majorName']))
    print(f"唯一体检条件: {unique_conditions}")
    print(f"涉及专业: {unique_majors}")

    # 输出JSON
    out_path = os.path.join(OUTPUT_DIR, 'health_restrictions.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"\nJSON: {out_path} ({len(result)} 条)")

    # 输出SQL
    sql_lines = [
        "-- 体检受限专业对照表",
        "-- 总记录数: {}".format(len(result)),
        "",
        "CREATE TABLE IF NOT EXISTS health_restrictions (",
        "  id SERIAL PRIMARY KEY,",
        "  condition_code VARCHAR(50) NOT NULL,",
        "  condition_name TEXT NOT NULL,",
        "  restriction_type VARCHAR(50) NOT NULL,",
        "  severity VARCHAR(20) NOT NULL,",
        "  section VARCHAR(100),",
        "  restriction_scope VARCHAR(50),",
        "  major_category VARCHAR(200),",
        "  major_code VARCHAR(50),",
        "  major_name VARCHAR(200),",
        "  created_at TIMESTAMP DEFAULT NOW(),",
        "  updated_at TIMESTAMP DEFAULT NOW()",
        ");",
        "",
        "TRUNCATE TABLE health_restrictions RESTART IDENTITY CASCADE;",
        "",
    ]

    batch_size = 200
    for i in range(0, len(result), batch_size):
        batch = result[i:i+batch_size]
        values = []
        for r in batch:
            vals = [
                f"'{r[k].replace(chr(39), chr(39)+chr(39))}'" if r.get(k) else 'NULL'
                for k in ['conditionCode', 'conditionName', 'restrictionType',
                          'severity', 'section', 'restrictionScope',
                          'majorCategory', 'majorCode', 'majorName']
            ]
            values.append(f"  ({', '.join(vals)}, NOW(), NOW())")
        sql_lines.append(
            "INSERT INTO health_restrictions "
            "(condition_code, condition_name, restriction_type, severity, "
            "section, restriction_scope, major_category, major_code, major_name, "
            "created_at, updated_at) VALUES"
        )
        sql_lines.append(",\n".join(values) + ";")
        sql_lines.append("")

    sql_path = os.path.join(OUTPUT_DIR, 'health_restrictions.sql')
    with open(sql_path, 'w', encoding='utf-8') as f:
        f.write("\n".join(sql_lines))
    print(f"SQL: {sql_path}")

    print(f"\n完成 ✓")


if __name__ == '__main__':
    main()
