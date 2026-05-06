import {
  TEACHER_ONLY_FIELDS,
  STUDENT_NEWLY_WRITABLE,
  FIELD_TO_PROVENANCE_GROUP,
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

  it('ALL_STUDENT_EDITABLE_FIELDS = STAGE_1 ∪ STAGE_2 ∪ STAGE_3 ∪ STUDENT_ONLY ∪ STUDENT_NEWLY_WRITABLE', () => {
    const expected = new Set([
      ...STAGE_1_REQUIRED,
      ...STAGE_2_FIELDS,
      ...STAGE_3_FIELDS,
      ...STUDENT_ONLY_FIELDS,
      ...STUDENT_NEWLY_WRITABLE,
    ]);
    expect(new Set(ALL_STUDENT_EDITABLE_FIELDS)).toEqual(expected);
  });

  it('TEACHER_ONLY_FIELDS 仅含 provincialRank（2026-05-06 下放9字段给学生）', () => {
    // provincialRank 仍由 score-segment 自动计算，谁都不手填
    expect(TEACHER_ONLY_FIELDS).toContain('provincialRank');
    // 加分/户籍/高考所在地 9 个字段已下放给学生，不再 teacher-only
    const nowStudentWritable = [
      'bonusPolicyStatus', 'bonusItems',
      'province', 'city', 'county', 'isRural',
      'examLocationProvince', 'examLocationCity', 'examLocationCounty',
    ];
    for (const f of nowStudentWritable) {
      expect(TEACHER_ONLY_FIELDS).not.toContain(f);
    }
  });

  it('分数 + 选科 字段在 STAGE_1（学生自填，不在 TEACHER_ONLY）', () => {
    const studentFillable = [
      'totalScore',
      'scoreChinese', 'scoreMath', 'scoreEnglish',
      'scoreFirstChoice', 'scoreSub1', 'scoreSub2',
      'firstChoice', 'reChoices',
    ];
    for (const f of studentFillable) {
      expect(TEACHER_ONLY_FIELDS).not.toContain(f);
    }
  });

  it('ALL_STUDENT_EDITABLE_FIELDS 去重后长度等于实际数组长度（防止下游迭代双重处理）', () => {
    expect(ALL_STUDENT_EDITABLE_FIELDS.length).toBe(
      new Set(ALL_STUDENT_EDITABLE_FIELDS).size,
    );
  });
});

describe('STUDENT_NEWLY_WRITABLE (2026-05-06 redesign)', () => {
  it('contains the 9 newly writable fields', () => {
    expect(STUDENT_NEWLY_WRITABLE).toEqual([
      'bonusPolicyStatus', 'bonusItems',
      'province', 'city', 'county', 'isRural',
      'examLocationProvince', 'examLocationCity', 'examLocationCounty',
    ]);
  });

  it('these fields are also in ALL_STUDENT_EDITABLE_FIELDS', () => {
    for (const f of STUDENT_NEWLY_WRITABLE) {
      expect(ALL_STUDENT_EDITABLE_FIELDS).toContain(f);
    }
  });
});

describe('FIELD_TO_PROVENANCE_GROUP', () => {
  it('maps every STUDENT_NEWLY_WRITABLE field to a group', () => {
    for (const f of STUDENT_NEWLY_WRITABLE) {
      expect(FIELD_TO_PROVENANCE_GROUP[f]).toMatch(/^(hukou|bonus|examLocation)$/);
    }
  });

  it('hukou group covers province/city/county/isRural', () => {
    expect(FIELD_TO_PROVENANCE_GROUP.province).toBe('hukou');
    expect(FIELD_TO_PROVENANCE_GROUP.city).toBe('hukou');
    expect(FIELD_TO_PROVENANCE_GROUP.county).toBe('hukou');
    expect(FIELD_TO_PROVENANCE_GROUP.isRural).toBe('hukou');
  });
});
