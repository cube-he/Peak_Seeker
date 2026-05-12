export interface WorkbenchPlan {
  id: number;
  batchConfigId?: number | null;
  batchName?: string | null;
  batch?: string | null;
  versionNo?: number | null;
  status?: string | null;
  updatedAt?: string | Date | null;
}

export interface WorkbenchBatch {
  batchConfigId: number;
  batchName?: string;
  admissionOrder?: number;
}

export interface CandidateGroupLike {
  groupCode?: string | null;
  groupName?: string | null;
  recruitType?: string | null;
}

export function getLatestPlansByBatch<T extends WorkbenchPlan>(plans: T[]): T[] {
  const byBatch = new Map<string, T>();

  plans.forEach((plan) => {
    const key = plan.batchConfigId ? `batch:${plan.batchConfigId}` : `plan:${plan.id}`;
    const current = byBatch.get(key);
    if (!current) {
      byBatch.set(key, plan);
      return;
    }

    const planVersion = plan.versionNo ?? 1;
    const currentVersion = current.versionNo ?? 1;
    const planTime = plan.updatedAt ? new Date(plan.updatedAt).getTime() : 0;
    const currentTime = current.updatedAt ? new Date(current.updatedAt).getTime() : 0;
    if (planVersion > currentVersion || (planVersion === currentVersion && planTime > currentTime)) {
      byBatch.set(key, plan);
    }
  });

  return Array.from(byBatch.values());
}

export function sortPlansForWorkbench<T extends WorkbenchPlan>(plans: T[], batches: WorkbenchBatch[]): T[] {
  const orderByBatch = new Map(batches.map((batch) => [batch.batchConfigId, batch.admissionOrder ?? 999]));
  return [...plans].sort((a, b) => {
    const ao = a.batchConfigId ? (orderByBatch.get(a.batchConfigId) ?? 999) : 999;
    const bo = b.batchConfigId ? (orderByBatch.get(b.batchConfigId) ?? 999) : 999;
    if (ao !== bo) return ao - bo;
    return (a.batchName ?? a.batch ?? '').localeCompare(b.batchName ?? b.batch ?? '', 'zh-CN');
  });
}

export function findPlanForBatch<T extends WorkbenchPlan>(plans: T[], batchConfigId?: number): T | undefined {
  if (!batchConfigId) return undefined;
  return plans.find((plan) => plan.batchConfigId === batchConfigId);
}

export function formatCandidateGroup(candidate: CandidateGroupLike) {
  const parts = [`专业组 ${candidate.groupCode || '-'}`];
  if (candidate.groupName?.trim()) parts.push(candidate.groupName.trim());
  if (candidate.recruitType?.trim()) parts.push(candidate.recruitType.trim());
  return parts.join(' · ');
}
