import { buildExportSheet } from './plan-export-rows.builder';

const YEARS = [2023, 2024, 2025];

// 一个富化候选组(含 1 个候选专业, majorHistory4y 覆盖 2024/2025, 2023 缺)
const enrichedGroup = {
  universityId: 10,
  universityName: '电子科技大学',
  universityCode: '0612',
  universityRank: 33,
  university: { city: '成都', runningNature: '公办', is985: true, is211: true, isDoubleFirstClass: true },
  groupCode: '01',
  currentPlanCount: 88,
  subjects: '物理',
  majors: [
    {
      majorCode: '0809',
      majorName: '计算机类',
      subjectRequirements: '化学',
      planCount: 20, // 26 计划
      tuition: 4900,
      duration: '四年',
      standardDuration: '4年',
      planNotes: '色盲色弱不录取；含中外合作办学方向，学费以当年为准',
      majorHistory4y: [
        { year: 2025, minScore: 668, minRank: 1200, avgScore: 675, avgRank: 900, planCount: 20 },
        { year: 2024, minScore: 662, minRank: 1500, avgScore: 670, avgRank: 1100, planCount: 18 },
        { year: 2023, minScore: null, minRank: null, avgScore: null, avgRank: null, planCount: null },
        { year: 2022, minScore: 655, minRank: 1800, avgScore: 663, avgRank: 1300, planCount: 16 },
      ],
      supplementaryByYear: { 2025: 3, 2024: null, 2023: null },
      supplementaryRoundsByYear: { 2025: [{ round: 1, count: 2 }, { round: 2, count: 1 }], 2024: null, 2023: null },
      bookPageNumber: 312, // 招生考试报页码
    },
  ],
};

const plan = {
  id: 7,
  name: 'v1 方案',
  year: 2026,
  batchName: '本科批',
  version: 1,
  scoreUsed: 670,
  rankUsed: 1000,
  student: { user: { realName: '张三' }, examType: 'PHYSICS', totalScore: 670, provincialRank: 1000, userId: 99 },
  planItems: [
    {
      sequence: 1,
      gradient: 'WEN',
      universityId: 10,
      universityName: '电子科技大学',
      universityCode: '0612',
      schoolNature: '公办',
      schoolTags: '985/211/双一流',
      groupCode: '01',
      majorId: 501,
      majorName: '计算机类',
      majorCode: '0809',
      planCount: 20,
      tuition: 4900,
      score25Major: 668,
      score24Major: 662,
    },
  ],
};

describe('buildExportSheet', () => {
  it('富化组：合并院校字段 + 候选专业 + 多年/征集透出', () => {
    const sheet = buildExportSheet({ plan, enrichedGroups: [enrichedGroup], years: YEARS });

    expect(sheet.student).toEqual({ name: '张三', examTypeLabel: '物理类', score: 670, rank: 1000 });
    expect(sheet.plan).toEqual({ id: 7, name: 'v1 方案', year: 2026, batchName: '本科批', version: 1 });
    expect(sheet.years).toEqual([2023, 2024, 2025]);
    expect(sheet.groups).toHaveLength(1);

    const g = sheet.groups[0];
    expect(g.fallback).toBe(false);
    expect(g.city).toBe('成都');
    expect(g.universityRank).toBe(33);
    expect(g.schoolNature).toBe('公办');
    expect(g.groupCode).toBe('01');
    expect(g.groupPlanCount).toBe(88);
    expect(g.subjectRequirement).toBe('物理/化学'); // 首选物理 + 再选化学
    expect(g.gradientLabel).toBe('稳');
    expect(g.majors).toHaveLength(1);

    const m = g.majors[0];
    expect(m.planCount).toBe(20);
    expect(m.planByYear).toEqual({ 2023: null, 2024: 18, 2025: 20 });
    expect(m.minScoreByYear).toEqual({ 2023: null, 2024: 662, 2025: 668 });
    expect(m.suppByYear[2025]).toEqual([2, 1]); // 逐轮人数: 第1轮2人, 第2轮1人
    expect(m.suppByYear[2024]).toBeNull();
    expect(m.duration).toBe('四年');
    expect(m.tuition).toBe(4900);
    expect(m.planNotes).toContain('中外合作');
    expect(m.bookPageNumber).toBe(312);
  });

  it('快照兜底：组在富化结果缺失时用 planItem 快照渲染单个锚定专业', () => {
    const sheet = buildExportSheet({ plan, enrichedGroups: [], years: YEARS });
    const g = sheet.groups[0];
    expect(g.fallback).toBe(true);
    expect(g.universityName).toBe('电子科技大学');
    expect(g.city).toBeNull();           // 快照无城市
    expect(g.universityRank).toBeNull();  // 快照无排名
    expect(g.groupPlanCount).toBeNull();
    expect(g.majors).toHaveLength(1);
    const m = g.majors[0];
    expect(m.majorName).toBe('计算机类');
    expect(m.minScoreByYear).toEqual({ 2023: null, 2024: 662, 2025: 668 }); // 快照 25/24 有, 23 无
    expect(m.planByYear).toEqual({ 2023: null, 2024: null, 2025: null });
    expect(m.suppByYear[2025]).toBeNull();
    expect(m.bookPageNumber).toBeNull(); // 快照无页码
  });

  it('schoolTags 缺快照时由院校 985/211/双一流 标志合成', () => {
    const itemNoTags = { ...plan.planItems[0], schoolTags: undefined };
    const sheet = buildExportSheet({
      plan: { ...plan, planItems: [itemNoTags] },
      enrichedGroups: [enrichedGroup],
      years: YEARS,
    });
    expect(sheet.groups[0].schoolTags).toBe('985/211/双一流');
  });

  it('多条目按 planItems 顺序输出', () => {
    const twoItemPlan = {
      ...plan,
      planItems: [
        { ...plan.planItems[0], sequence: 1, universityId: 10, groupCode: '01' },
        { ...plan.planItems[0], sequence: 2, universityId: 20, groupCode: '02', universityName: '西南交大', majorName: '土木类' },
      ],
    };
    const sheet = buildExportSheet({ plan: twoItemPlan, enrichedGroups: [enrichedGroup], years: YEARS });
    expect(sheet.groups.map((g) => g.sequence)).toEqual([1, 2]);
    expect(sheet.groups[0].fallback).toBe(false); // 命中富化
    expect(sheet.groups[1].fallback).toBe(true);  // 无富化 → 兜底
  });
});
