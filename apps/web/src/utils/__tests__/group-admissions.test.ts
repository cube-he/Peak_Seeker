import { groupAdmissions } from '../group-admissions';

const baseAdm = (overrides: Partial<any>) => ({
  year: 2024,
  subjects: '物理类',
  batch: '本科一批 B段',
  groupCode: '9999',
  groupName: '工科试验班',
  groupMinScore: 605,
  groupMinRank: 5000,
  groupAdmissionCount: 45,
  majorCode: '080901',
  majorName: '计算机科学与技术',
  majorMinScore: 615,
  majorMinRank: 4380,
  planCount: 10,
  extras: { majorRanking: '12', disciplineEval: '软科：A+', isNationalFeature: true },
  ...overrides,
});

describe('groupAdmissions', () => {
  it('两个不同专业同组 → 一个 group，组内 2 个 majors', () => {
    const input = [
      baseAdm({}),
      baseAdm({ majorCode: '080902', majorName: '软件工程', majorMinScore: 612, majorMinRank: 4521, planCount: 8 }),
    ];
    const groups = groupAdmissions(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].groupCode).toBe('9999');
    expect(groups[0].majors).toHaveLength(2);
    expect(groups[0].majors.map(m => m.majorCode).sort()).toEqual(['080901', '080902']);
  });

  it('不同 groupCode → 不同 group', () => {
    const input = [
      baseAdm({ groupCode: '9999' }),
      baseAdm({ groupCode: '8888', majorCode: '020101', majorName: '经济学' }),
    ];
    const groups = groupAdmissions(input);
    expect(groups).toHaveLength(2);
  });

  it('同 groupCode 跨年 → 不同 group（跨年不合并）', () => {
    const input = [
      baseAdm({ year: 2024 }),
      baseAdm({ year: 2023 }),
    ];
    const groups = groupAdmissions(input);
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.year).sort()).toEqual([2023, 2024]);
  });

  it('排序：年份降序，组内 majors 按 majorMinRank 升序', () => {
    const input = [
      baseAdm({ year: 2023, majorCode: 'X1', majorMinRank: 9999 }),
      baseAdm({ year: 2024, majorCode: 'Y1', majorMinRank: 5000 }),
      baseAdm({ year: 2024, majorCode: 'Y2', majorMinRank: 4500 }),
    ];
    const groups = groupAdmissions(input);
    expect(groups[0].year).toBe(2024);
    expect(groups[0].majors[0].majorCode).toBe('Y2');
    expect(groups[0].majors[1].majorCode).toBe('Y1');
  });

  it('空输入返回空数组', () => {
    expect(groupAdmissions([])).toEqual([]);
  });

  it('groupCode 为空字符串视为一个独立组（不与其他空 groupCode 合并）', () => {
    const input = [
      baseAdm({ groupCode: '', majorCode: 'A1' }),
      baseAdm({ groupCode: '', majorCode: 'A2' }),
    ];
    const groups = groupAdmissions(input);
    expect(groups).toHaveLength(1);
    expect(groups[0].majors).toHaveLength(2);
  });
});
