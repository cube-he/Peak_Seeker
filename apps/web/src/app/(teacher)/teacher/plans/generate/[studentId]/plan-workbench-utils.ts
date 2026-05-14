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

export interface CandidateGroupMetricLike {
  currentPlanCount?: number | null;
  previousPlanCount?: number | null;
  planCountChange?: number | null;
  currentPlanYear?: number | null;
  previousPlanYear?: number | null;
}

export interface CandidateGroupScoreLike {
  groupMinScore?: number | null;
  groupMinRank?: number | null;
  scoreSource?: 'GROUP' | 'FILING' | 'MAJOR' | 'NONE' | string | null;
}

export interface CandidateGroupSupplementaryLike {
  supplementary?: {
    sourceYear?: number | null;
    scope?: 'UNIVERSITY_BATCH' | 'GROUP' | string | null;
    totalRounds?: number | null;
    totalPlanCount?: number | null;
    supplementaryRate?: number | null;
  } | null;
}

export interface CandidateGroupIdentityLike {
  universityId?: number | null;
  groupCode?: string | null;
}

export interface CandidateMajorForSelection {
  enrollmentPlanId: number;
  majorId: number;
  majorName: string;
  majorCode?: string | null;
  majorCategory?: string | null;
  displaySection?: 'RECOMMENDED' | 'BACKUP' | 'RISK' | string | null;
  displayReason?: string | null;
  majorMinScore?: number | null;
  majorMinRank?: number | null;
  planCount?: number | null;
}

export interface CandidateGroupMajorSelectionLike {
  majors?: CandidateMajorForSelection[] | null;
  majorSections?: {
    recommended?: CandidateMajorForSelection[] | null;
    backup?: CandidateMajorForSelection[] | null;
    risk?: CandidateMajorForSelection[] | null;
  } | null;
}

export interface MajorSelectionPreferences {
  preferredMajors?: string[] | null;
  preferredMajorCategories?: string[] | null;
}

export interface SelectedPlanMajorPayload {
  order: number;
  enrollmentPlanId: number;
  majorId: number;
  majorName: string;
  majorCode?: string | null;
  displaySection?: string | null;
  displayReason?: string | null;
  majorMinScore?: number | null;
  majorMinRank?: number | null;
  planCount?: number | null;
}

export interface PlanMajorRankingLike {
  selectedMajors?: SelectedPlanMajorPayload[] | null;
  candidateMajorRanking?: SelectedPlanMajorPayload[] | null;
}

export interface PlanItemMajorSelectionLike {
  selectedMajors?: SelectedPlanMajorPayload[] | null;
  fullMajorRanking?: PlanMajorRankingLike | null;
}

export interface PlanMajorSelectionRow extends SelectedPlanMajorPayload {
  isSelected: boolean;
}

