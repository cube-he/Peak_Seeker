"""
Step 8: 数据验证
对所有处理后的数据做系统性校验，输出验证报告。
"""
import json
import sys
import os
from collections import Counter

sys.stdout.reconfigure(encoding='utf-8')

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')

PASS = '✓ PASS'
WARN = '⚠ WARN'
FAIL = '✗ FAIL'


def load(filename):
    with open(os.path.join(OUTPUT_DIR, filename), 'r', encoding='utf-8') as f:
        return json.load(f)


def check_score_segments(segments):
    """验证一分一段表"""
    results = []

    # 1. 总数检查
    if len(segments) < 10000:
        results.append((FAIL, f"记录数过少: {len(segments)} (期望>10000)"))
    else:
        results.append((PASS, f"记录数: {len(segments)}"))

    # 2. 累计人数单调递增检查
    groups = {}
    for r in segments:
        key = (r['year'], r['examType'])
        groups.setdefault(key, []).append(r)

    mono_issues = 0
    for (year, et), group in groups.items():
        sorted_g = sorted(group, key=lambda x: -x['score'])
        prev = 0
        for r in sorted_g:
            if r['cumulativeCount'] < prev:
                mono_issues += 1
            prev = r['cumulativeCount']

    if mono_issues == 0:
        results.append((PASS, "累计人数单调递增"))
    else:
        results.append((FAIL, f"累计人数非单调递增: {mono_issues} 处"))

    # 3. 分数范围检查
    scores = [r['score'] for r in segments]
    if min(scores) < 0 or max(scores) > 750:
        results.append((FAIL, f"分数范围异常: {min(scores)}-{max(scores)}"))
    else:
        results.append((PASS, f"分数范围: {min(scores)}-{max(scores)}"))

    # 4. 年份覆盖
    years = sorted(set(r['year'] for r in segments))
    results.append((PASS, f"年份覆盖: {years[0]}-{years[-1]} ({len(years)}年)"))

    return results


def check_batch_lines(lines):
    """验证批次线"""
    results = []
    results.append((PASS, f"记录数: {len(lines)}"))

    # 分数合理性
    scores = [r['score'] for r in lines]
    if min(scores) < 100 or max(scores) > 700:
        results.append((WARN, f"分数范围: {min(scores)}-{max(scores)}"))
    else:
        results.append((PASS, f"分数范围: {min(scores)}-{max(scores)}"))

    # 2025年批次覆盖
    batches_2025 = [r['batch'] for r in lines if r['year'] == 2025 and r['batchType'] == '普通类']
    results.append((PASS, f"2025普通类批次: {batches_2025}"))

    return results


def check_universities(unis):
    """验证院校数据"""
    results = []
    results.append((PASS, f"院校总数: {len(unis)}"))

    # 有国标代码的比例
    has_national = sum(1 for u in unis if u['code'] != str(u['enrollCode']))
    results.append((PASS, f"有国标代码: {has_national}/{len(unis)} ({has_national/len(unis)*100:.1f}%)"))

    # 关键字段覆盖
    for field, label in [('province', '省份'), ('city', '城市'), ('type', '类型'),
                          ('ranking', '排名'), ('postgradRate', '保研率'),
                          ('satisfactionOverall', '满意度'), ('charterFilingRatio', '调档比例')]:
        has = sum(1 for u in unis if u.get(field))
        results.append((PASS if has > 0 else WARN,
                         f"{label}覆盖: {has}/{len(unis)} ({has/len(unis)*100:.1f}%)"))

    return results


def check_admission_records(records):
    """验证录取记录"""
    results = []
    results.append((PASS, f"总记录数: {len(records)}"))

    # 按年统计
    year_counts = Counter(r['year'] for r in records)
    for y in sorted(year_counts):
        results.append((PASS, f"  {y}: {year_counts[y]} 条"))

    # 分数逻辑检查: minScore <= avgScore <= maxScore
    logic_errors = 0
    for r in records:
        mins = r.get('majorMinScore')
        avgs = r.get('majorAvgScore')
        maxs = r.get('majorMaxScore')
        if mins and avgs and mins > avgs:
            logic_errors += 1
        if avgs and maxs and avgs > maxs:
            logic_errors += 1
        if mins and maxs and mins > maxs:
            logic_errors += 1
    if logic_errors == 0:
        results.append((PASS, "分数逻辑: minScore ≤ avgScore ≤ maxScore"))
    else:
        results.append((WARN, f"分数逻辑异常: {logic_errors} 处"))

    # 位次检查: minRank >= maxRank (数字越小排名越高)
    rank_errors = 0
    for r in records:
        minr = r.get('majorMinRank')
        maxr = r.get('majorMaxRank')
        if minr and maxr and minr < maxr:
            rank_errors += 1
    if rank_errors == 0:
        results.append((PASS, "位次逻辑: minRank ≥ maxRank (数字越大排名越低)"))
    else:
        results.append((WARN, f"位次逻辑异常: {rank_errors} 处"))

    # 2025覆盖率
    r2025 = [r for r in records if r['year'] == 2025]
    has_major = sum(1 for r in r2025 if r.get('majorMinScore'))
    has_group = sum(1 for r in r2025 if r.get('groupMinScore'))
    results.append((PASS, f"2025专业级覆盖: {has_major}/{len(r2025)} ({has_major/len(r2025)*100:.1f}%)"))
    results.append((PASS, f"2025组级覆盖: {has_group}/{len(r2025)} ({has_group/len(r2025)*100:.1f}%)"))

    return results


