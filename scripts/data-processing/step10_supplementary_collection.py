"""
Step 10: 征集志愿清洗数据 → supplementary_records.json (对应 Prisma SupplementaryRecord)

输入:
  - data/_pipeline/P3/征集志愿_已清洗.xlsx (23,009 行, 已合并 2023-2025 所有批次和轮次)

转换规则:
  - year ← _meta_year
  - province ← '四川'
  - batch ← _meta_大批次 (如 "本科一批" / "专科批") + 可选子类型
  - roundNumber ← _meta_轮次 ('第一次'→1, '第二次'→2, '第三次'→3, 否则 1)
  - universityName ← 院校名称
  - majorName ← 专业名称
  - planCount ← 专业计划数
  - requirements ← 专业备注 / 院校备注 (优先专业备注)
  - filingMinScore ← 调档线 (仅部分轮次有)
  - 编码字段保留给下游 (universityEnrollCode, majorCode) 供 import_to_db 查询 FK

输出:
  - output/supplementary_records.json
"""
import json
import os
import sys
import math

import pandas as pd

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
INPUT_PATH = os.path.join(DATA_DIR, '_pipeline', 'P3', '征集志愿_已清洗.xlsx')

ROUND_MAP = {
    '第一次': 1, '第二次': 2, '第三次': 3,
    '第1次': 1, '第2次': 2, '第3次': 3,
    '一': 1, '二': 2, '三': 3,
}


def _s(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    s = str(v).strip()
    return s if s else None


def _i(v):
    if v is None or (isinstance(v, float) and math.isnan(v)):
        return None
    try:
        return int(float(v))
    except (ValueError, TypeError):
        return None


def parse_round(v):
    s = _s(v)
    if not s:
        return 1
    for k, n in ROUND_MAP.items():
        if k in s:
            return n
    # 数字直接解析
    digits = ''.join(c for c in s if c.isdigit())
    if digits:
        try:
            return int(digits)
        except ValueError:
            pass
    return 1


def build_batch(row):
    """batch = _meta_大批次 [+子类型]"""
    big = _s(row.get('_meta_大批次')) or _s(row.get('批次')) or '未知'
    sub = _s(row.get('_meta_子类型'))
    if sub:
        return f"{big}({sub})"
    return big


def build_requirements(row):
    parts = []
    for c in ('专业备注', '院校备注'):
        v = _s(row.get(c))
        if v:
            parts.append(v)
    return '; '.join(parts) if parts else None


def main():
    print("=" * 60)
    print("Step 10: 征集志愿 → supplementary_records")
    print("=" * 60)

    if not os.path.exists(INPUT_PATH):
        print(f"⚠ 未找到输入: {INPUT_PATH}")
        print("  跳过征集志愿处理 (需先运行 scripts/data_integration/ pipeline)")
        return

    df = pd.read_excel(INPUT_PATH, dtype=object)
    print(f"读取: {INPUT_PATH} ({len(df)} 行)")

    records = []
    skipped_no_univ = 0
    skipped_no_year = 0

    for _, row in df.iterrows():
        year = _i(row.get('_meta_year')) or _i(row.get('数据年份'))
        if not year:
            skipped_no_year += 1
            continue

        uni_name = _s(row.get('院校名称'))
        if not uni_name:
            skipped_no_univ += 1
            continue

        records.append({
            'year': year,
            'province': '四川',
            'batch': build_batch(row),
            'roundNumber': parse_round(row.get('_meta_轮次')),
            'universityEnrollCode': _s(row.get('院校代码')),
            'universityName': uni_name,
            'majorCode': _s(row.get('专业代码')),
            'majorName': _s(row.get('专业名称')),
            'planCount': _i(row.get('专业计划数') or row.get('专业组计划数')),
            'requirements': build_requirements(row),
            'filingMinScore': _i(row.get('调档线')),
            'filingMinRank': None,  # 征集志愿源数据无位次
            'subjectCategory': _s(row.get('科类') or row.get('_meta_科类')),
            'dataType': _s(row.get('_meta_数据类型')) or '征集志愿',
        })

    # 按 (year, batch, round, univ, major) 去重
    seen = set()
    dedup = []
    for r in records:
        key = (r['year'], r['batch'], r['roundNumber'],
               r['universityEnrollCode'], r['majorCode'])
        if key in seen:
            continue
        seen.add(key)
        dedup.append(r)

    out = os.path.join(OUTPUT_DIR, 'supplementary_records.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(dedup, f, ensure_ascii=False, indent=2)

    # 统计
    from collections import Counter
    year_counts = Counter(r['year'] for r in dedup)
    batch_counts = Counter(r['batch'] for r in dedup)
    round_counts = Counter(r['roundNumber'] for r in dedup)

    print(f"\n合法记录: {len(records)}  去重后: {len(dedup)}")
    print(f"  跳过-无年份: {skipped_no_year}  跳过-无院校: {skipped_no_univ}")
    print(f"\n按年份:")
    for y in sorted(year_counts):
        print(f"  {y}: {year_counts[y]}")
    print(f"\n按轮次:")
    for r in sorted(round_counts):
        print(f"  第{r}次: {round_counts[r]}")
    print(f"\n按批次 (前10):")
    for b, c in batch_counts.most_common(10):
        print(f"  {b}: {c}")

    has_filing = sum(1 for r in dedup if r['filingMinScore'])
    has_plan = sum(1 for r in dedup if r['planCount'])
    print(f"\n有调档线: {has_filing} ({has_filing/len(dedup)*100:.1f}%)")
    print(f"有计划数: {has_plan} ({has_plan/len(dedup)*100:.1f}%)")

    print(f"\n输出: {out}")
    print(f"完成 ✓")


if __name__ == '__main__':
    main()
