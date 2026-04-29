"""Tests for xlsx_to_json.py converter functions."""

import sys
from pathlib import Path

# Allow importing from the same directory
sys.path.insert(0, str(Path(__file__).resolve().parent))

from xlsx_to_json import (
    convert_university_row,
    convert_majors_from_main_table,
    convert_enrollment_plans_from_row,
    convert_admission_records_from_row,
)


def _make_uni_row(overrides=None):
    """Build a 90-element tuple for university row with sensible defaults."""
    row = [None] * 90
    defaults = {
        0: '0001',          # 院校代码
        1: '北京大学',       # 院校名称
        2: '北京',           # 院校省份
        3: '海淀区',         # 院校城市
        4: '一线城市',       # 城市等级
        5: '综合',           # 院校类型
        6: '公办',           # 办学性质
        7: '教育部',         # 隶属部门
        8: '985/211/双一流', # 院校档次
        11: '本科',          # 院校层级
        12: '是',            # 是否双一流
        14: '2',             # 院校排名
        15: 79,              # 硕士点数量
        16: 60,              # 博士点数量
        17: '材料科学与工程；化学',  # 硕士点专业
        18: '化学；物理学',          # 博士点专业
        21: '58.6%',         # 保研率
        23: 'https://example.com',  # 招生简章
        24: '2000年合并',    # 更名合并情况
        25: 'A+',            # 学科评估等级
        41: '1898',          # 建校年份
        42: 64,              # 男生比例
        43: 36,              # 女生比例
        44: 1,               # QS排名
        45: 2,               # USNews排名
        46: 1,               # 校友会排名
        49: '10001',         # 国标代码
        53: 'https://logo.png',  # Logo地址
        60: 2,               # 软科排名
        64: 35,              # A类学科数
        69: 4.6,             # 综合满意度
        70: 1890,            # 综合评价人数
        76: 4.3,             # 生活满意度
        83: 4.5,             # 环境满意度
    }
    for k, v in defaults.items():
        row[k] = v
    if overrides:
        for k, v in overrides.items():
            row[k] = v
    return tuple(row)


def _make_main_row(overrides=None):
    """Build a 71-element tuple for 专业招生主表 row."""
    row = [None] * 71
    defaults = {
        0: 2025,             # 数据年份
        1: 1,                # 院校代码
        2: '北京大学',        # 院校名称
        3: 101,              # 专业组代码
        4: '41',             # 专业代码
        5: '本科批(高校专项)',  # 录取批次
        6: '物理',            # 科目
        7: '本科一批',        # 老批次
        9: '高校专项计划',    # 招生类型
        12: '环境科学',       # 专业
        14: '环境科学与工程类',  # 专业类
        15: '工学',           # 门类
        16: '(高校专项)',     # 专业备注
        17: '院校备注文本',   # 院校备注
        19: '化学',           # 选科要求
        20: 2,               # 25专业组计划
        21: 1,               # 计划人数
        22: 4,               # 学制
        23: '5000',          # 学费
        62: 'A+',            # 软科评级
        64: 'A',             # 学科评估
        65: 'A+',            # 专业水平
        67: 1,               # 专业排名
        69: '环境科学与工程',  # 本专业硕士点
        70: '环境科学与工程',  # 本专业博士点
    }
    for k, v in defaults.items():
        row[k] = v
    if overrides:
        for k, v in overrides.items():
            row[k] = v
    return tuple(row)


# ===========================================================================
# Test: convert_university_row
# ===========================================================================

