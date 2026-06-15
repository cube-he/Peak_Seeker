import {
  studentMeetsSubjectRequirement,
  filterEpsBySubjectRequirement,
} from './subject-requirement-filter';

describe('studentMeetsSubjectRequirement', () => {
  it('不限 / 空 → 任意选科都通过', () => {
    expect(studentMeetsSubjectRequirement('不限', ['化学'])).toBe(true);
    expect(studentMeetsSubjectRequirement('', ['化学'])).toBe(true);
    expect(studentMeetsSubjectRequirement(null, ['生物'])).toBe(true);
  });
  it('reChoices 空 → 任意要求都通过(不过滤)', () => {
    expect(studentMeetsSubjectRequirement('化学', [])).toBe(true);
    expect(studentMeetsSubjectRequirement('化学和生物', [])).toBe(true);
  });
  it('单科: 含→true, 不含→false', () => {
    expect(studentMeetsSubjectRequirement('化学', ['化学', '生物'])).toBe(true);
    expect(studentMeetsSubjectRequirement('化学', ['生物', '政治'])).toBe(false);
  });
  it('和(AND): 全含→true, 缺一→false', () => {
    expect(studentMeetsSubjectRequirement('化学和生物', ['化学', '生物'])).toBe(true);
    expect(studentMeetsSubjectRequirement('化学和生物', ['化学', '政治'])).toBe(false);
    expect(studentMeetsSubjectRequirement('政治和地理', ['政治', '地理'])).toBe(true);
  });
  it('或(OR, 防御): 含任一→true, 都不含→false', () => {
    expect(studentMeetsSubjectRequirement('化学或生物', ['生物'])).toBe(true);
    expect(studentMeetsSubjectRequirement('化学或生物', ['政治', '地理'])).toBe(false);
  });
});

describe('filterEpsBySubjectRequirement', () => {
  const eps = [
    { id: 1, subjectRequirements: '不限' },
    { id: 2, subjectRequirements: '化学' },
    { id: 3, subjectRequirements: '化学和生物' },
    { id: 4, subjectRequirements: '生物' },
  ];
  it('生物+政治(无化学): 留 不限/生物, 剔 化学/化学和生物', () => {
    expect(filterEpsBySubjectRequirement(eps, ['生物', '政治']).map((e) => e.id)).toEqual([1, 4]);
  });
  it('化学+生物: 全留', () => {
    expect(filterEpsBySubjectRequirement(eps, ['化学', '生物']).map((e) => e.id)).toEqual([1, 2, 3, 4]);
  });
  it('reChoices 空/缺失/全空白 → 原样返回(同引用)', () => {
    expect(filterEpsBySubjectRequirement(eps, [])).toBe(eps);
    expect(filterEpsBySubjectRequirement(eps, null)).toBe(eps);
    expect(filterEpsBySubjectRequirement(eps, ['', '  '])).toBe(eps);
  });
});
