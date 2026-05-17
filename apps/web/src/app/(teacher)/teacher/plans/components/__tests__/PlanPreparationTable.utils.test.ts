import {
  getPlanDraftLabel,
  getPreparationSlotCount,
} from '../PlanPreparationTable.utils';

describe('PlanPreparationTable utils', () => {
  it('uses the batch group count as the minimum and extends when saved items exceed it', () => {
    expect(getPreparationSlotCount({ batchConfig: { maxGroupCount: 45 } }, 30)).toBe(45);
    expect(getPreparationSlotCount({ batchConfig: { maxGroupCount: 45 } }, 48)).toBe(48);
  });

  it('falls back to saved item count when the batch group count is missing', () => {
    expect(getPreparationSlotCount({}, 12)).toBe(12);
    expect(getPreparationSlotCount({}, 0)).toBe(0);
  });

  it('labels draft versions and gives finalized plans priority', () => {
    expect(getPlanDraftLabel({ versionNo: 1, status: 'DRAFT' })).toBe('一稿');
    expect(getPlanDraftLabel({ version: 2, status: 'APPROVED' })).toBe('二稿');
    expect(getPlanDraftLabel({ versionNo: 4, status: 'PENDING_REVIEW' })).toBe('第4稿');
    expect(getPlanDraftLabel({ versionNo: 2, status: 'FINALIZED' })).toBe('定稿');
    expect(getPlanDraftLabel({ versionNo: 2, isFinal: true })).toBe('定稿');
  });
});
