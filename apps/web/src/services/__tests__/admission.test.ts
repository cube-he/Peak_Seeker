const mockGet = jest.fn();
const mockPost = jest.fn();

jest.mock('../api', () => ({
  __esModule: true,
  default: { get: mockGet, post: mockPost },
}));

import { admissionService } from '../admission';

describe('admissionService.getAggregated', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('sends rank/province/subjects and returns the lightweight response', async () => {
    mockGet.mockResolvedValue({
      data: [
        {
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
        },
      ],
      total: 1,
    });

    const result = await admissionService.getAggregated({
      rank: 12000,
      province: '四川',
      subjects: '物理',
    });

    expect(mockGet).toHaveBeenCalledWith('/admissions/aggregated', {
      params: { rank: 12000, province: '四川', subjects: '物理' },
    });
    expect(result.data[0].subjects).toBe('物理');
    expect(result.total).toBe(1);
  });
});

describe('admissionService.getAggregatedDetail', () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it('calls the detail endpoint with all key params', async () => {
    mockGet.mockResolvedValue({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      subjects: '物理',
      yearlyData: [],
      currentPlan: null,
      supplementary: null,
    });

    const result = await admissionService.getAggregatedDetail({
      universityId: 1,
      majorCode: '080902',
      groupCode: '01',
      batch: '本科一批',
      recruitType: '普通类',
      province: '四川',
      subjects: '物理',
    });

    expect(mockGet).toHaveBeenCalledWith('/admissions/aggregated/detail', {
      params: {
        universityId: 1,
        majorCode: '080902',
        groupCode: '01',
        batch: '本科一批',
        recruitType: '普通类',
        province: '四川',
        subjects: '物理',
      },
    });
    expect(result.universityId).toBe(1);
  });
});