export interface WorkbenchPlanDetailLike {
  planItems?: CandidateGroupIdentityLike[] | null;
  items?: CandidateGroupIdentityLike[] | null;
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

export function formatGroupPlanChange(group: CandidateGroupMetricLike): { text: string; tone: 'up' | 'down' | 'flat' } {
  const currentYear = group.currentPlanYear ?? '当前';
  const previousYear = group.previousPlanYear ?? '去年';
  const currentCount = group.currentPlanCount;

  if (currentCount == null) {
    return { text: `${currentYear} 招生人数暂无`, tone: 'flat' };
  }

  if (group.previousPlanCount == null || group.planCountChange == null) {
    return { text: `${currentYear} 招生 ${currentCount} 人，暂无 ${previousYear} 对比`, tone: 'flat' };
  }

  const change = group.planCountChange;
  const tone = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  const signed = change > 0 ? `+${change}` : String(change);
  return { text: `${currentYear} 招生 ${currentCount} 人，较 ${previousYear} ${signed}`, tone };
}

export function formatGroupScoreLine(group: CandidateGroupScoreLike) {
  if (group.groupMinScore == null && group.groupMinRank == null) return '暂无分数线';
  const sourceLabel: Record<string, string> = {
    GROUP: '专业组线',
    FILING: '投档线',
    MAJOR: '组内专业线',
    NONE: '分数线',
  };
  const label = sourceLabel[group.scoreSource || 'NONE'] ?? '分数线';
  const parts = [];
  if (group.groupMinScore != null) parts.push(`${group.groupMinScore} 分`);
  if (group.groupMinRank != null) parts.push(`${group.groupMinRank.toLocaleString()} 位`);
  return `${label} ${parts.join(' / ')}`;
}

export function formatRankGap(
  studentRank?: number | null,
  adjustedRank?: number | null,
): { text: string; tone: 'ahead' | 'behind' | 'flat' } {
  if (!studentRank || !adjustedRank) return { text: '暂无位次差', tone: 'flat' };
  const gap = adjustedRank - studentRank;
  if (gap > 0) return { text: `领先 ${gap.toLocaleString()} 名`, tone: 'ahead' };
  if (gap < 0) return { text: `落后 ${Math.abs(gap).toLocaleString()} 名`, tone: 'behind' };
  return { text: '位次持平', tone: 'flat' };
}

export function hasSupplementaryData(group: CandidateGroupSupplementaryLike) {
  const detail = group.supplementary;
  return Boolean((detail?.totalPlanCount ?? 0) > 0 || (detail?.totalRounds ?? 0) > 0);
}

export function formatSupplementary(group: CandidateGroupSupplementaryLike) {
  const detail = group.supplementary;
  if (!hasSupplementaryData(group)) return '征集暂无/未导入';
  const rate = detail?.supplementaryRate == null
    ? ''
    : `，征集率 ${(detail.supplementaryRate > 1 ? detail.supplementaryRate : detail.supplementaryRate * 100).toFixed(1)}%`;
  const label = detail?.scope === 'UNIVERSITY_BATCH' ? '院校批次征集' : '征集';
  return `${detail?.sourceYear ?? ''} ${label} ${detail?.totalPlanCount ?? '-'} 人，${detail?.totalRounds ?? '-'} 轮${rate}`;
}

export function isCandidateGroupAlreadyAdded(
  group: CandidateGroupIdentityLike,
  planItems: CandidateGroupIdentityLike[] | undefined,
) {
  if (!group.universityId || !planItems?.length) return false;
  return planItems.some(
    (item) => item.universityId === group.universityId && (item.groupCode || '') === (group.groupCode || ''),
  );
}

export function getPlanItemsForWorkbench(plan?: WorkbenchPlanDetailLike | null) {
  if (Array.isArray(plan?.planItems)) return plan.planItems;
  if (Array.isArray(plan?.items)) return plan.items;
  return [];
}

function uniqueMajors(majors: CandidateMajorForSelection[]) {
  const seen = new Set<number>();
  return majors.filter((major) => {
    if (seen.has(major.enrollmentPlanId)) return false;
    seen.add(major.enrollmentPlanId);
    return true;
  });
}

function orderedMajors(group: CandidateGroupMajorSelectionLike) {
  if (group.majors?.length) return uniqueMajors(group.majors);
  return uniqueMajors([
    ...(group.majorSections?.recommended ?? []),
    ...(group.majorSections?.backup ?? []),
    ...(group.majorSections?.risk ?? []),
  ]);
}

function toSelectedMajor(major: CandidateMajorForSelection, order: number): SelectedPlanMajorPayload {
  return {
    order,
    enrollmentPlanId: major.enrollmentPlanId,
    majorId: major.majorId,
    majorName: major.majorName,
    majorCode: major.majorCode ?? null,
    displaySection: major.displaySection ?? null,
    displayReason: major.displayReason ?? null,
    majorMinScore: major.majorMinScore ?? null,
    majorMinRank: major.majorMinRank ?? null,
    planCount: major.planCount ?? null,
  };
}

function normalizeSelectedMajors(majors: SelectedPlanMajorPayload[]) {
  return majors.map((major, index) => ({ ...major, order: index + 1 }));
}

export function getPlanItemMajorSelection(item: PlanItemMajorSelectionLike) {
  const ranking = item.fullMajorRanking ?? null;
  const selectedMajors = normalizeSelectedMajors([
    ...(ranking?.selectedMajors ?? item.selectedMajors ?? []),
  ]);
  const candidateMajorRanking = normalizeSelectedMajors([
    ...(ranking?.candidateMajorRanking ?? []),
  ]);
  const selectedIds = new Set(selectedMajors.map((major) => major.enrollmentPlanId));
  const rows: PlanMajorSelectionRow[] = [
    ...selectedMajors.map((major) => ({ ...major, isSelected: true })),
    ...candidateMajorRanking
      .filter((major) => !selectedIds.has(major.enrollmentPlanId))
      .map((major) => ({ ...major, isSelected: false })),
  ];

  return {
    canEdit: candidateMajorRanking.length > 0 && selectedMajors.length > 0,
    selectedMajors,
    candidateMajorRanking,
    rows,
  };
}

export function togglePlanMajorSelection(
  selectedMajors: SelectedPlanMajorPayload[],
  major: SelectedPlanMajorPayload,
  selected: boolean,
) {
  const exists = selectedMajors.some((item) => item.enrollmentPlanId === major.enrollmentPlanId);
  if (selected) {
    if (exists || selectedMajors.length >= 6) return normalizeSelectedMajors([...selectedMajors]);
    return normalizeSelectedMajors([...selectedMajors, major]);
  }
  return normalizeSelectedMajors(
    selectedMajors.filter((item) => item.enrollmentPlanId !== major.enrollmentPlanId),
  );
}

export function movePlanMajorSelection(
  selectedMajors: SelectedPlanMajorPayload[],
  enrollmentPlanId: number,
  direction: 'up' | 'down',
) {
  const next = [...selectedMajors];
  const index = next.findIndex((major) => major.enrollmentPlanId === enrollmentPlanId);
  const target = direction === 'up' ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= next.length) {
    return normalizeSelectedMajors(next);
  }
  [next[index], next[target]] = [next[target], next[index]];
  return normalizeSelectedMajors(next);
}

