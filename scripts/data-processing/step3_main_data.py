"""
Step 3: 03主表处理（基于列名，非列号）
输入: data/03_专家版主表/2026四川高考志愿_清洗后.xlsx (48,132行×87列)
输出: output/universities.json, output/majors.json, output/enrollment_plans.json, output/admission_records.json
      output/main_import.sql

按列名读取，避免列号偏移问题。
"""
import pandas as pd
import json
import sys
import os
import math

sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'data')
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), 'output')

# ==================== 列名→语义映射 ====================
# 用中文列名直接映射，不依赖列号
COL_MAP = {
    # 院校
    'uni_name': '院校',
    'uni_code': '院校代码',
    'group_code': '专业组代码',
    'uni_group': '院校专业组',
    'uni_notes': '院校备注',
    # 专业
    'major_name': '专业',
    'major_code': '专业代码',
    'major_class': '专业类',
    'major_category': '门类',
    'major_notes': '专业备注',
    # 招生
    'subject': '科目',
    'subject_req': '选科要求',
    'type': '类型',
    'batch': '批次',
    'old_batch': '老批次',
    'is_new': '是否新增',
    'group_plan_count': '25专业组计划',
    'plan_count': '计划人数',
    'duration': '学制',
    'tuition': '学费',
    'group_majors': '组内专业',
    # 2025投档
    'filing25_min_score': '25投档最低分',
    'filing25_min_rank': '25投档最低位次',
    # 2025专业组
    'group25_adm_count': '25专业组录取人数',
    'group25_min_score': '25专业组最低分',
    'group25_min_rank': '25专业组最低位次',
    # 2025专业
    'adm25_count': '25录取人数',
    'major25_min_score': '25最低分',
    'major25_min_rank': '25最低位次',
    'major25_avg_score': '25平均分',
    'major25_avg_rank': '25平均位次',
    'major25_max_score': '25最高分',
    'major25_max_rank': '25最高位次',
    # 2024专业组
    'group24_min_score': '24专业组最低分',
    'group24_min_rank': '24专业组最低分位次',
    'group24_adm_count': '24专业组录取人数',
    # 2024专业
    'adm24_count': '24录取人数',
    'major24_min_score': '24最低分',
    'major24_min_rank': '24最低分位次',
    'major24_avg_score': '24平均分',
    'major24_avg_rank': '24平均位',
    'major24_max_score': '24最高分',
    'major24_max_rank': '24最高位',
    # 2023专业
    'adm23_count': '23录取人数',
    'major23_min_score': '23最低分',
    'major23_min_rank': '23最低分位次',
    'major23_avg_score': '23平均分',
    'major23_avg_rank': '23平均位',
    'major23_max_score': '23最高分',
    'major23_max_rank': '23最高位',
    # 2022专业
    'adm22_count': '22录取人数',
    'major22_min_score': '22最低分',
    'major22_min_rank': '22最低分位次',
    'major22_avg_score': '22平均分',
    'major22_avg_rank': '22平均分位次',
    'major22_max_score': '22最高分',
    'major22_max_rank': '22最高分位次',
    # 院校属性
    'uni_province': '院校省份',
    'uni_city': '院校城市',
    'city_level': '城市等级',
    'uni_type': '院校类型',
    'uni_nature': '办学性质',
    'uni_department': '隶属部门',
    'uni_tags': '院校标签',
    'uni_level': '院校层级',
    'uni_rank': '院校排名',
    'admission_guide': '招生简章',
    'rename_history': '更名合并情况',
    'transfer_diff': '转专业情况',
    'postgrad_rate': '保研率',
    'is_double_first': '是否双一流',
    'discipline_eval': '学科评估等级',
    'soft_rating': '软科评级',
    'soft_ranking': '软科排名',
    'discipline_eval2': '学科评估',
    'major_level': '专业水平',
    'is_national_feature': '是否国家特色',
    'major_rank': '专业排名',
    'major_honor': '专业荣誉',
    'local_master': '本校硕士',
    'local_doctor': '本校博士',
    'master_count': '硕士点数量',
    'master_programs': '硕士点专业',
    'doctoral_count': '博士点数量',
    'doctoral_programs': '博士点专业',
    'local_major_master': '本专业硕士点',
    'local_major_doctor': '本专业博士点',
}


