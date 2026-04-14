"""
Step 9: 政策文件处理
处理07_政策文件中的规则性数据：
  P0-1: 录取顺序 → batch_order.json
  P0-2: 地区资格名单 → eligible_regions.json
  P0-3: 历年批次线2020-2022 → 合并到batch_lines
  P1:   强基计划录取信息 → qiangji_admissions.json
  P2:   就业报告 + 课程设置 → merge到已有数据
"""
import pandas as pd
import json
import sys
import os
import math

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
POLICY_DIR = os.path.join(DATA_DIR, '07_政策文件')


def safe_str(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    return str(val).strip() or None


def safe_int(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def process_batch_order():
    """P0-1: 录取顺序"""
    print("\n--- P0-1: 2025志愿录取顺序 ---")
    df = pd.read_excel(os.path.join(POLICY_DIR, '2025志愿录取顺序.xlsx'))

    batches = []
    current_batch_group = None
    seq = 0

    for _, row in df.iterrows():
        group_name = safe_str(row.get('录取批次'))
        stage = safe_str(row.get('投档顺序'))
        category = safe_str(row.get('招生类型'))
        volunteer_setting = safe_str(row.get('志愿设置'))
        order = safe_int(row.get('序号'))

        if group_name:
            current_batch_group = group_name

        seq += 1
        # 解析志愿设置
        is_parallel = '平行' in (volunteer_setting or '')
        max_volunteers = None
        if volunteer_setting:
            import re
            nums = re.findall(r'(\d+)个平行', volunteer_setting)
            if nums:
                max_volunteers = int(nums[0])
            else:
                nums = re.findall(r'(\d+)个', volunteer_setting)
                if nums:
                    max_volunteers = int(nums[0])

        batches.append({
            'sequence': seq,
            'batchGroup': current_batch_group,
            'stage': stage,
            'category': category,
            'volunteerSetting': volunteer_setting,
            'isParallel': is_parallel,
            'maxVolunteers': max_volunteers,
        })

    out = os.path.join(OUTPUT_DIR, 'batch_order.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(batches, f, ensure_ascii=False, indent=2)
    print(f"  {len(batches)} 个批次段 → {out}")
    return batches


def process_eligible_regions():
    """P0-2: 地区资格名单"""
    print("\n--- P0-2: 地区资格名单 ---")

    region_config = {
        'public_teacher': {
            'file': '2 2024省级公费师范生范围.xlsx',
            'label': '省级公费师范生',
            'program': 'PROVINCIAL_FREE_TEACHER',
        },
        'poverty_counties': {
            'file': '3 四川省原集中连片特殊困难县和原国家级扶贫开发重点县名单.xlsx',
            'label': '集中连片特困县/国家扶贫重点县',
            'program': 'NATIONAL_SPECIAL_PLAN',
        },
        'rural_revitalization': {
            'file': '4 四川省乡村振兴实施范围县(市、区)名单.xlsx',
            'label': '乡村振兴实施范围',
            'program': 'RURAL_REVITALIZATION',
        },
        'deep_poverty': {
            'file': '5 四川省原深度贫困县名单.xlsx',
            'label': '原深度贫困县',
            'program': 'DEEP_POVERTY',
        },
        'ethnic_border': {
            'file': '6 四川省民族地区、原集中连片特殊困难地区和革命老区、艰苦边远地区名单.xlsx',
            'label': '民族地区/革命老区/艰苦边远',
            'program': 'ETHNIC_BORDER_REGION',
        },
    }

    all_regions = []
    for key, cfg in region_config.items():
        path = os.path.join(POLICY_DIR, cfg['file'])
        try:
            df = pd.read_excel(path, header=None)
            # 提取地区名和县名（跳过表头行）
            regions = []
            current_area = None
            for _, row in df.iterrows():
                col0 = safe_str(row.iloc[0]) if len(row) > 0 else None
                col1 = safe_str(row.iloc[1]) if len(row) > 1 else None

                # 跳过标题行
                if col0 and ('表' in col0 or '名单' in col0 or '地区' in col0 or '范围' in col0):
                    if col1 and ('县' in col1 or '名称' in col1):
                        continue

                if col0 and col0 not in ['地区', '表']:
                    current_area = col0

                if col1:
                    # 拆分可能用顿号/逗号分隔的多个县名
                    counties = [c.strip() for c in col1.replace('、', ',').replace('，', ',').split(',') if c.strip()]
                    for county in counties:
                        regions.append({
                            'program': cfg['program'],
                            'programLabel': cfg['label'],
                            'area': current_area,
                            'county': county,
                        })

            all_regions.extend(regions)
            print(f"  {cfg['label']}: {len(regions)} 条")
        except Exception as e:
            print(f"  {cfg['label']}: 读取失败 - {e}")

    # 部属师范分配表（结构不同，单独处理）
    print("  处理部属师范公费教育分配表...")
    try:
        df = pd.read_excel(os.path.join(POLICY_DIR,
            '1 四川省2024年部属师范大学本研衔接师范生公费教育分专业履约任教范围分配表.xlsx'), header=None)
        teacher_records = []
        for _, row in df.iterrows():
            vals = [safe_str(row.iloc[i]) if len(row) > i else None for i in range(3)]
            if vals[0] and vals[0] not in ['Unnamed', None] and '序号' not in str(vals[0]):
                teacher_records.append({
                    'program': 'NATIONAL_FREE_TEACHER',
                    'programLabel': '部属公费师范生',
                    'detail': ' | '.join(str(v) for v in vals if v),
                })
        all_regions.extend(teacher_records)
        print(f"  部属公费师范生: {len(teacher_records)} 条")
    except Exception as e:
        print(f"  部属公费师范生: 读取失败 - {e}")

    out = os.path.join(OUTPUT_DIR, 'eligible_regions.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(all_regions, f, ensure_ascii=False, indent=2)
    print(f"  总计: {len(all_regions)} 条 → {out}")

    # 按program统计
    from collections import Counter
    prog_counts = Counter(r['program'] for r in all_regions)
    for p, c in prog_counts.most_common():
        print(f"    {p}: {c}")

    return all_regions


def process_extended_batch_lines():
    """P0-3: 合并2020-2022批次线到已有数据"""
    print("\n--- P0-3: 扩展批次线 (2020-2022) ---")

    # 读已有的batch_lines (2023-2025)
    existing_path = os.path.join(OUTPUT_DIR, 'batch_lines.json')
    with open(existing_path, 'r', encoding='utf-8') as f:
        existing = json.load(f)
    print(f"  已有: {len(existing)} 条 (年份: {sorted(set(r['year'] for r in existing))})")

    # 读07扩展源
    ext_path = os.path.join(POLICY_DIR, '四川省历年批次线_2020_2025.json')
    with open(ext_path, 'r', encoding='utf-8') as f:
        ext_data = json.load(f)
    ext_records = ext_data.get('批次线列表', ext_data) if isinstance(ext_data, dict) else ext_data
    print(f"  扩展源: {len(ext_records)} 条")

    # 找出已有数据中没有的年份
    existing_keys = set((r['year'], r['batch'], r['examType']) for r in existing)
    added = 0

    for r in ext_records:
        year = int(r['年份'])
        exam_type = r['科类']
        batch = r['批次']
        score = safe_int(r['分数线'])

        if not score or score <= 0:
            continue

        key = (year, batch, exam_type)
        if key in existing_keys:
            continue

        # 确定batchType
        batch_type = '普通类'

        existing.append({
            'year': year,
            'province': '四川',
            'batch': batch,
            'examType': exam_type,
            'batchType': batch_type,
            'score': score,
        })
        existing_keys.add(key)
        added += 1

    existing.sort(key=lambda r: (r['year'], r['batch'], r['examType']))

    with open(existing_path, 'w', encoding='utf-8') as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    print(f"  新增: {added} 条")
    print(f"  合并后: {len(existing)} 条 (年份: {sorted(set(r['year'] for r in existing))})")
    return existing


def process_qiangji():
    """P1: 强基计划录取信息"""
    print("\n--- P1: 强基计划录取信息 ---")
    path = os.path.join(POLICY_DIR, '强基计划院校 在川录取信息 .xlsx')
    # 表头在第3行(index 2)，前面是合并单元格的标题
    df = pd.read_excel(path, header=None, skiprows=3)

    records = []
    current_school = None
    for _, row in df.iterrows():
        school = safe_str(row.iloc[1])
        if school:
            current_school = school

        subject = safe_str(row.iloc[2])
        major = safe_str(row.iloc[3])
        method = safe_str(row.iloc[4])

        if not major or not current_school:
            continue

        records.append({
            'school': current_school,
            'subject': subject,
            'major': major,
            'admissionMethod': method,
            'entryScore2024': safe_int(row.iloc[5]),
            'entryScore2023': safe_int(row.iloc[6]),
            'entryScore2022': safe_int(row.iloc[7]),
            'admitScore2024': safe_int(row.iloc[8]),
            'admitScore2023': safe_int(row.iloc[9]),
            'admitScore2022': safe_int(row.iloc[10]),
            'gaokaoScore2024': safe_int(row.iloc[11]),
            'gaokaoRank2024': safe_int(row.iloc[12]),
            'gaokaoScore2023': safe_int(row.iloc[13]),
            'gaokaoRank2023': safe_int(row.iloc[14]),
            'gaokaoScore2022': safe_int(row.iloc[15]),
            'gaokaoRank2022': safe_int(row.iloc[16]),
        })

    # 去掉全空记录
    records = [r for r in records if r.get('entryScore2024') or r.get('entryScore2023') or r.get('gaokaoScore2024')]

    out = os.path.join(OUTPUT_DIR, 'qiangji_admissions.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

    schools = set(r['school'] for r in records)
    print(f"  {len(records)} 条记录, {len(schools)} 所院校 → {out}")
    for s in sorted(schools)[:10]:
        cnt = sum(1 for r in records if r['school'] == s)
        print(f"    {s}: {cnt} 条")
    if len(schools) > 10:
        print(f"    ... 共 {len(schools)} 所")

    return records


def process_employment_and_curriculum():
    """P2: 就业报告 + 课程设置 → merge到已有数据"""
    print("\n--- P2: 就业报告 + 课程设置 ---")

    # 就业报告
    with open(os.path.join(POLICY_DIR, '就业质量报告数据_2024届.json'), 'r', encoding='utf-8') as f:
        emp = json.load(f)
    schools = emp.get('schools', [])

    # 读已有的universities
    uni_path = os.path.join(OUTPUT_DIR, 'universities_enriched.json')
    with open(uni_path, 'r', encoding='utf-8') as f:
        unis = json.load(f)
    uni_by_name = {u['name']: u for u in unis}

    emp_matched = 0
    for s in schools:
        uni = uni_by_name.get(s['school_name'])
        if uni:
            uni['employmentRate'] = s.get('employment_rate')
            uni['furtherStudyRate'] = s.get('total_further_study_rate')
            uni['avgSalary'] = s.get('avg_salary_monthly')
            uni['topEmployers'] = s.get('top_employers')
            emp_matched += 1
    print(f"  就业报告: {emp_matched}/{len(schools)} 匹配到院校")

    with open(uni_path, 'w', encoding='utf-8') as f:
        json.dump(unis, f, ensure_ascii=False, indent=2)

    # 课程设置
    with open(os.path.join(POLICY_DIR, '专业课程设置数据_完整版.json'), 'r', encoding='utf-8') as f:
        cur = json.load(f)
    majors_data = cur.get('majors', [])

    major_path = os.path.join(OUTPUT_DIR, 'majors_enriched.json')
    with open(major_path, 'r', encoding='utf-8') as f:
        majors = json.load(f)
    major_by_name = {m['name']: m for m in majors}

    cur_matched = 0
    for c in majors_data:
        major = major_by_name.get(c['major_name'])
        if major:
            major['coreCourses'] = c.get('core_courses')
            major['mathCourses'] = c.get('math_courses')
            major['practiceCourses'] = c.get('practice_courses')
            major['degree'] = c.get('degree')
            major['standardDuration'] = c.get('duration')
            cur_matched += 1
    print(f"  课程设置: {cur_matched}/{len(majors_data)} 匹配到专业")

    with open(major_path, 'w', encoding='utf-8') as f:
        json.dump(majors, f, ensure_ascii=False, indent=2)


def main():
    print("=" * 60)
    print("Step 9: 政策文件处理")
    print("=" * 60)

    # P0-1
    process_batch_order()

    # P0-2
    process_eligible_regions()

    # P0-3
    process_extended_batch_lines()

    # P1
    process_qiangji()

    # P2
    process_employment_and_curriculum()

    print(f"\n{'='*60}")
    print("全部完成 ✓")
    print(f"{'='*60}")


if __name__ == '__main__':
    main()
