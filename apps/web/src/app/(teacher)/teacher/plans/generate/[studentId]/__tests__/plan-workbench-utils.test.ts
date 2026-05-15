import {
  findPlanForBatch,
  formatCandidateGroup,
  formatGroupPlanChange,
  formatGroupScoreLine,
  formatRankGap,
  formatSubjectCombination,
  formatSupplementary,
  getMajorGroupSelectionPayload,
  getPlanItemMajorSelection,
  getPlanItemsForWorkbench,
  getLatestPlansByBatch,
  getSubjectHighlights,
  hasSupplementaryData,
  isCandidateGroupAlreadyAdded,
  movePlanMajorSelection,
  sortPlansForWorkbench,
  summarizeTags,
  togglePlanMajorSelection,
} from '../plan-workbench-utils';

describe('plan workbench helpers', () => {
  it('keeps only the latest version for each batch', () => {
    const plans = [
      { id: 1, batchConfigId: 22, versionNo: 1, updatedAt: '2026-05-10T00:00:00.000Z' },
      { id: 2, batchConfigId: 22, versionNo: 2, updatedAt: '2026-05-11T00:00:00.000Z' },
      { id: 3, batchConfigId: 34, versionNo: 1, updatedAt: '2026-05-09T00:00:00.000Z' },
    ];

    expect(getLatestPlansByBatch(plans).map((plan) => plan.id)).toEqual([2, 3]);
  });

  it('sorts existing plans by batch admission order', () => {
    const plans = [
      { id: 34, batchConfigId: 34, batchName: '高职批', versionNo: 1 },
      { id: 22, batchConfigId: 22, batchName: '本科批B段', versionNo: 1 },
    ];
    const batches = [
      { batchConfigId: 22, admissionOrder: 11 },
      { batchConfigId: 34, admissionOrder: 17 },
    ];

    expect(sortPlansForWorkbench(plans, batches).map((plan) => plan.id)).toEqual([22, 34]);
  });

  it('finds an existing plan for a selected batch', () => {
    const plans = [
      { id: 5, batchConfigId: 22, batchName: '本科批B段', versionNo: 1 },
    ];

    expect(findPlanForBatch(plans, 22)?.id).toBe(5);
    expect(findPlanForBatch(plans, 34)).toBeUndefined();
  });

  it('formats candidate group text without relying on nullable groupName', () => {
    expect(formatCandidateGroup({ groupCode: '101', groupName: null, recruitType: '普通类本科' })).toBe(
      '专业组 101 · 普通类本科',
    );
    expect(formatCandidateGroup({ groupCode: '102', groupName: '物理+不限', recruitType: '普通类本科' })).toBe(
      '专业组 102 · 物理+不限 · 普通类本科',
    );
  });

  it('formats professional group plan-count changes by source year', () => {
    expect(formatGroupPlanChange({ currentPlanCount: 30, previousPlanCount: 24, planCountChange: 6, currentPlanYear: 2025, previousPlanYear: 2024 })).toEqual({
      text: '2025 招生 30 人，较 2024 +6',
      tone: 'up',
    });
    expect(formatGroupPlanChange({ currentPlanCount: 10, previousPlanCount: null, planCountChange: null, currentPlanYear: 2025, previousPlanYear: 2024 })).toEqual({
      text: '2025 招生 10 人，暂无 2024 对比',
      tone: 'flat',
    });
  });

  it('formats score line with fallback source labels', () => {
    expect(formatGroupScoreLine({ groupMinScore: 610, groupMinRank: 10000, scoreSource: 'GROUP' })).toBe('专业组线 610 分 / 10,000 位');
    expect(formatGroupScoreLine({ groupMinScore: 605, groupMinRank: null, scoreSource: 'MAJOR' })).toBe('组内专业线 605 分');
    expect(formatGroupScoreLine({ groupMinScore: null, groupMinRank: null, scoreSource: 'NONE' })).toBe('暂无分数线');
  });

  it('formats student rank gap against adjusted rank', () => {
    expect(formatRankGap(4120, 4360)).toEqual({ text: '领先 240 名', tone: 'ahead' });
    expect(formatRankGap(4120, 1930)).toEqual({ text: '落后 2,190 名', tone: 'behind' });
    expect(formatRankGap(4120, 4120)).toEqual({ text: '位次持平', tone: 'flat' });
    expect(formatRankGap(null, 4360)).toEqual({ text: '暂无位次差', tone: 'flat' });
  });

  it('formats supplementary collection status even when no data is imported yet', () => {
    expect(hasSupplementaryData({ supplementary: null })).toBe(false);
    expect(formatSupplementary({ supplementary: null })).toBe('征集暂无/未导入');

    const group = {
      supplementary: {
        sourceYear: 2025,
        totalPlanCount: 8,
        totalRounds: 2,
        supplementaryRate: 0.18,
      },
    };
    expect(hasSupplementaryData(group)).toBe(true);
    expect(formatSupplementary(group)).toBe('2025 征集 8 人，2 轮，征集率 18.0%');
  });

  it('labels university-batch supplementary data so it is not mistaken for group-level data', () => {
    expect(formatSupplementary({
      supplementary: {
        sourceYear: 2025,
        scope: 'UNIVERSITY_BATCH',
        totalPlanCount: 28,
        totalRounds: 3,
        supplementaryRate: 933.33,
      },
    })).toBe('2025 院校批次征集 28 人，3 轮，征集率 933.3%');
  });

  it('detects candidate groups that are already in the current plan', () => {
    const planItems = [
      { universityId: 11, groupCode: 'G1' },
      { universityId: 12, groupCode: 'G2' },
    ];
    expect(isCandidateGroupAlreadyAdded({ universityId: 11, groupCode: 'G1' }, planItems)).toBe(true);
    expect(isCandidateGroupAlreadyAdded({ universityId: 11, groupCode: 'G3' }, planItems)).toBe(false);
  });

  it('uses full planItems for workbench duplicate detection when both item shapes exist', () => {
    const plan = {
      items: [{ id: 1, groupCode: '104', universityName: 'Jilin University' }],
      planItems: [{ id: 8, universityId: 8971, groupCode: '104', universityName: 'Jilin University' }],
    };

    const items = getPlanItemsForWorkbench(plan);

    expect(items).toBe(plan.planItems);
    expect(isCandidateGroupAlreadyAdded({ universityId: 8971, groupCode: '104' }, items)).toBe(true);
  });

  it('selects all majors when a group has six or fewer majors', () => {
    const group = {
      majors: [
        { enrollmentPlanId: 1, majorId: 1, majorName: 'A', displaySection: 'RECOMMENDED' },
        { enrollmentPlanId: 2, majorId: 2, majorName: 'B', displaySection: 'RISK' },
        { enrollmentPlanId: 3, majorId: 3, majorName: 'C', displaySection: 'BACKUP' },
      ],
    };

    const payload = getMajorGroupSelectionPayload(group);

    expect(payload.selectedMajors.map((major) => major.majorName)).toEqual(['A', 'B', 'C']);
    expect(payload.candidateMajorRanking.map((major) => major.order)).toEqual([1, 2, 3]);
  });

  it('prefers intended majors and categories when a group has more than six majors', () => {
    const group = {
      majors: [
        { enrollmentPlanId: 1, majorId: 1, majorName: 'General A', majorCategory: 'Other', displaySection: 'RECOMMENDED' },
        { enrollmentPlanId: 2, majorId: 2, majorName: 'Risk A', majorCategory: 'Computer', displaySection: 'RISK' },
        { enrollmentPlanId: 3, majorId: 3, majorName: 'Software Engineering', majorCategory: 'Computer', displaySection: 'RECOMMENDED' },
        { enrollmentPlanId: 4, majorId: 4, majorName: 'Computer Science', majorCategory: 'Computer', displaySection: 'RECOMMENDED' },
        { enrollmentPlanId: 5, majorId: 5, majorName: 'Backup A', majorCategory: 'Other', displaySection: 'BACKUP' },
        { enrollmentPlanId: 6, majorId: 6, majorName: 'General B', majorCategory: 'Other', displaySection: 'RECOMMENDED' },
        { enrollmentPlanId: 7, majorId: 7, majorName: 'Data Science', majorCategory: 'Computer', displaySection: 'BACKUP' },
      ],
    };

    const payload = getMajorGroupSelectionPayload(group, {
      preferredMajors: ['Computer Science'],
      preferredMajorCategories: ['Computer'],
    });

    expect(payload.selectedMajors.map((major) => major.majorName)).toEqual([
      'Computer Science',
      'Software Engineering',
      'Data Science',
      'General A',
      'General B',
      'Backup A',
    ]);
  });

  it('uses current candidate order when the student has no major preference', () => {
    const group = {
      majors: Array.from({ length: 7 }, (_, index) => ({
        enrollmentPlanId: index + 1,
        majorId: index + 1,
        majorName: `Major ${index + 1}`,
        displaySection: index === 0 ? 'RISK' : 'RECOMMENDED',
      })),
    };

    const payload = getMajorGroupSelectionPayload(group);

    expect(payload.selectedMajors.map((major) => major.majorName)).toEqual([
      'Major 1',
      'Major 2',
      'Major 3',
      'Major 4',
      'Major 5',
      'Major 6',
    ]);
  });

  it('builds selected and unselected major rows for an existing plan item', () => {
    const selection = getPlanItemMajorSelection({
      selectedMajors: null,
      fullMajorRanking: {
        selectedMajors: [
          { order: 1, enrollmentPlanId: 102, majorId: 12, majorName: 'C', displaySection: 'BACKUP' },
          { order: 2, enrollmentPlanId: 100, majorId: 10, majorName: 'A', displaySection: 'RECOMMENDED' },
        ],
        candidateMajorRanking: [
          { order: 1, enrollmentPlanId: 100, majorId: 10, majorName: 'A', displaySection: 'RECOMMENDED' },
          { order: 2, enrollmentPlanId: 101, majorId: 11, majorName: 'B', displaySection: 'RISK' },
          { order: 3, enrollmentPlanId: 102, majorId: 12, majorName: 'C', displaySection: 'BACKUP' },
        ],
      },
    });

    expect(selection.canEdit).toBe(true);
    expect(selection.rows.map((row) => [row.majorName, row.isSelected])).toEqual([
      ['C', true],
      ['A', true],
      ['B', false],
    ]);
  });

  it('toggles a plan item major while capping selection at six', () => {
    const selected = Array.from({ length: 6 }, (_, index) => ({
      order: index + 1,
      enrollmentPlanId: index + 1,
      majorId: index + 1,
      majorName: `Major ${index + 1}`,
    }));

    expect(togglePlanMajorSelection(selected, {
      order: 7,
      enrollmentPlanId: 7,
      majorId: 7,
      majorName: 'Major 7',
    }, true)).toHaveLength(6);
    expect(togglePlanMajorSelection(selected, selected[1], false).map((major) => major.majorName)).toEqual([
      'Major 1',
      'Major 3',
      'Major 4',
      'Major 5',
      'Major 6',
    ]);
  });

  it('moves selected majors up and down with normalized order values', () => {
    const selected = [
      { order: 1, enrollmentPlanId: 1, majorId: 1, majorName: 'A' },
      { order: 2, enrollmentPlanId: 2, majorId: 2, majorName: 'B' },
      { order: 3, enrollmentPlanId: 3, majorId: 3, majorName: 'C' },
    ];

    expect(movePlanMajorSelection(selected, 2, 'up')).toEqual([
      { order: 1, enrollmentPlanId: 2, majorId: 2, majorName: 'B' },
      { order: 2, enrollmentPlanId: 1, majorId: 1, majorName: 'A' },
      { order: 3, enrollmentPlanId: 3, majorId: 3, majorName: 'C' },
    ]);
    expect(movePlanMajorSelection(selected, 2, 'down').map((major) => major.majorName)).toEqual(['A', 'C', 'B']);
  });

  it('formats the selected subject combination with readable labels', () => {
    expect(formatSubjectCombination({ firstChoice: 'PHYSICS', reChoices: ['CHEM', 'GEO'] })).toBe('物理 / 化学 / 地理');
    expect(formatSubjectCombination({ firstChoice: null, reChoices: [] })).toBe('未填写选科');
  });

  it('ranks subject strengths and weaknesses by score percentage instead of raw score', () => {
    const highlights = getSubjectHighlights({
      firstChoice: 'PHYSICS',
      reChoices: ['CHEM', 'BIO'],
      scoreChinese: 120,
      scoreMath: 100,
      scoreEnglish: 118,
      scoreFirstChoice: 88,
      scoreSub1: 70,
      scoreSub2: 95,
    });

    expect(highlights.strengths.map((item) => `${item.label}:${item.score}`)).toEqual(['生物:95', '物理:88']);
    expect(highlights.weaknesses.map((item) => `${item.label}:${item.score}`)).toEqual(['数学:100', '化学:70']);
  });

  it('ignores missing subject scores when computing highlights', () => {
    const highlights = getSubjectHighlights({
      firstChoice: 'HISTORY',
      reChoices: ['POL', 'GEO'],
      scoreMath: 135,
      scoreFirstChoice: null,
      scoreSub1: undefined,
    });

    expect(highlights.strengths.map((item) => item.label)).toEqual(['数学']);
    expect(highlights.weaknesses).toEqual([]);
  });

  it('summarizes long preference and exclusion lists without losing item count', () => {
    expect(summarizeTags(['成都', '重庆', '杭州', '武汉'], 2)).toBe('成都、重庆等 4 项');
    expect(summarizeTags([], 2)).toBe('暂无');
  });
});
