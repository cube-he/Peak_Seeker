import {
  rollupByUniversity,
  sortCandidateUniversities,
  RollupContext,
  CandidateUniversity,
} from './university-rollup';

function makeGroup(over: Partial<any> = {}): any {
  return {
    universityId: 1,
    universityName: '电子科技大学',
    universityCode: '0612',
    university: {
      softRanking: 26,
      is985: true,
      is211: true,
      isDoubleFirstClass: true,
      province: '四川',
      city: '成都',
    },
    groupKey: 'g',
    groupCode: '01',
    groupMinRank: 12000,
    suggestedGradient: 'WEN',
    matchScore: 80,
    ...over,
  };
}

const emptyCtx: RollupContext = {
  preferredUniversityNames: new Set(),
  preferredUniversityIds: new Set(),
  preferredUniversityOrder: new Map(),
  preferredRegions: new Set(),
};

describe('rollupByUniversity', () => {
  it('同一院校多组卷成一条, gradientSpread 统计正确', () => {
    const groups = [
      makeGroup({ universityId: 1, groupCode: '01', groupMinRank: 8000, suggestedGradient: 'CHONG' }),
      makeGroup({ universityId: 1, groupCode: '02', groupMinRank: 12000, suggestedGradient: 'WEN' }),
      makeGroup({ universityId: 1, groupCode: '03', groupMinRank: 18000, suggestedGradient: 'BAO' }),
    ];
    const unis = rollupByUniversity(groups, emptyCtx);
    expect(unis).toHaveLength(1);
    expect(unis[0].universityId).toBe(1);
    expect(unis[0].groups).toHaveLength(3);
    expect(unis[0].summary.groupCount).toBe(3);
    expect(unis[0].summary.gradientSpread).toEqual({ chong: 1, wen: 1, bao: 1 });
  });

  it('多个院校拆成多条', () => {
    const groups = [
      makeGroup({ universityId: 1, universityName: 'A' }),
      makeGroup({ universityId: 2, universityName: 'B' }),
      makeGroup({ universityId: 1, universityName: 'A', groupCode: '02' }),
    ];
    const unis = rollupByUniversity(groups, emptyCtx);
    expect(unis).toHaveLength(2);
    const a = unis.find((u) => u.universityId === 1)!;
    expect(a.groups).toHaveLength(2);
  });

  it('组内按位次升序(最难/冲在前), null 垫底', () => {
    const groups = [
      makeGroup({ groupCode: 'a', groupMinRank: 18000 }),
      makeGroup({ groupCode: 'b', groupMinRank: 8000 }),
      makeGroup({ groupCode: 'c', groupMinRank: null }),
      makeGroup({ groupCode: 'd', groupMinRank: 12000 }),
    ];
    const unis = rollupByUniversity(groups, emptyCtx);
    expect(unis[0].groups.map((g) => g.groupCode)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('easiest=最大位次, hardest=最小位次, bestMatchScore=最大', () => {
    const groups = [
      makeGroup({ groupMinRank: 8000, matchScore: 70 }),
      makeGroup({ groupMinRank: 18000, matchScore: 90 }),
    ];
    const unis = rollupByUniversity(groups, emptyCtx);
    expect(unis[0].summary.easiestGroupMinRank).toBe(18000);
    expect(unis[0].summary.hardestGroupMinRank).toBe(8000);
    expect(unis[0].summary.bestMatchScore).toBe(90);
  });

  it('null 位次不计入 easiest/hardest', () => {
    const groups = [makeGroup({ groupMinRank: null }), makeGroup({ groupMinRank: 12000 })];
    const unis = rollupByUniversity(groups, emptyCtx);
    expect(unis[0].summary.easiestGroupMinRank).toBe(12000);
    expect(unis[0].summary.hardestGroupMinRank).toBe(12000);
  });

  it('意向院校命中(按名)+ 意向序号', () => {
    const ctx: RollupContext = {
      ...emptyCtx,
      preferredUniversityNames: new Set(['电子科技大学']),
      preferredUniversityOrder: new Map([['电子科技大学', 2]]),
    };
    const unis = rollupByUniversity([makeGroup()], ctx);
    expect(unis[0].summary.isPreferred).toBe(true);
    expect(unis[0].summary.preferredRank).toBe(2);
  });

  it('意向院校命中(按 id)', () => {
    const ctx: RollupContext = { ...emptyCtx, preferredUniversityIds: new Set([1]) };
    const unis = rollupByUniversity([makeGroup({ universityId: 1 })], ctx);
    expect(unis[0].summary.isPreferred).toBe(true);
  });

  it('地域命中(省或市任一)', () => {
    const ctx: RollupContext = { ...emptyCtx, preferredRegions: new Set(['成都']) };
    const unis = rollupByUniversity([makeGroup()], ctx);
    expect(unis[0].summary.regionMatch).toBe(true);
  });

  it('未命中意向/地域时为 false/null', () => {
    const unis = rollupByUniversity([makeGroup()], emptyCtx);
    expect(unis[0].summary.isPreferred).toBe(false);
    expect(unis[0].summary.preferredRank).toBeNull();
    expect(unis[0].summary.regionMatch).toBe(false);
  });
});

describe('sortCandidateUniversities', () => {
  function makeUni(over: Partial<any> = {}): CandidateUniversity {
    return {
      universityId: 1,
      universityName: 'U',
      universityCode: null,
      university: { softRanking: 50, is985: false, is211: false, isDoubleFirstClass: false },
      groups: [],
      summary: {
        groupCount: 1,
        gradientSpread: { chong: 0, wen: 1, bao: 0 },
        bestMatchScore: 50,
        easiestGroupMinRank: 10000,
        hardestGroupMinRank: 10000,
        isPreferred: false,
        preferredRank: null,
        regionMatch: false,
      },
      ...over,
    };
  }

  it('UNIVERSITY_OVERALL: 意向院校优先, 再按意向序号', () => {
    const unis = [
      makeUni({ universityId: 1 }),
      makeUni({ universityId: 2, summary: { ...makeUni().summary, isPreferred: true, preferredRank: 3 } }),
      makeUni({ universityId: 3, summary: { ...makeUni().summary, isPreferred: true, preferredRank: 1 } }),
    ];
    sortCandidateUniversities(unis, 'UNIVERSITY_OVERALL', 10000);
    expect(unis.map((u) => u.universityId)).toEqual([3, 2, 1]);
  });

  it('UNIVERSITY_RANK: 软科排名升序, null 最后', () => {
    const unis = [
      makeUni({ universityId: 1, university: { softRanking: null } }),
      makeUni({ universityId: 2, university: { softRanking: 10 } }),
      makeUni({ universityId: 3, university: { softRanking: 30 } }),
    ];
    sortCandidateUniversities(unis, 'UNIVERSITY_RANK', 10000);
    expect(unis.map((u) => u.universityId)).toEqual([2, 3, 1]);
  });

  it('UNIVERSITY_TIER: 985 > 211 > 双一流 > 普通', () => {
    const unis = [
      makeUni({ universityId: 1, university: { is985: false, is211: false, isDoubleFirstClass: false, softRanking: 5 } }),
      makeUni({ universityId: 2, university: { is985: true, softRanking: 100 } }),
      makeUni({ universityId: 3, university: { is985: false, is211: true, softRanking: 50 } }),
    ];
    sortCandidateUniversities(unis, 'UNIVERSITY_TIER', 10000);
    expect(unis.map((u) => u.universityId)).toEqual([2, 3, 1]);
  });

  it('REGION_FIRST: 地域命中优先, 再按排名', () => {
    const unis = [
      makeUni({ universityId: 1, university: { softRanking: 5 } }),
      makeUni({ universityId: 2, summary: { ...makeUni().summary, regionMatch: true }, university: { softRanking: 80 } }),
    ];
    sortCandidateUniversities(unis, 'REGION_FIRST', 10000);
    expect(unis.map((u) => u.universityId)).toEqual([2, 1]);
  });

  it('UNIVERSITY_OVERALL: 保底校(只有保)沉底, 稳/冲档在前(即使保底软科靠前)', () => {
    const unis = [
      makeUni({ universityId: 1, summary: { ...makeUni().summary, gradientSpread: { chong: 0, wen: 0, bao: 1 } }, university: { softRanking: 5 } }),
      makeUni({ universityId: 2, summary: { ...makeUni().summary, gradientSpread: { chong: 1, wen: 0, bao: 0 } }, university: { softRanking: 200 } }),
      makeUni({ universityId: 3, summary: { ...makeUni().summary, gradientSpread: { chong: 0, wen: 1, bao: 0 } }, university: { softRanking: 300 } }),
    ];
    sortCandidateUniversities(unis, 'UNIVERSITY_OVERALL', 10000);
    expect(unis.map((u) => u.universityId)).toEqual([3, 2, 1]); // 稳→冲→保底
  });

  it('UNIVERSITY_OVERALL: 同位次档内公办优先于民办', () => {
    const unis = [
      makeUni({ universityId: 1, university: { runningNature: '民办', softRanking: 5 } }),
      makeUni({ universityId: 2, university: { runningNature: '公办', softRanking: 200 } }),
    ];
    sortCandidateUniversities(unis, 'UNIVERSITY_OVERALL', 10000);
    expect(unis.map((u) => u.universityId)).toEqual([2, 1]); // 公办在前
  });

  it('UNIVERSITY_RANK: 公办优先, 民办分类小名次不盖过公办综合名次', () => {
    const unis = [
      makeUni({ universityId: 1, university: { runningNature: '民办', softRanking: 5 } }),
      makeUni({ universityId: 2, university: { runningNature: '公办', softRanking: 200 } }),
    ];
    sortCandidateUniversities(unis, 'UNIVERSITY_RANK', 10000);
    expect(unis.map((u) => u.universityId)).toEqual([2, 1]);
  });
});