function preferenceTier(major: CandidateMajorForSelection, preferences: MajorSelectionPreferences) {
  const preferredMajors = preferences.preferredMajors ?? [];
  const preferredCategories = preferences.preferredMajorCategories ?? [];
  const isRisk = major.displaySection === 'RISK';
  if (!isRisk && preferredMajors.includes(major.majorName)) return 0;
  if (!isRisk && major.majorCategory && preferredCategories.includes(major.majorCategory)) return 1;
  if (!isRisk && major.displaySection === 'RECOMMENDED') return 2;
  if (!isRisk && major.displaySection === 'BACKUP') return 3;
  return 4;
}

export function getMajorGroupSelectionPayload(
  group: CandidateGroupMajorSelectionLike,
  preferences: MajorSelectionPreferences = {},
) {
  const allMajors = orderedMajors(group);
  const candidateMajorRanking = allMajors.map((major, index) => toSelectedMajor(major, index + 1));
  const hasPreference = Boolean(preferences.preferredMajors?.length || preferences.preferredMajorCategories?.length);
  const selectedSource = allMajors.length <= 6 || !hasPreference
    ? allMajors.slice(0, 6)
    : [...allMajors]
      .map((major, index) => ({ major, index }))
      .sort((a, b) => preferenceTier(a.major, preferences) - preferenceTier(b.major, preferences) || a.index - b.index)
      .slice(0, 6)
      .map((item) => item.major);

  return {
    selectedMajors: selectedSource.map((major, index) => toSelectedMajor(major, index + 1)),
    candidateMajorRanking,
  };
}
