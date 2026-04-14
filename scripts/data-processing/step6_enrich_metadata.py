"""
Step 6: 用02全国基础库丰富院校/专业元数据
输入:
  - output/universities.json (Step 3 输出)
  - output/majors.json (Step 3 输出)
  - data/02_全国基础库/院校库_全国.json (3,037所)
  - data/02_全国基础库/学科评估_全国.json (5,023条)
  - data/02_全国基础库/大学排名_全国.json (1,895所)
  - data/02_全国基础库/院校满意度_全国_阳光高考.json (2,911所)
  - data/02_全国基础库/专业库详情_全国_阳光高考.json (1,884个)
  - data/02_全国基础库/招生章程结构化_全国_2025.json (2,912所)
处理: 按国标代码/名称匹配, UPDATE丰富字段
输出:
  - output/universities_enriched.json
  - output/majors_enriched.json
  - output/enrich_report.json
"""
import json
import sys
import os
import math

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')
BASE_02 = os.path.join(DATA_DIR, '02_全国基础库')


def load_json(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def safe_int(val):
    if val is None or val == '' or val == 0:
        return None
    try:
        return int(float(str(val).replace('%', '')))
    except (ValueError, TypeError):
        return None


def safe_float_str(val):
    """保研率等百分比字段，统一为数字字符串(不含%)"""
    if val is None or val == '' or val == 0:
        return None
    s = str(val).replace('%', '').strip()
    try:
        float(s)
        return s
    except ValueError:
        return None


def enrich_universities(unis):
    """用02多个数据源丰富院校数据"""
    stats = {'matched_unidb': 0, 'matched_eval': 0, 'matched_rank': 0,
             'matched_satisfaction': 0, 'matched_charter': 0}

    # 1. 院校库
    unidb = load_json(os.path.join(BASE_02, '院校库_全国.json'))
    unidb_by_code = {}
    for u in unidb:
        code = str(u.get('code', '') or u.get('collegeCode', ''))
        if code:
            unidb_by_code[code] = u
    print(f"  02院校库: {len(unidb)} 所, 索引 {len(unidb_by_code)} 个代码")

    for uni in unis:
        national_code = uni['code']
        u02 = unidb_by_code.get(national_code)
        if not u02:
            continue
        stats['matched_unidb'] += 1

        # 补全保研率(02是纯数字如"76", 03是"58.6%")
        rate02 = safe_float_str(u02.get('rateOfBaoYan'))
        if rate02 and not uni.get('postgradRate'):
            uni['postgradRate'] = rate02 + '%'

        # 补全排名(02有多套排名)
        if not uni.get('ranking'):
            rank = safe_int(u02.get('ranking'))
            if rank and rank > 0:
                uni['ranking'] = rank

        # 硕博点(02有精确数字)
        shuo = u02.get('pointsOfShuo', [])
        bo = u02.get('pointsOfBo', [])
        if shuo and isinstance(shuo, list) and len(shuo) > 0:
            total_master = sum(p.get('number', 0) for p in shuo if isinstance(p, dict))
            if total_master > 0 and not uni.get('masterProgramCount'):
                uni['masterProgramCount'] = total_master
                uni['hasMasterProgram'] = True
        if bo and isinstance(bo, list) and len(bo) > 0:
            total_doctor = sum(p.get('number', 0) for p in bo if isinstance(p, dict))
            if total_doctor > 0 and not uni.get('doctoralProgramCount'):
                uni['doctoralProgramCount'] = total_doctor
                uni['hasDoctoralProgram'] = True

        # 男女比例(新增)
        uni['maleRatio'] = safe_int(u02.get('maleRateOfStu'))
        uni['femaleRatio'] = safe_int(u02.get('femaleRateOfStu'))
        uni['createdYear'] = u02.get('createdYear')
        uni['logoUrl'] = u02.get('logoUrl')

    # 2. 学科评估
    eval_data = load_json(os.path.join(BASE_02, '学科评估_全国.json'))
    eval_records = eval_data.get('评估结果', eval_data) if isinstance(eval_data, dict) else eval_data
    # 按院校聚合，取最高等级
    grade_order = {'A+': 1, 'A': 2, 'A-': 3, 'B+': 4, 'B': 5, 'B-': 6, 'C+': 7, 'C': 8, 'C-': 9}
    best_eval = {}  # schCode → best grade
    eval_count = {}  # schCode → count of A-class
    for e in eval_records:
        code = str(e.get('schCode', ''))
        grade = e.get('grade', '')
        if code and grade:
            if code not in best_eval or grade_order.get(grade, 99) < grade_order.get(best_eval[code], 99):
                best_eval[code] = grade
            if grade.startswith('A'):
                eval_count[code] = eval_count.get(code, 0) + 1
    print(f"  02学科评估: {len(eval_records)} 条, {len(best_eval)} 所院校")

    # 评估数据也按院校名建索引(代码长度不一致: 评估5位 vs 院校6位)
    best_eval_by_name = {}
    eval_count_by_name = {}
    for e in eval_records:
        name = e.get('schName', '')
        grade = e.get('grade', '')
        if name and grade:
            if name not in best_eval_by_name or grade_order.get(grade, 99) < grade_order.get(best_eval_by_name[name], 99):
                best_eval_by_name[name] = grade
            if grade.startswith('A'):
                eval_count_by_name[name] = eval_count_by_name.get(name, 0) + 1

    for uni in unis:
        name = uni['name']
        matched = best_eval_by_name.get(name)
        if not matched:
            # 尝试截取前5位代码匹配
            code5 = uni['code'][:5]
            matched = best_eval.get(code5)
        if matched:
            if not uni.get('disciplineEvaluationLevel'):
                uni['disciplineEvaluationLevel'] = matched
            uni['aClassDisciplineCount'] = eval_count_by_name.get(name, eval_count.get(uni['code'][:5], 0))
            stats['matched_eval'] += 1

    # 3. 排名
    rank_data = load_json(os.path.join(BASE_02, '大学排名_全国.json'))
    rank_by_code = {}
    for r in rank_data:
        code = str(r.get('collegeCode', '') or r.get('code', ''))
        if code:
            rank_by_code[code] = r
    print(f"  02排名: {len(rank_data)} 所")

    for uni in unis:
        code = uni['code']
        r02 = rank_by_code.get(code)
        if not r02:
            continue
        stats['matched_rank'] += 1

        # 多排名体系
        uni['rankingSoft'] = safe_int(r02.get('rankingOfWSL')) or safe_int(r02.get('rankingOfRK'))
        uni['rankingAlumni'] = safe_int(r02.get('rankingOfXYH'))
        uni['rankingQS'] = safe_int(r02.get('rankingOfQS'))
        uni['rankingUSNews'] = safe_int(r02.get('rankingOfUSNews'))
        # 注意: ranking=0 表示无排名
        for field in ['rankingSoft', 'rankingAlumni', 'rankingQS', 'rankingUSNews']:
            if uni.get(field) == 0:
                uni[field] = None

    # 4. 满意度
    sat_data = load_json(os.path.join(BASE_02, '院校满意度_全国_阳光高考.json'))
    sat_records = sat_data.get('满意度数据', sat_data) if isinstance(sat_data, dict) else sat_data
    sat_by_name = {s['schName']: s for s in sat_records if 'schName' in s}
    print(f"  02满意度: {len(sat_records)} 所")

    for uni in unis:
        s = sat_by_name.get(uni['name'])
        if not s:
            continue
        stats['matched_satisfaction'] += 1
        uni['satisfactionOverall'] = s.get('overall')
        uni['satisfactionLife'] = s.get('life')
        uni['satisfactionEnviron'] = s.get('environ')
        uni['satisfactionCount'] = s.get('overallCount')

    # 5. 招生章程
    charter_data = load_json(os.path.join(BASE_02, '招生章程结构化_全国_2025.json'))
    charter_records = charter_data.get('data', charter_data) if isinstance(charter_data, dict) else charter_data
    charter_by_name = {c['schName']: c for c in charter_records if 'schName' in c}
    print(f"  02招生章程: {len(charter_records)} 所")

    for uni in unis:
        c = charter_by_name.get(uni['name'])
        if not c:
            continue
        stats['matched_charter'] += 1
        uni['charterFilingRatio'] = c.get('diaodangBili')
        uni['charterMajorAllocation'] = c.get('zhuanyeFenpei')
        uni['charterTiebreaker'] = c.get('tongfenGuize')
        uni['charterLanguageReq'] = c.get('waiyu')
        uni['charterPhysicalReq'] = c.get('tijianXianzhi')
        uni['charterBonusPolicy'] = c.get('jiafen')
        uni['charterAdjustment'] = c.get('chengnuo')

    return stats


def enrich_majors(majors):
    """用02专业库详情丰富专业数据"""
    detail_data = load_json(os.path.join(BASE_02, '专业库详情_全国_阳光高考.json'))
    detail_records = detail_data.get('专业列表', detail_data) if isinstance(detail_data, dict) else detail_data
    # 按专业名称建索引
    detail_by_name = {}
    for d in detail_records:
        name = d.get('专业名称', '')
        if name and name not in detail_by_name:
            detail_by_name[name] = d
    print(f"  02专业详情: {len(detail_records)} 个, 索引 {len(detail_by_name)} 个名称")

    matched = 0
    for major in majors:
        d = detail_by_name.get(major['name'])
        if not d:
            continue
        matched += 1
        major['maleRatio'] = d.get('男生比例')
        major['femaleRatio'] = d.get('女生比例')
        major['studentScale'] = d.get('学生规模')
        major['description'] = d.get('专业简介')
        major['careerDirections'] = d.get('就业方向')
        major['postgraduateDirections'] = d.get('考研方向')
        # 满意度
        sat_list = d.get('满意度')
        if sat_list and isinstance(sat_list, list):
            for s in sat_list:
                if isinstance(s, dict):
                    t = s.get('类型', '')
                    if '综合' in t:
                        major['satisfactionScore'] = s.get('评分')

    return matched


def main():
    print("=" * 60)
    print("Step 6: 02全国基础库元数据丰富")
    print("=" * 60)

    # 加载
    with open(os.path.join(OUTPUT_DIR, 'universities.json'), 'r', encoding='utf-8') as f:
        unis = json.load(f)
    with open(os.path.join(OUTPUT_DIR, 'majors.json'), 'r', encoding='utf-8') as f:
        majors = json.load(f)
    print(f"院校: {len(unis)}, 专业: {len(majors)}")

    # 丰富院校
    print(f"\n--- 丰富院校 ---")
    uni_stats = enrich_universities(unis)
    print(f"\n  匹配统计:")
    for k, v in uni_stats.items():
        print(f"    {k}: {v} ({v/len(unis)*100:.1f}%)")

    # 丰富专业
    print(f"\n--- 丰富专业 ---")
    major_matched = enrich_majors(majors)
    print(f"  匹配: {major_matched} / {len(majors)} ({major_matched/len(majors)*100:.1f}%)")

    # 输出
    out_uni = os.path.join(OUTPUT_DIR, 'universities_enriched.json')
    with open(out_uni, 'w', encoding='utf-8') as f:
        json.dump(unis, f, ensure_ascii=False, indent=2)

    out_major = os.path.join(OUTPUT_DIR, 'majors_enriched.json')
    with open(out_major, 'w', encoding='utf-8') as f:
        json.dump(majors, f, ensure_ascii=False, indent=2)

    print(f"\n输出:")
    print(f"  {out_uni}")
    print(f"  {out_major}")

    # 报告
    report = {'university_stats': uni_stats, 'major_matched': major_matched}
    with open(os.path.join(OUTPUT_DIR, 'enrich_report.json'), 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print(f"\n完成 ✓")


if __name__ == '__main__':
    main()