def check_enrollment_plans(plans):
    """验证招生计划"""
    results = []
    results.append((PASS, f"总记录数: {len(plans)}"))

    # 批次分布
    batch_counts = Counter(p['batch'] for p in plans)
    for b, c in batch_counts.most_common():
        results.append((PASS, f"  {b}: {c}"))

    # 选科要求覆盖
    has_subject = sum(1 for p in plans if p.get('subjectRequirements'))
    results.append((PASS, f"有选科要求: {has_subject}/{len(plans)} ({has_subject/len(plans)*100:.1f}%)"))

    return results


def cross_validate_with_api():
    """抽样与01原始API数据交叉验证"""
    results = []

    # 读取已处理的录取记录
    adm = load('admission_records_filled.json')
    adm_2024 = {(r['universityEnrollCode'], r['majorName']): r
                 for r in adm if r['year'] == 2024 and r.get('majorMinScore')}

    # 读取01原始API 2024
    api_path = os.path.join(DATA_DIR, '01_核心录取数据', '专业分数线_四川_2024.json')
    with open(api_path, 'r', encoding='utf-8') as f:
        api = json.load(f)

    # 注意: 2024年分数在uMinScore字段
    api_by_name = {}
    for r in api:
        if r.get('uMinScore', 0) > 0 or r.get('minScore', 0) > 0:
            score = r.get('uMinScore', 0) or r.get('minScore', 0)
            key = (r['collegeEnrollCode'], r['professionName'])
            if key not in api_by_name:
                api_by_name[key] = score

    # 随机抽10条对比
    import random
    sample_keys = random.sample(list(set(adm_2024.keys()) & set(api_by_name.keys())),
                                 min(10, len(set(adm_2024.keys()) & set(api_by_name.keys()))))

    match_count = 0
    for key in sample_keys:
        our_score = adm_2024[key]['majorMinScore']
        api_score = api_by_name[key]
        diff = abs(our_score - api_score)
        status = '✓' if diff <= 2 else '✗'
        if diff <= 2:
            match_count += 1
        results.append((PASS if diff <= 2 else WARN,
                         f"  {key[1][:15]:15s} | 我们={our_score} API={api_score} Δ={diff} {status}"))

    results.insert(0, (PASS if match_count >= 8 else WARN,
                        f"抽样验证: {match_count}/10 一致"))

    return results


def main():
    print("=" * 60)
    print("Step 8: 数据验证报告")
    print("=" * 60)

    all_results = []

    # 1. 一分一段表
    print("\n[1] 一分一段表")
    seg = load('score_segments.json')
    for status, msg in check_score_segments(seg):
        print(f"  {status} {msg}")
        all_results.append((status, msg))

    # 2. 批次线
    print("\n[2] 批次线")
    bl = load('batch_lines.json')
    for status, msg in check_batch_lines(bl):
        print(f"  {status} {msg}")
        all_results.append((status, msg))

    # 3. 院校
    print("\n[3] 院校数据")
    unis = load('universities_enriched.json')
    for status, msg in check_universities(unis):
        print(f"  {status} {msg}")
        all_results.append((status, msg))

    # 4. 录取记录
    print("\n[4] 录取记录")
    adm = load('admission_records_filled.json')
    for status, msg in check_admission_records(adm):
        print(f"  {status} {msg}")
        all_results.append((status, msg))

    # 5. 招生计划
    print("\n[5] 招生计划")
    plans = load('enrollment_plans_enriched.json')
    for status, msg in check_enrollment_plans(plans):
        print(f"  {status} {msg}")
        all_results.append((status, msg))

    # 6. 抽样交叉验证
    print("\n[6] 与01 API抽样交叉验证 (2024年)")
    for status, msg in cross_validate_with_api():
        print(f"  {status} {msg}")
        all_results.append((status, msg))

    # 汇总
    pass_count = sum(1 for s, _ in all_results if PASS in s)
    warn_count = sum(1 for s, _ in all_results if WARN in s)
    fail_count = sum(1 for s, _ in all_results if FAIL in s)

    print(f"\n{'='*60}")
    print(f"验证汇总: {pass_count} PASS / {warn_count} WARN / {fail_count} FAIL")
    print(f"{'='*60}")

    # 输出报告
    report = {
        'pass': pass_count,
        'warn': warn_count,
        'fail': fail_count,
        'details': [{'status': s, 'message': m} for s, m in all_results],
    }
    report_path = os.path.join(OUTPUT_DIR, 'validation_report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
    print(f"\n报告: {report_path}")
    print(f"\n完成 ✓")


if __name__ == '__main__':
    main()
