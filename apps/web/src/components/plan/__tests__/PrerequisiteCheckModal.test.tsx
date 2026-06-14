import { checkPrerequisites, hasRankedPreferredMajors } from '../PrerequisiteCheckModal';

describe('hasRankedPreferredMajors', () => {
  it('只在意向池(tier=0) → 未排梯队', () => {
    expect(hasRankedPreferredMajors([{ tier: 0, majors: ['计算机'] }])).toBe(false);
  });
  it('梯队(tier>=1)里有专业 → 已排梯队', () => {
    expect(hasRankedPreferredMajors([{ tier: 1, majors: ['计算机'] }])).toBe(true);
  });
  it('池子+梯队都有 → 已排梯队', () => {
    expect(
      hasRankedPreferredMajors([{ tier: 0, majors: ['A'] }, { tier: 1, majors: ['B'] }]),
    ).toBe(true);
  });
  it('梯队存在但为空 → 未排梯队', () => {
    expect(hasRankedPreferredMajors([{ tier: 1, majors: [] }])).toBe(false);
  });
  it('旧扁平 string[] → 未排梯队(视为待排)', () => {
    expect(hasRankedPreferredMajors(['计算机', '软件'])).toBe(false);
  });
  it('空 / 非数组 → false', () => {
    expect(hasRankedPreferredMajors([])).toBe(false);
    expect(hasRankedPreferredMajors(null)).toBe(false);
  });
});

describe('checkPrerequisites - 意向专业', () => {
  const majorsCheck = (student: any) =>
    checkPrerequisites(student).find((c) => c.key === 'majors')!;

  it('只在意向池 → 意向专业未通过', () => {
    expect(majorsCheck({ preferredMajors: [{ tier: 0, majors: ['计算机'] }] }).passed).toBe(false);
  });
  it('已进梯队1 → 意向专业通过', () => {
    expect(majorsCheck({ preferredMajors: [{ tier: 1, majors: ['计算机'] }] }).passed).toBe(true);
  });
  it('无意向专业但填了专业类 → 通过', () => {
    expect(
      majorsCheck({ preferredMajors: [], preferredMajorCategories: ['计算机类'] }).passed,
    ).toBe(true);
  });
});