def safe_int(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return None


def safe_str(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    s = str(val).strip()
    return s if s else None


def safe_float(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def parse_tags(tag_str):
    if not tag_str:
        return []
    return [t.strip() for t in str(tag_str).split('/') if t.strip()]


def get(row, key):
    """按语义key从DataFrame行获取值"""
    col_name = COL_MAP.get(key)
    if col_name and col_name in row.index:
        return row[col_name]
    return None


def load_code_mapping():
    """加载招生代码→国标代码映射"""
    path = os.path.join(DATA_DIR, '08_数据治理记录', '编码映射表_招生代码_国标代码.csv')
    df = pd.read_csv(path)
    mapping = {}
    for _, row in df.iterrows():
        enroll = int(row['招生代码'])
        national = row['国标代码']
        if pd.notna(national):
            mapping[enroll] = str(int(national))
    return mapping


def extract_universities(df, code_mapping):
    """提取去重的院校数据"""
    unis = {}
    for _, row in df.iterrows():
        enroll_code = safe_int(get(row, 'uni_code'))
        if enroll_code is None:
            continue
        code_str = str(enroll_code)
        if code_str in unis:
            continue

        # 转换为国标代码
        national_code = code_mapping.get(enroll_code, code_str)
        tags = parse_tags(safe_str(get(row, 'uni_tags')))

        unis[code_str] = {
            'enrollCode': enroll_code,
            'code': national_code,
            'name': safe_str(get(row, 'uni_name')),
            'province': safe_str(get(row, 'uni_province')),
            'city': safe_str(get(row, 'uni_city')),
            'type': safe_str(get(row, 'uni_type')),
            'level': safe_str(get(row, 'uni_level')),
            'runningNature': safe_str(get(row, 'uni_nature')),
            'isDoubleFirstClass': '双一流' in tags or safe_str(get(row, 'is_double_first')) == '是',
            'is985': '985' in tags,
            'is211': '211' in tags,
            'tags': tags if tags else None,
            'grade': safe_str(get(row, 'city_level')),
            'department': safe_str(get(row, 'uni_department')),
            'ranking': safe_int(get(row, 'uni_rank')),
            'admissionGuide': safe_str(get(row, 'admission_guide')),
            'renameHistory': safe_str(get(row, 'rename_history')),
            'transferDifficulty': safe_str(get(row, 'transfer_diff')),
            'postgradRate': safe_str(get(row, 'postgrad_rate')),
            'disciplineEvaluationLevel': safe_str(get(row, 'discipline_eval')),
            'softRating': safe_str(get(row, 'soft_rating')),
            'softRanking': safe_int(get(row, 'soft_ranking')),
            'masterProgramCount': safe_int(get(row, 'master_count')),
            'doctoralProgramCount': safe_int(get(row, 'doctoral_count')),
            'hasMasterProgram': safe_int(get(row, 'master_count')) is not None and safe_int(get(row, 'master_count')) > 0,
            'hasDoctoralProgram': safe_int(get(row, 'doctoral_count')) is not None and safe_int(get(row, 'doctoral_count')) > 0,
            'masterPrograms': safe_str(get(row, 'master_programs')),
            'doctoralPrograms': safe_str(get(row, 'doctoral_programs')),
        }
    return unis


def extract_majors(df):
    """提取去重的专业数据"""
    majors = {}
    for _, row in df.iterrows():
        name = safe_str(get(row, 'major_name'))
        if not name or name in majors:
            continue
        majors[name] = {
            'name': name,
            'code': safe_str(get(row, 'major_code')),
            'category': safe_str(get(row, 'major_category')),
            'level': safe_str(get(row, 'uni_level')),
            'discipline': safe_str(get(row, 'major_class')),
            'type': safe_str(get(row, 'type')),
            'notes': safe_str(get(row, 'major_notes')),
            'majorLevel': safe_str(get(row, 'major_level')),
            'softRating': safe_str(get(row, 'soft_rating')),
        }
    return majors


def extract_enrollment_plans(df):
    """提取招生计划（2026年）"""
    plans = []
    for _, row in df.iterrows():
        uni_code = safe_str(get(row, 'uni_code'))
        major_name = safe_str(get(row, 'major_name'))
        if not uni_code or not major_name:
            continue

        plans.append({
            'universityEnrollCode': uni_code,
            'majorName': major_name,
            'year': 2026,
            'province': '四川',
            'planCount': safe_int(get(row, 'plan_count')),
            'batch': safe_str(get(row, 'batch')),
            'level': safe_str(get(row, 'uni_level')),
            'subjects': safe_str(get(row, 'subject')),
            'subjectRequirements': safe_str(get(row, 'subject_req')),
            'duration': safe_str(get(row, 'duration')),
            'tuition': safe_int(get(row, 'tuition')),
            'groupCode': safe_str(get(row, 'group_code')),
            'groupName': safe_str(get(row, 'uni_group')),
            'groupMajors': safe_str(get(row, 'group_majors')),
            'groupPlanCount': safe_int(get(row, 'group_plan_count')),
            'isNew': safe_str(get(row, 'is_new')) == '是',
            'oldBatch': safe_str(get(row, 'old_batch')),
            'disciplineEval': safe_str(get(row, 'discipline_eval2')),
            'isNationalFeature': safe_str(get(row, 'is_national_feature')),
            'majorRanking': safe_str(get(row, 'major_rank')),
            'majorHonor': safe_str(get(row, 'major_honor')),
            'localMasterPoint': bool(safe_str(get(row, 'local_major_master'))),
            'localDoctoralPoint': bool(safe_str(get(row, 'local_major_doctor'))),
            'planNotes': safe_str(get(row, 'uni_notes')),
        })
    return plans


def extract_admission_records(df):
    """提取录取记录（2025/2024/2023/2022）"""
    records = []
    for _, row in df.iterrows():
        uni_code = safe_str(get(row, 'uni_code'))
        major_name = safe_str(get(row, 'major_name'))
        if not uni_code or not major_name:
            continue

        base = {
            'universityEnrollCode': uni_code,
            'majorName': major_name,
            'province': '四川',
        }

        # 2025
        min25 = safe_int(get(row, 'major25_min_score'))
        rank25 = safe_int(get(row, 'major25_min_rank'))
        group25_score = safe_int(get(row, 'group25_min_score'))
        group25_rank = safe_int(get(row, 'group25_min_rank'))
        if min25 or rank25 or group25_score:
            records.append({
                **base, 'year': 2025,
                'majorMinScore': min25,
                'majorMinRank': rank25,
                'majorAvgScore': safe_int(get(row, 'major25_avg_score')),
                'majorAvgRank': safe_int(get(row, 'major25_avg_rank')),
                'majorMaxScore': safe_int(get(row, 'major25_max_score')),
                'majorMaxRank': safe_int(get(row, 'major25_max_rank')),
                'majorAdmissionCount': safe_int(get(row, 'adm25_count')),
                'groupMinScore': group25_score,
                'groupMinRank': group25_rank,
                'groupAdmissionCount': safe_int(get(row, 'group25_adm_count')),
                'filingMinScore': safe_int(get(row, 'filing25_min_score')),
                'filingMinRank': safe_int(get(row, 'filing25_min_rank')),
            })

        # 2024
        min24 = safe_int(get(row, 'major24_min_score'))
        rank24 = safe_int(get(row, 'major24_min_rank'))
        if min24 or rank24:
            records.append({
                **base, 'year': 2024,
                'majorMinScore': min24,
                'majorMinRank': rank24,
                'majorAvgScore': safe_int(get(row, 'major24_avg_score')),
                'majorAvgRank': safe_int(get(row, 'major24_avg_rank')),
                'majorMaxScore': safe_int(get(row, 'major24_max_score')),
                'majorMaxRank': safe_int(get(row, 'major24_max_rank')),
                'majorAdmissionCount': safe_int(get(row, 'adm24_count')),
                'groupMinScore': safe_int(get(row, 'group24_min_score')),
                'groupMinRank': safe_int(get(row, 'group24_min_rank')),
                'groupAdmissionCount': safe_int(get(row, 'group24_adm_count')),
            })

        # 2023
        min23 = safe_int(get(row, 'major23_min_score'))
        rank23 = safe_int(get(row, 'major23_min_rank'))
        if min23 or rank23:
            records.append({
                **base, 'year': 2023,
                'majorMinScore': min23,
                'majorMinRank': rank23,
                'majorAvgScore': safe_int(get(row, 'major23_avg_score')),
                'majorAvgRank': safe_int(get(row, 'major23_avg_rank')),
                'majorMaxScore': safe_int(get(row, 'major23_max_score')),
                'majorMaxRank': safe_int(get(row, 'major23_max_rank')),
                'majorAdmissionCount': safe_int(get(row, 'adm23_count')),
            })

        # 2022
        min22 = safe_int(get(row, 'major22_min_score'))
        rank22 = safe_int(get(row, 'major22_min_rank'))
        if min22 or rank22:
            records.append({
                **base, 'year': 2022,
                'majorMinScore': min22,
                'majorMinRank': rank22,
                'majorAvgScore': safe_int(get(row, 'major22_avg_score')),
                'majorAvgRank': safe_int(get(row, 'major22_avg_rank')),
                'majorMaxScore': safe_int(get(row, 'major22_max_score')),
                'majorMaxRank': safe_int(get(row, 'major22_max_rank')),
                'majorAdmissionCount': safe_int(get(row, 'adm22_count')),
            })

    return records


def save_json(data, filename):
    path = os.path.join(OUTPUT_DIR, filename)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    return path


def main():
    print("=" * 60)
    print("Step 3: 03主表处理（基于列名）")
    print("=" * 60)

    # 0. 加载编码映射
    code_map = load_code_mapping()
    print(f"编码映射: {len(code_map)} 条")

    # 1. 读Excel
    excel_path = os.path.join(DATA_DIR, '03_专家版主表', '2026四川高考志愿_清洗后.xlsx')
    print(f"读取: {excel_path}")
    df = pd.read_excel(excel_path)
    print(f"行数: {len(df)}, 列数: {len(df.columns)}")

    # 验证列名
    missing_cols = []
    for key, col_name in COL_MAP.items():
        if col_name not in df.columns:
            missing_cols.append(f"  {key} → {col_name}")
    if missing_cols:
        print(f"\n⚠ 缺失列 ({len(missing_cols)}):")
        for m in missing_cols:
            print(m)
    else:
        print(f"列名验证: 全部 {len(COL_MAP)} 个映射匹配 ✓")

    # 2. 提取院校
    print(f"\n--- 提取院校 ---")
    unis = extract_universities(df, code_map)
    print(f"  唯一院校: {len(unis)}")
    # 检查国标代码覆盖率
    has_national = sum(1 for u in unis.values() if u['code'] != str(u['enrollCode']))
    print(f"  有国标代码: {has_national} ({has_national/len(unis)*100:.1f}%)")

    # 3. 提取专业
    print(f"\n--- 提取专业 ---")
    majors = extract_majors(df)
    print(f"  唯一专业: {len(majors)}")

    # 4. 提取招生计划
    print(f"\n--- 提取招生计划 (2026) ---")
    plans = extract_enrollment_plans(df)
    print(f"  计划记录: {len(plans)}")

    # 5. 提取录取记录
    print(f"\n--- 提取录取记录 ---")
    adm = extract_admission_records(df)
    print(f"  总录取记录: {len(adm)}")

    # 按年统计
    year_counts = {}
    for r in adm:
        y = r['year']
        year_counts[y] = year_counts.get(y, 0) + 1
    for y in sorted(year_counts):
        print(f"    {y}: {year_counts[y]} 条")

    # 6. 输出
    print(f"\n--- 输出文件 ---")
    p1 = save_json(list(unis.values()), 'universities.json')
    print(f"  {p1} ({len(unis)} 所)")

    p2 = save_json(list(majors.values()), 'majors.json')
    print(f"  {p2} ({len(majors)} 个)")

    p3 = save_json(plans, 'enrollment_plans.json')
    print(f"  {p3} ({len(plans)} 条)")

    p4 = save_json(adm, 'admission_records.json')
    print(f"  {p4} ({len(adm)} 条)")

    print(f"\n完成 ✓")


if __name__ == '__main__':
    main()