class TestConvertUniversityRow:
    def test_basic_fields(self):
        row = _make_uni_row()
        result = convert_university_row(row)

        assert result['name'] == '北京大学'
        assert result['province'] == '北京'
        assert result['city'] == '海淀区'
        assert result['type'] == '综合'
        assert result['runningNature'] == '公办'
        assert result['department'] == '教育部'
        assert result['level'] == '本科'
        assert result['code'] == '10001'

    def test_tags_split(self):
        row = _make_uni_row({8: '985/211/双一流/国重点/保研资格'})
        result = convert_university_row(row)

        assert result['tags'] == ['985', '211', '双一流', '国重点', '保研资格']
        assert result['is985'] is True
        assert result['is211'] is True

    def test_tags_no_985(self):
        row = _make_uni_row({8: '双一流/省重点'})
        result = convert_university_row(row)

        assert result['is985'] is False
        assert result['is211'] is False
        assert result['tags'] == ['双一流', '省重点']

    def test_empty_tags(self):
        row = _make_uni_row({8: None})
        result = convert_university_row(row)

        assert result['tags'] == []
        assert result['is985'] is False
        assert result['is211'] is False

    def test_double_first_class(self):
        row = _make_uni_row({12: '是'})
        result = convert_university_row(row)
        assert result['isDoubleFirstClass'] is True

        row2 = _make_uni_row({12: '否'})
        result2 = convert_university_row(row2)
        assert result2['isDoubleFirstClass'] is False

    def test_master_doctoral(self):
        row = _make_uni_row({15: 79, 16: 60})
        result = convert_university_row(row)

        assert result['masterProgramCount'] == 79
        assert result['doctoralProgramCount'] == 60
        assert result['hasMasterProgram'] is True
        assert result['hasDoctoralProgram'] is True

    def test_no_master_doctoral(self):
        row = _make_uni_row({15: 0, 16: None})
        result = convert_university_row(row)

        assert result['masterProgramCount'] == 0
        assert result['doctoralProgramCount'] is None
        assert result['hasMasterProgram'] is False
        assert result['hasDoctoralProgram'] is False

    def test_rankings(self):
        row = _make_uni_row({44: 1, 45: 2, 46: 1, 60: 2})
        result = convert_university_row(row)

        assert result['rankingQS'] == 1
        assert result['rankingUSNews'] == 2
        assert result['rankingAlumni'] == 1
        assert result['softRanking'] == 2
        assert result['rankingSoft'] == 2

    def test_satisfaction(self):
        row = _make_uni_row({69: 4.6, 76: 4.3, 83: 4.5, 70: 1890})
        result = convert_university_row(row)

        assert result['satisfactionOverall'] == 4.6
        assert result['satisfactionLife'] == 4.3
        assert result['satisfactionEnviron'] == 4.5
        assert result['satisfactionCount'] == 1890


# ===========================================================================
# Test: convert_majors_from_main_table
# ===========================================================================

class TestConvertMajors:
    def test_basic(self):
        row = _make_main_row()
        majors = convert_majors_from_main_table([row])

        assert len(majors) == 1
        m = majors[0]
        assert m['name'] == '环境科学'
        assert m['code'] == '41'
        assert m['category'] == '工学'
        assert m['level'] == '本科'
        assert m['discipline'] == '环境科学与工程类'
        assert m['notes'] == '(高校专项)'
        assert m['softRating'] == 'A+'

    def test_deduplication(self):
        row1 = _make_main_row({12: '环境科学', 62: 'A+'})
        row2 = _make_main_row({12: '环境科学', 62: 'B+'})  # dupe
        row3 = _make_main_row({12: '计算机科学', 4: '80', 15: '工学'})

        majors = convert_majors_from_main_table([row1, row2, row3])

        assert len(majors) == 2
        names = [m['name'] for m in majors]
        assert '环境科学' in names
        assert '计算机科学' in names

    def test_skip_empty_name(self):
        row = _make_main_row({12: None})
        majors = convert_majors_from_main_table([row])
        assert len(majors) == 0


# ===========================================================================
# Test: convert_enrollment_plans_from_row
# ===========================================================================

class TestConvertEnrollmentPlans:
    def test_all_three_years(self):
        row = _make_main_row({21: 1, 39: 2, 47: 3})
        plans = convert_enrollment_plans_from_row(row)

        assert len(plans) == 3
        years = [p['year'] for p in plans]
        assert years == [2025, 2024, 2023]

        # 2025 has extra fields
        p25 = plans[0]
        assert p25['planCount'] == 1
        assert p25['groupPlanCount'] == 2  # col 20
        assert p25['tuition'] == 5000
        assert p25['duration'] == '4'

        # 2024
        p24 = plans[1]
        assert p24['planCount'] == 2
        assert p24['groupPlanCount'] is None
        assert p24['tuition'] is None

        # 2023
        p23 = plans[2]
        assert p23['planCount'] == 3

    def test_shared_fields(self):
        row = _make_main_row({21: 1})
        plans = convert_enrollment_plans_from_row(row)
        p = plans[0]

        assert p['universityEnrollCode'] == '1'
        assert p['majorName'] == '环境科学'
        assert p['majorCode'] == '41'
        assert p['groupCode'] == '101'
        assert p['subjects'] == '物理'
        assert p['batch'] == '本科批(高校专项)'
        assert p['recruitType'] == '高校专项计划'
        assert p['province'] == '四川'
        assert p['subjectRequirements'] == '化学'
        assert p['softRating'] == 'A+'

    def test_skip_null_plan(self):
        row = _make_main_row({21: None, 39: 5, 47: None})
        plans = convert_enrollment_plans_from_row(row)

        assert len(plans) == 1
        assert plans[0]['year'] == 2024
        assert plans[0]['planCount'] == 5

    def test_all_null_returns_empty(self):
        row = _make_main_row({21: None, 39: None, 47: None})
        plans = convert_enrollment_plans_from_row(row)
        assert len(plans) == 0


