"""
Step 5: 用04专业组数据补全EnrollmentPlan的组级结构
输入:
  - output/enrollment_plans.json (Step 3 输出)
  - data/04_新高考专业组/2025新高考专业组模拟文理合并.xlsx (45,237行, 最完整合并版)
处理:
  - 通过 (院校代码, 专业代码) 匹配
  - 补全: groupCode, subjectRequirements, groupPlanCount
  - 校验: 选科要求是否一致
输出:
  - output/enrollment_plans_enriched.json
  - output/group_enrich_report.json
"""
import pandas as pd
import json
import sys
import os
import math

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')


def safe_str(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    s = str(val).strip()
    return s if s else None


def safe_int(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def load_04_data():
    """加载04专业组合并数据"""
    path = os.path.join(DATA_DIR, '04_新高考专业组', '2025新高考专业组模拟文理合并.xlsx')
    df = pd.read_excel(path)
    print(f"04数据: {len(df)} 行, {len(df.columns)} 列")
    print(f"列名: {list(df.columns)[:15]}...")

    records = []
    for _, row in df.iterrows():
        uni_code = safe_str(row.get('院校代码'))
        major_code = safe_str(row.get('专业代码'))
        major_name = safe_str(row.get('专业名称'))
        if not uni_code or not major_name:
            continue

        records.append({
            'uniCode': uni_code,
            'majorCode': major_code,
            'majorName': major_name,
            'groupCode': safe_str(row.get('专业组代码')),
            'subjectReq': safe_str(row.get('选科要求')),
            'groupPlanCount': safe_int(row.get('专业组计划人数')),
            'subject': safe_str(row.get('科类')) or safe_str(row.get('科目')),
            'batch': safe_str(row.get('招生类型')) or safe_str(row.get('批次')),
            'majorLevel': safe_str(row.get('专业水平')),
            'localMaster': safe_str(row.get('本专业硕士点')),
            'localDoctor': safe_str(row.get('本专业博士点')),
            'softRating': safe_str(row.get('软科评级')),
            'softRanking': safe_str(row.get('软科排名')),
            'disciplineEval': safe_str(row.get('学科评估')),
        })
    return records


def main():
    print("=" * 60)
    print("Step 5: 04专业组数据补全")
    print("=" * 60)

    # 加载03的enrollment plans
    plans_path = os.path.join(OUTPUT_DIR, 'enrollment_plans.json')
    with open(plans_path, 'r', encoding='utf-8') as f:
        plans = json.load(f)
    print(f"03招生计划: {len(plans)} 条")

    # 加载04
    group_data = load_04_data()
    print(f"04专业组: {len(group_data)} 条")

    # 建04索引: (uniCode, majorName) → record
    # 注意: 可能有多条(不同批次), 取第一条
    group_idx = {}
    for r in group_data:
        key = (r['uniCode'], r['majorName'])
        if key not in group_idx:
            group_idx[key] = r
    print(f"04索引: {len(group_idx)} 个唯一(院校+专业)组合")

    # 匹配补全
    matched = 0
    enriched_fields = {'groupCode': 0, 'subjectReq': 0, 'groupPlanCount': 0,
                       'softRating': 0, 'disciplineEval': 0}
    subject_mismatches = []

    for plan in plans:
        key = (plan['universityEnrollCode'], plan['majorName'])
        g = group_idx.get(key)
        if not g:
            continue
        matched += 1

        # 补全 groupCode
        if g['groupCode'] and not plan.get('groupCode'):
            plan['groupCode'] = g['groupCode']
            enriched_fields['groupCode'] += 1

        # 补全/校验选科要求
        if g['subjectReq']:
            if plan.get('subjectRequirements'):
                # 校验是否一致
                if plan['subjectRequirements'] != g['subjectReq']:
                    subject_mismatches.append({
                        'school': plan['universityEnrollCode'],
                        'major': plan['majorName'],
                        'plan_req': plan['subjectRequirements'],
                        'group_req': g['subjectReq'],
                    })
            else:
                plan['subjectRequirements'] = g['subjectReq']
                enriched_fields['subjectReq'] += 1

        # 补全 groupPlanCount
        if g['groupPlanCount'] and not plan.get('groupPlanCount'):
            plan['groupPlanCount'] = g['groupPlanCount']
            enriched_fields['groupPlanCount'] += 1

        # 补全专业评级信息
        if g['softRating'] and not plan.get('softRating'):
            plan['softRating'] = g['softRating']
            enriched_fields['softRating'] += 1

        if g['disciplineEval'] and not plan.get('disciplineEval'):
            plan['disciplineEval'] = g['disciplineEval']
            enriched_fields['disciplineEval'] += 1

    print(f"\n--- 匹配结果 ---")
    print(f"  匹配成功: {matched} / {len(plans)} ({matched/len(plans)*100:.1f}%)")
    print(f"  补全字段:")
    for field, count in enriched_fields.items():
        print(f"    {field}: +{count}")

    if subject_mismatches:
        print(f"\n  选科要求不一致: {len(subject_mismatches)} 条")
        for m in subject_mismatches[:5]:
            print(f"    院校{m['school']}/{m['major']}: plan={m['plan_req']} vs group={m['group_req']}")

    # 输出
    out_path = os.path.join(OUTPUT_DIR, 'enrollment_plans_enriched.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(plans, f, ensure_ascii=False, indent=2)
    print(f"\n输出: {out_path} ({len(plans)} 条)")

    # 报告
    report = {
        'total_plans': len(plans),
        'matched': matched,
        'enriched_fields': enriched_fields,
        'subject_mismatches': len(subject_mismatches),
    }
    report_path = os.path.join(OUTPUT_DIR, 'group_enrich_report.json')
    with open(report_path, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n完成 ✓")


if __name__ == '__main__':
    main()
