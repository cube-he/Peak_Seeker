import {
  TEACHER_ONLY_FIELDS,
  STUDENT_ONLY_FIELDS,
  STAGE_1_REQUIRED,
  STAGE_2_FIELDS,
  STAGE_3_FIELDS,
  ALL_STUDENT_EDITABLE_FIELDS,
} from './field-policy';

describe('field-policy', () => {
  it('TEACHER_ONLY_FIELDS 与 STUDENT_ONLY_FIELDS disjoint', () => {
    const teacherSet = new Set(TEACHER_ONLY_FIELDS);
    for (const f of STUDENT_ONLY_FIELDS) {
      expect(teacherSet.has(f as any)).toBe(false);
    }
  });

  it('STAGE_1/2/3 之间互斥（学生端字段无重复归属）', () => {
    const seen = new Set<string>();
    for (const f of [...STAGE_1_REQUIRED, ...STAGE_2_FIELDS, ...STAGE_3_FIELDS]) {
      expect(seen.has(f)).toBe(false);
      seen.add(f);
    }
  });

  it('阶段字段不与 TEACHER_ONLY_FIELDS 重叠', () => {
    const teacherSet = new Set(TEACHER_ONLY_FIELDS);
    for (const f of [...STAGE_1_REQUIRED, ...STAGE_2_FIELDS, ...STAGE_3_FIELDS]) {
      expect(teacherSet.has(f as any)).toBe(false);
    }
  });

  it('ALL_STUDENT_EDITABLE_FIELDS = STAGE_1 ∪ STAGE_2 ∪ STAGE_3 ∪ STUDENT_ONLY', () => {
    const expected = new Set([
      ...STAGE_1_REQUIRED,
      ...STAGE_2_FIELDS,
      ...STAGE_3_FIELDS,
      ...STUDENT_ONLY_FIELDS,
    ]);
    expect(new Set(ALL_STUDENT_EDITABLE_FIELDS)).toEqual(expected);
  });

  it('TEACHER_ONLY_FIELDS 包含考试分数+位次+加分+户籍+高考所在地', () => {
    const required = [
      'totalScore', 'provincialRank',
      'scoreChinese', 'scoreMath', 'scoreEnglish',
      'scoreFirstChoice', 'scoreSub1', 'scoreSub2',
      'bonusPolicyStatus', 'bonusItems',
      'province', 'city', 'county', 'isRural',
      'examLocationProvince', 'examLocationCity', 'examLocationCounty',
    ];
    for (const f of required) {
      expect(TEACHER_ONLY_FIELDS).toContain(f);
    }
  });

  it('ALL_STUDENT_EDITABLE_FIELDS 去重后长度等于实际数组长度（防止下游迭代双重处理）', () => {
    expect(ALL_STUDENT_EDITABLE_FIELDS.length).toBe(
      new Set(ALL_STUDENT_EDITABLE_FIELDS).size,
    );
  });
});
