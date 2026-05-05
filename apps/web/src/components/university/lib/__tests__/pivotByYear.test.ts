import { pivotByYear } from '../pivotByYear';

type Rec = {
  year: number;
  majorName: string;
  groupCode: string;
  recruitType: string;
  subjects: string;
  majorId: number;
  planCount?: number;
  majorMinRank?: number;
};

const base = (over: Partial<Rec>): Rec => ({
  year: 2024,
  majorName: '计算机',
  groupCode: '01',
  recruitType: '普通类本科',
  subjects: '物理',
  majorId: 1,
  ...over,
});

describe('pivotByYear', () => {
  it('returns empty result for empty input', () => {
    const out = pivotByYear<Rec, 'planCount'>([], { fields: ['planCount'] });
    expect(out.rows).toEqual([]);
    expect(out.years).toEqual([]);
  });

  it('groups same major across years into one row', () => {
    const out = pivotByYear<Rec, 'planCount'>(
      [base({ year: 2024, planCount: 60 }), base({ year: 2023, planCount: 55 })],
      { fields: ['planCount'] },
    );
    expect(out.rows).toHaveLength(1);
    expect(out.years).toEqual([2024, 2023]);
    expect(out.rows[0].byYear[2024]?.planCount).toBe(60);
    expect(out.rows[0].byYear[2023]?.planCount).toBe(55);
  });

  it('does NOT collapse same major name with different groupCode', () => {
    const out = pivotByYear<Rec, 'planCount'>(
      [
        base({ groupCode: '01', planCount: 60 }),
        base({ groupCode: '03', planCount: 30 }),
      ],
      { fields: ['planCount'] },
    );
    expect(out.rows).toHaveLength(2);
  });

  it('does NOT collapse same major across different recruitType / subjects', () => {
    const out = pivotByYear<Rec, 'planCount'>(
      [
        base({ recruitType: '普通类本科', planCount: 60 }),
        base({ recruitType: '中外合作办学', planCount: 20 }),
        base({ subjects: '物理+化学', planCount: 10 }),
      ],
      { fields: ['planCount'] },
    );
    expect(out.rows).toHaveLength(3);
  });

  it('limits years to most recent N (default 3)', () => {
    const records: Rec[] = [2025, 2024, 2023, 2022, 2021].map((y) =>
      base({ year: y, planCount: y }),
    );
    const out = pivotByYear<Rec, 'planCount'>(records, { fields: ['planCount'] });
    expect(out.years).toEqual([2025, 2024, 2023]);
    expect(out.rows[0].byYear[2022]).toBeUndefined();
  });

  it('sorts rows by latest year sortByField asc by default', () => {
    const out = pivotByYear<Rec, 'majorMinRank'>(
      [
        base({ majorName: '冷门', groupCode: 'A', majorMinRank: 80000 }),
        base({ majorName: '热门', groupCode: 'B', majorMinRank: 5000 }),
        base({ majorName: '中等', groupCode: 'C', majorMinRank: 30000 }),
      ],
      { fields: ['majorMinRank'], sortByField: 'majorMinRank' },
    );
    expect(out.rows.map((r) => r.majorName)).toEqual(['热门', '中等', '冷门']);
  });

  it('places rows missing latest-year sort field at the end', () => {
    const out = pivotByYear<Rec, 'majorMinRank'>(
      [
        base({ majorName: '有数据', groupCode: 'A', year: 2024, majorMinRank: 30000 }),
        base({ majorName: '只老数据', groupCode: 'B', year: 2023, majorMinRank: 10000 }),
      ],
      { fields: ['majorMinRank'], sortByField: 'majorMinRank' },
    );
    expect(out.rows[0].majorName).toBe('有数据');
    expect(out.rows[1].majorName).toBe('只老数据');
  });
});
