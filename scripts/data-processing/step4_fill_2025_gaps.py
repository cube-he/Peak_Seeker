"""
Step 4: 用 01 API 补齐 03 主表所有年份字段空缺 + 注入院校层聚合分数

输入:
  - output/admission_records.json
  - data/01_核心录取数据/专业分数线_四川_{2022,2023,2024,2025}.json
  - data/01_核心录取数据/院校分数线_四川_{2022,2023,2024,2025}.json

处理:
  1. 按 (collegeEnrollCode, professionName, year) 从专业分数线回填 major-level 缺字段
     - majorMinScore/Rank, majorMaxScore/Rank, majorAvgScore/Rank, majorAdmissionCount
  2. 按 (collegeEnrollCode, batch, course, year) 从院校分数线注入 university-level 字段
     - universityMinScore, universityMinRank, universityAvgScore, universityAvgRank,
       universityMaxScore, universityMaxRank, universityAdmissionCount

输出:
  - output/admission_records_filled.json (补齐后)
  - output/fill_2025_report.json (补齐报告, 多年汇总)
"""
import json
import sys
import os
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
YEARS = [2022, 2023, 2024, 2025]

# 01 API 批次名 → 03 批次名 (保留兼容)
BATCH_MAP_01_TO_03 = {
    '本科B': '本科批B段',
    '专科': '专科批',
    '本科A(国家专项)': '本科批A段(国家专项)',
    '本科A(地方专项)': '本科批A段(地方专项)',
    '本科(高校专项)': '本科批(高校专项)',
    '本科(区域均衡专项)': '本科批(区域教育均衡发展专项)',
    '本科(高水平运动队)': '本科批(高水平运动队)',
}


def _pos(v):
    """返回 >0 的值, 否则 None (01 API 用 0 表示缺失)"""
    try:
        if v is None:
            return None
        n = int(v)
        return n if n > 0 else None
    except (ValueError, TypeError):
        return None