# ===========================================================================
# Test: convert_admission_records_from_row
# ===========================================================================

class TestConvertAdmissionRecords:
    def test_all_four_years(self):
        row = _make_main_row({
            24: 690, 25: 80,                        # 2025 filing
            29: 1, 30: 685, 31: 100,                # 2025 major
            41: 670, 42: 200, 40: 2,                 # 2024 major
            49: 660, 50: 300, 48: 3,                 # 2023 major
            56: 650, 57: 400, 55: 4,                 # 2022 major
        })
        records = convert_admission_records_from_row(row)

        assert len(records) == 4
        years = [r['year'] for r in records]
        assert years == [2025, 2024, 2023, 2022]

    def test_2025_fields(self):
        row = _make_main_row({
            24: 690, 25: 80,
            26: 25, 27: 690, 28: 80,
            29: 1, 30: 685, 31: 100,
            32: 688, 33: 90, 34: 695, 35: 50,
        })
        records = convert_admission_records_from_row(row)
        r = records[0]

        assert r['year'] == 2025
        assert r['filingMinScore'] == 690
        assert r['filingMinRank'] == 80
        assert r['groupAdmissionCount'] == 25
        assert r['groupMinScore'] == 690
        assert r['groupMinRank'] == 80
        assert r['majorAdmissionCount'] == 1
        assert r['majorMinScore'] == 685
        assert r['majorMinRank'] == 100
        assert r['majorAvgScore'] == 688
        assert r['majorAvgRank'] == 90
        assert r['majorMaxScore'] == 695
        assert r['majorMaxRank'] == 50

    def test_2024_fields(self):
        row = _make_main_row({
            36: 670, 37: 200, 38: 20,
            40: 2, 41: 665, 42: 250,
            43: 668, 44: 220, 45: 675, 46: 150,
        })
        records = convert_admission_records_from_row(row)
        r = records[0]

        assert r['year'] == 2024
        assert r['groupMinScore'] == 670
        assert r['groupMinRank'] == 200
        assert r['groupAdmissionCount'] == 20
        assert r['majorAdmissionCount'] == 2
        assert r['majorMinScore'] == 665
        assert r['majorMinRank'] == 250

    def test_skip_all_null_year(self):
        # Only 2023 has data
        row = _make_main_row({49: 660, 50: 300})
        records = convert_admission_records_from_row(row)

        assert len(records) == 1
        assert records[0]['year'] == 2023

    def test_all_null_returns_empty(self):
        row = _make_main_row()  # No score data set
        records = convert_admission_records_from_row(row)
        assert len(records) == 0

    def test_shared_natural_key_fields(self):
        row = _make_main_row({56: 650, 57: 400})
        records = convert_admission_records_from_row(row)
        r = records[0]

        assert r['universityEnrollCode'] == '1'
        assert r['majorName'] == '环境科学'
        assert r['majorCode'] == '41'
        assert r['groupCode'] == '101'
        assert r['subjects'] == '物理'
        assert r['batch'] == '本科批(高校专项)'
        assert r['recruitType'] == '高校专项计划'
        assert r['province'] == '四川'


# ===========================================================================
# Run tests
# ===========================================================================

def run_tests():
    """Simple test runner that doesn't require pytest."""
    import traceback

    classes = [
        TestConvertUniversityRow,
        TestConvertMajors,
        TestConvertEnrollmentPlans,
        TestConvertAdmissionRecords,
    ]

    total = 0
    passed = 0
    failed = 0
    errors = []

    for cls in classes:
        instance = cls()
        methods = [m for m in dir(instance) if m.startswith('test_')]
        for method_name in methods:
            total += 1
            try:
                getattr(instance, method_name)()
                passed += 1
                print(f'  PASS {cls.__name__}.{method_name}')
            except Exception as e:
                failed += 1
                errors.append((cls.__name__, method_name, traceback.format_exc()))
                print(f'  FAIL {cls.__name__}.{method_name}: {e}')

    print(f'\n{passed}/{total} passed, {failed} failed')
    if errors:
        print('\nFailure details:')
        for cls_name, method, tb in errors:
            print(f'\n--- {cls_name}.{method} ---')
            print(tb)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(run_tests())
