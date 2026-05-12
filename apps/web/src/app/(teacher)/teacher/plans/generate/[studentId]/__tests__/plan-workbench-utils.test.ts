import {
  findPlanForBatch,
  formatCandidateGroup,
  formatGroupPlanChange,
  formatGroupScoreLine,
  formatRankGap,
  formatSupplementary,
  getPlanItemsForWorkbench,
  getLatestPlansByBatch,
  hasSupplementaryData,
  isCandidateGroupAlreadyAdded,
  sortPlansForWorkbench,
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
});