def load_major_api(year):
    path = os.path.join(DATA_DIR, '01_核心录取数据', f'专业分数线_四川_{year}.json')
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_univ_api(year):
    path = os.path.join(DATA_DIR, '01_核心录取数据', f'院校分数线_四川_{year}.json')
    if not os.path.exists(path):
        return []
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def load_admission_records():
    path = os.path.join(OUTPUT_DIR, 'admission_records.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_major_index(records, year):
    """(enrollCode_padded, professionName) -> best record (min minScore)."""
    idx = defaultdict(list)
    for r in records:
        if _pos(r.get('minScore')) is None and _pos(r.get('maxScore')) is None:
            continue
        code = str(r.get('collegeEnrollCode', '')).strip()
        name = (r.get('professionName') or '').strip()
        if not code or not name:
            continue
        idx[(code.zfill(4), name)].append(r)
    # Collapse: keep the record with the smallest minScore (most conservative)
    best = {}
    for key, lst in idx.items():
        best[key] = min(lst, key=lambda x: _pos(x.get('minScore')) or 10**9)
    return best


def build_univ_index(records, year):
    """(enrollCode_padded,) -> aggregated best record.
    院校分数线粒度 (enrollCode, batch, course), 按 enrollCode 聚合保留 min 最低分条。

    字段不一致处理: 2022-2024 的 u-prefix 字段 (uMinScore) 已填, 2025 仅 minScore 填充、
    u-前缀全为 0。此处优先 uMinScore, 回落到 minScore。
    """
    def pick_min(r):
        return _pos(r.get('uMinScore')) or _pos(r.get('minScore'))

    idx = defaultdict(list)
    for r in records:
        if pick_min(r) is None:
            continue
        code = str(r.get('collegeEnrollCode', '')).strip()
        if not code:
            continue
        idx[code.zfill(4)].append(r)
    best = {}
    for key, lst in idx.items():
        best[key] = min(lst, key=lambda x: pick_min(x) or 10**9)
    return best


def fill_major_fields(rec, api_rec):
    """回填 rec 中缺失 (None) 的 major-level 字段, api_rec 的 0 视为缺失."""
    mapping = {
        'majorMinScore': _pos(api_rec.get('minScore')),
        'majorMinRank':  _pos(api_rec.get('minRank')),
        'majorMaxScore': _pos(api_rec.get('maxScore')),
        'majorMaxRank':  _pos(api_rec.get('maxRank')),
        'majorAvgScore': _pos(api_rec.get('avgScore')),
        'majorAvgRank':  _pos(api_rec.get('avgRank')),
        'majorAdmissionCount': _pos(api_rec.get('enterNum')),
    }
    filled_any = False
    for k, v in mapping.items():
        if v is not None and rec.get(k) is None:
            rec[k] = v
            filled_any = True
    return filled_any


def inject_university_fields(rec, api_rec):
    """注入院校整体字段 (若记录当前无该字段).

    源字段 fallback: u-前缀优先 (2022-2024 已填), 否则用不带前缀的 (2025 只填这些)。
    """
    def pick(u_key, plain_key):
        return _pos(api_rec.get(u_key)) or _pos(api_rec.get(plain_key))

    mapping = {
        'universityMinScore':       pick('uMinScore', 'minScore'),
        'universityMaxScore':       pick('uMaxScore', 'maxScore'),
        'universityAvgScore':       pick('uAvgScore', 'avgScore'),
        'universityMinRank':        pick('uMinRank', 'minRank'),
        'universityAdmissionCount': pick('uEnterNum', 'enterNum'),
    }
    injected = False
    for k, v in mapping.items():
        if v is not None and rec.get(k) is None:
            rec[k] = v
            injected = True
    return injected


def main():
    print("=" * 60)
    print("Step 4: 多年度 01 API 补齐 + 院校层注入")
    print("=" * 60)

    adm = load_admission_records()
    print(f"03 录取记录总数: {len(adm)}")
    by_year = defaultdict(list)
    for r in adm:
        by_year[r['year']].append(r)

    # 建索引
    major_idx = {y: build_major_index(load_major_api(y), y) for y in YEARS}
    univ_idx = {y: build_univ_index(load_univ_api(y), y) for y in YEARS}

    for y in YEARS:
        print(f"  01 {y}: 专业索引 {len(major_idx[y])}, 院校索引 {len(univ_idx[y])}")

    report = {'per_year': {}}

    for y in YEARS:
        recs = by_year.get(y, [])
        if not recs:
            continue
        filled_major = 0
        injected_univ = 0
        for r in recs:
            code = str(r['universityEnrollCode']).zfill(4)
            name = r['majorName']
            api = major_idx[y].get((code, name))
            if api and fill_major_fields(r, api):
                filled_major += 1
                r.setdefault('_filledFrom', '01_API')
            u = univ_idx[y].get(code)
            if u and inject_university_fields(r, u):
                injected_univ += 1

        # 统计覆盖率
        has_major = sum(1 for r in recs if r.get('majorMinScore') is not None)
        has_group = sum(1 for r in recs if r.get('groupMinScore') is not None)
        has_filing = sum(1 for r in recs if r.get('filingMinScore') is not None)
        has_univ = sum(1 for r in recs if r.get('universityMinScore') is not None)

        n = len(recs)
        print(f"\n--- {y} ({n} 条) ---")
        print(f"  补齐 major 字段行数:    {filled_major}")
        print(f"  注入 university 行数:  {injected_univ}")
        print(f"  覆盖率:")
        print(f"    majorMinScore       {has_major}/{n} ({has_major/n*100:.1f}%)")
        print(f"    groupMinScore       {has_group}/{n} ({has_group/n*100:.1f}%)")
        print(f"    filingMinScore      {has_filing}/{n} ({has_filing/n*100:.1f}%)")
        print(f"    universityMinScore  {has_univ}/{n} ({has_univ/n*100:.1f}%)")

        report['per_year'][y] = {
            'total': n,
            'filled_major': filled_major,
            'injected_univ': injected_univ,
            'coverage': {
                'majorMinScore': has_major,
                'groupMinScore': has_group,
                'filingMinScore': has_filing,
                'universityMinScore': has_univ,
            },
        }

    # 合并输出
    all_records = []
    for y in sorted(by_year):
        all_records.extend(by_year[y])
    all_records.sort(key=lambda r: (r['universityEnrollCode'], r['majorName'], r['year']))

    out_path = os.path.join(OUTPUT_DIR, 'admission_records_filled.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)
    print(f"\n输出: {out_path} ({len(all_records)} 条)")

    report_path = os.path.join(OUTPUT_DIR, 'fill_2025_report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n完成 ✓")


if __name__ == '__main__':
    main()
