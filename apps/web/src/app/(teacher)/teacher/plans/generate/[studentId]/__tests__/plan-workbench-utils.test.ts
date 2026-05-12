import {
  findPlanForBatch,
  formatCandidateGroup,
  getLatestPlansByBatch,
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
});
