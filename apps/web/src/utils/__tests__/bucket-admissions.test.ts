import { bucketAdmissions } from '../bucket-admissions';
import * as classify from '../classify-rank';
import type { AggregatedAdmissionListItem } from '@volunteer-helper/shared';

function makeItem(id: number, predictedPoint: number | null): AggregatedAdmissionListItem {
  return {
    university: {
      id,
      name: '校' + id,
      code: 'C' + id,
      province: '四川',
      city: '成都',
      type: '综合',
      runningNature: '公办',
      is985: false,
      is211: false,
      isDoubleFirstClass: false,
      logoUrl: null,
    },
    major: { id, name: '专业' + id, category: '工学', discipline: '计算机类', softRating: null },
    majorCode: 'M' + id,
    majorName: '专业' + id,
    groupCode: 'G' + id,
    batch: '本科一批',
    subjects: '物理',
    recruitType: '普通类',
    predictedMinRank:
      predictedPoint === null
        ? null
        : {
            point: predictedPoint,
            conservative: predictedPoint + 500,
            optimistic: predictedPoint - 500,
            basisYears: [2024, 2023],
            confidence: 'high',
            targetYear: 2026,
          },
  };
}

describe('bucketAdmissions', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes rush/stable/safe into their buckets and excludes elite/unknown', () => {
    const items = [
      makeItem(1, 10000),
      makeItem(2, 12000),
      makeItem(3, 20000),
      makeItem(4, 90000),
      makeItem(5, null),
    ];
    jest
      .spyOn(classify, 'classifyRank')
      .mockImplementation((_userRank, predictedRank) => {
        if (predictedRank === null) return 'unknown';
        if (predictedRank === 10000) return 'rush';
        if (predictedRank === 12000) return 'stable';
        if (predictedRank === 20000) return 'safe';
        return 'elite';
      });

    const result = bucketAdmissions(items, 12000);

    expect(result.rush.map((i) => i.university.id)).toEqual([1]);
    expect(result.stable.map((i) => i.university.id)).toEqual([2]);
    expect(result.safe.map((i) => i.university.id)).toEqual([3]);
    expect(result.unknownCount).toBe(1);
  });

  it('passes computed tier and historical flag into classifyRank', () => {
    const spy = jest.spyOn(classify, 'classifyRank').mockReturnValue('stable');

    bucketAdmissions([makeItem(1, 12000)], 12000);

    expect(spy).toHaveBeenCalledWith(
      12000,
      12000,
      classify.getTier({ is985: false, is211: false, batch: '本科一批' }),
      classify.isHistorical('物理'),
    );
  });
});
