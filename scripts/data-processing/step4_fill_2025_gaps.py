"""
Step 4: 用01 API补齐03主表的2025空缺
输入:
  - output/admission_records.json (Step 3 输出)
  - data/01_核心录取数据/专业分数线_四川_2025.json
处理:
  - 找出 admission_records 中 2025年 majorMinScore=null 的记录
  - 通过 enrollCode 匹配01的 collegeEnrollCode + majorName
  - 注意: 01的2025分数在 minScore 字段 (非uMinScore)
  - 注意: 批次名不同, 需映射
输出:
  - output/admission_records_filled.json (补齐后)
  - output/fill_2025_report.json (补齐报告)
"""
import json
import sys
import os
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

# 01 API批次名 → 03批次名 映射
BATCH_MAP_01_TO_03 = {
    '本科B': '本科批B段',
    '专科': '专科批',
    '本科A(国家专项)': '本科批A段(国家专项)',
    '本科A(地方专项)': '本科批A段(地方专项)',
    '本科(高校专项)': '本科批(高校专项)',
    '本科(区域均衡专项)': '本科批(区域教育均衡发展专项)',
    '本科(高水平运动队)': '本科批(高水平运动队)',  # 03中不一定有这个批次
}


def load_api_2025():
    """加载01 API 2025专业分数线"""
    path = os.path.join(DATA_DIR, '01_核心录取数据', '专业分数线_四川_2025.json')
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # 只取有分数的记录 (2025年: minScore字段, 非uMinScore)
    valid = [r for r in data if r.get('minScore', 0) > 0]
    return valid


def load_admission_records():
    path = os.path.join(OUTPUT_DIR, 'admission_records.json')
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def build_api_index(api_records):
    """构建 (enrollCode, majorName) → [records] 索引"""
    idx = defaultdict(list)
    for r in api_records:
        key = (r['collegeEnrollCode'], r['professionName'])
        idx[key].append(r)
    return idx


def main():
    print("=" * 60)
    print("Step 4: 用01 API补齐2025空缺")
    print("=" * 60)

    # 加载
    api = load_api_2025()
    print(f"01 API 2025有分记录: {len(api)}")

    adm = load_admission_records()
    print(f"03 录取记录总数: {len(adm)}")

    # 分离2025记录
    adm_2025 = [r for r in adm if r['year'] == 2025]
    adm_other = [r for r in adm if r['year'] != 2025]
    print(f"  2025年记录: {len(adm_2025)}")

    # 统计2025中缺少专业级分数的
    missing_major = [r for r in adm_2025 if r.get('majorMinScore') is None]
    has_major = [r for r in adm_2025 if r.get('majorMinScore') is not None]
    print(f"  有专业级分数: {len(has_major)}")
    print(f"  缺专业级分数: {len(missing_major)}")

    # 建API索引
    api_idx = build_api_index(api)
    print(f"  API索引: {len(api_idx)} 个(school+major)组合")

    # 补齐
    filled_count = 0
    fill_details = []

    for r in missing_major:
        enroll_code = r['universityEnrollCode']
        major_name = r['majorName']

        # 零填充4位
        enroll_code_padded = str(enroll_code).zfill(4)

        candidates = api_idx.get((enroll_code_padded, major_name), [])
        if not candidates:
            # 试不补零的
            candidates = api_idx.get((str(enroll_code), major_name), [])

        if candidates:
            # 取第一条有分的(如果有多条，取minScore最低的那条，是最保守的)
            best = min(candidates, key=lambda x: x.get('minScore', 999))
            r['majorMinScore'] = best.get('minScore')
            r['majorMinRank'] = best.get('minRank')
            r['majorAvgScore'] = best.get('avgScore') if best.get('avgScore', 0) > 0 else None
            r['majorMaxScore'] = best.get('maxScore') if best.get('maxScore', 0) > 0 else None
            r['majorAdmissionCount'] = best.get('enterNum') if best.get('enterNum', 0) > 0 else None
            r['_filledFrom'] = '01_API'
            filled_count += 1

            if len(fill_details) < 20:
                fill_details.append({
                    'school': best['collegeName'],
                    'major': major_name,
                    'minScore': best.get('minScore'),
                    'minRank': best.get('minRank'),
                })

    # 合并结果
    all_records = adm_other + adm_2025
    all_records.sort(key=lambda r: (r['universityEnrollCode'], r['majorName'], r['year']))

    # 统计
    print(f"\n--- 补齐结果 ---")
    print(f"  补齐: {filled_count} 条")
    print(f"  仍缺: {len(missing_major) - filled_count} 条")

    if fill_details:
        print(f"\n  补齐样例:")
        for d in fill_details[:10]:
            print(f"    {d['school']}/{d['major']}: {d['minScore']}/{d['minRank']}")

    # 2025最终统计
    adm_2025_final = [r for r in all_records if r['year'] == 2025]
    has_major_final = sum(1 for r in adm_2025_final if r.get('majorMinScore') is not None)
    has_group_only = sum(1 for r in adm_2025_final
                        if r.get('majorMinScore') is None and r.get('groupMinScore') is not None)
    neither = sum(1 for r in adm_2025_final
                  if r.get('majorMinScore') is None and r.get('groupMinScore') is None)
    print(f"\n  2025年最终覆盖:")
    print(f"    有专业级分数: {has_major_final} ({has_major_final/len(adm_2025_final)*100:.1f}%)")
    print(f"    仅有组级分数: {has_group_only} ({has_group_only/len(adm_2025_final)*100:.1f}%)")
    print(f"    完全无分数:   {neither} ({neither/len(adm_2025_final)*100:.1f}%)")

    # 输出
    out_path = os.path.join(OUTPUT_DIR, 'admission_records_filled.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(all_records, f, ensure_ascii=False, indent=2)
    print(f"\n输出: {out_path} ({len(all_records)} 条)")

    # 报告
    report = {
        'total_2025': len(adm_2025),
        'had_major_score': len(has_major),
        'missing_major_score': len(missing_major),
        'filled_from_api': filled_count,
        'still_missing': len(missing_major) - filled_count,
        'final_major_coverage': has_major_final,
        'final_group_only': has_group_only,
        'final_no_score': neither,
    }
    report_path = os.path.join(OUTPUT_DIR, 'fill_2025_report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n完成 ✓")


if __name__ == '__main__':
    main()
