export interface PreparationPlanLike {
  batchConfig?: {
    maxGroupCount?: number | null;
  } | null;
  batchMaxGroupCount?: number | null;
  maxGroupCount?: number | null;
  version?: number | null;
  versionNo?: number | null;
  status?: string | null;
  isFinal?: boolean | null;
}

export const PREPARATION_TABLE_WIDTH = 707;

function toPositiveInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  return 0;
}

export function getPreparationSlotCount(plan: PreparationPlanLike | undefined, itemCount: number) {
  const batchCount = toPositiveInteger(
    plan?.batchConfig?.maxGroupCount ?? plan?.batchMaxGroupCount ?? plan?.maxGroupCount,
  );
  return Math.max(batchCount, Math.max(0, itemCount));
}

export function getPlanDraftLabel(plan: PreparationPlanLike | undefined) {
  if (plan?.isFinal || plan?.status === 'FINALIZED') return '定稿';

  const version = toPositiveInteger(plan?.versionNo ?? plan?.version) || 1;
  if (version === 1) return '一稿';
  if (version === 2) return '二稿';
  if (version === 3) return '三稿';
  return `第${version}稿`;
}
