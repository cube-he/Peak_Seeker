import type {
  AggregatedAdmissionListItem,
  AggregatedAdmissionDetail,
  AggregatedAdmissionDetailQuery,
  AggregatedAdmissionResponse,
} from './admission';

describe('admission shared types', () => {
  it('AggregatedAdmissionListItem is lightweight and has no yearlyData', () => {
    const item: AggregatedAdmissionListItem = {
      university: {
        id: 1,
        name: '四川大学',
        code: 'SCU',
        province: '四川',
        city: '成都',
        type: '综合',
        runningNature: '公办',
        is985: true,
        is211: true,
        isDoubleFirstClass: true,
        logoUrl: null,
      },
      major: { id: 10, name: '软件工程', category: '工学', discipline: '计算机类', softRating: 'A' },
      majorCode: '080902',
      majorName: '软件工程',
      groupCode: '01',
      batch: '本科一批',
      subjects: '物理',
      recruitType: '普通类',
      predictedMinRank: {
        point: 12000,
        conservative: 13000,
        optimistic: 11000,
        basisYears: [2024, 2023, 2022],
        confidence: 'high',
        targetYear: 2026,
      },
    };
    // @ts-expect-error yearlyData must not exist on the lightweight item
    item.yearlyData;
    expect(item.subjects).toBe('物理');
  });

  it('AggregatedAdmissionDetail carries full yearly data', () => {
    const detail: AggregatedAdmissionDetail = {
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      subjects: '物理',
      yearlyData: [
        {
          year: 2024,
          majorMinScore: 600,
          majorMinRank: 12000,
          majorAvgScore: 610,
          majorAvgRank: 10000,
          majorAdmissionCount: 30,
          groupMinScore: 598,
          groupMinRank: 12500,
          groupAdmissionCount: 90,
        },
      ],
      currentPlan: {
        planCount: 32,
        tuition: 4900,
        duration: '四年',
        subjectRequirements: '物理必选',
        disciplineEval: 'A',
        majorRanking: '5',
        majorHonor: '国家级一流专业',
        localMasterPoint: '软件工程硕士点',
        localDoctoralPoint: null,
        isNew: false,
        isSinoForeign: false,
        planNotes: null,
      },
      supplementary: { totalRounds: 0, totalPlanCount: 0, supplementaryRate: null },
    };
    expect(detail.yearlyData).toHaveLength(1);
  });

  it('AggregatedAdmissionResponse.data is a list of lightweight items with a flat total', () => {
    const resp: AggregatedAdmissionResponse = { data: [], total: 0 };
    const detailQuery: AggregatedAdmissionDetailQuery = {
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    };
    expect(resp.data).toEqual([]);
    expect(resp.total).toBe(0);
    expect(detailQuery.subjects).toBe('物理');
  });
});
