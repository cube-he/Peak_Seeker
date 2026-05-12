'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Modal,
  Pagination,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  CheckOutlined,
  DeleteOutlined,
  DownOutlined,
  FileTextOutlined,
  PlusOutlined,
  SendOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type EligibleBatch } from '@/services/student-api';
import { planApi, type CandidateGroupSort } from '@/services/plan-api';
import {
  findPlanForBatch,
  formatCandidateGroup,
  formatGroupPlanChange,
  formatGroupScoreLine,
  formatRankGap,
  formatSupplementary,
  getLatestPlansByBatch,
  getPlanItemsForWorkbench,
  hasSupplementaryData,
  isCandidateGroupAlreadyAdded,
  sortPlansForWorkbench,
  type WorkbenchPlan,
} from './plan-workbench-utils';

type Gradient = 'CHONG' | 'WEN' | 'BAO';
type DynamicGradientTier =
  | 'JI_CHONG'
  | 'CHONG'
  | 'XIAO_CHONG'
  | 'WEN'
  | 'WEN_BAO'
  | 'BAO'
  | 'QIANG_BAO'
  | 'DIBAO';
type MatchStatus = 'PASS' | 'SOFT_FAIL';

interface DynamicGradientDetail {
  gradient: Gradient;
  tier: DynamicGradientTier;
  baseMinRank?: number | null;
  adjustedMinRank?: number | null;
  rankGapRatio?: number | null;
  reasons?: string[];
}

interface CompetitionDetail {
  currentYear?: number | null;
  previousYear?: number | null;
  currentCount?: number | null;
  previousCount?: number | null;
  currentBatchLineScore?: number | null;
  previousBatchLineScore?: number | null;
}

interface SelectionCompetitionDetail {
  sourceYear?: number | null;
  sourceType?: string | null;
  firstChoice?: string | null;
  requiredSubjects?: string[];
  eligibleCount?: number | null;
  subjectCount?: number | null;
}

interface SupplementaryDetail {
  sourceYear?: number | null;
  scope?: 'UNIVERSITY_BATCH' | 'GROUP' | string | null;
  totalRounds?: number | null;
  totalPlanCount?: number | null;
  supplementaryRate?: number | null;
}

interface FailReason {
  rule: string;
  note: string;
  severity?: string;
}

interface CandidateMajor {
  enrollmentPlanId: number;
  majorId: number;
  majorCode?: string | null;
  majorName: string;
  majorCategory?: string | null;
  discipline?: string | null;
  softRating?: string | null;
  majorStrengthScore?: number | null;
  description?: string | null;
  careerDirections?: string[] | null;
  postgraduateDirections?: string[] | null;
  coreCourses?: string[] | null;
  employmentRate?: number | string | null;
  avgSalary?: number | string | null;
  degree?: string | null;
  standardDuration?: string | null;
  satisfactionScore?: number | null;
  localMasterPoint?: boolean | null;
  localDoctoralPoint?: boolean | null;
  planCount?: number | null;
  tuition?: number | null;
  duration?: string | null;
  subjectRequirements?: string | null;
  disciplineEval?: string | null;
  isNationalFeature?: boolean | null;
  majorRanking?: string | null;
  majorHonor?: string | null;
  planNotes?: string | null;
  isSinoForeign?: boolean | null;
  majorMinScore?: number | null;
  majorMinRank?: number | null;
  majorAdmissionCount?: number | null;
  previousMajorMinScore?: number | null;
  previousMajorMinRank?: number | null;
  previousMajorAdmissionCount?: number | null;
  matchScore?: number | null;
  matchReasons?: string[];
  dynamicGradient?: DynamicGradientDetail | null;
  suggestedGradient: Gradient;
  matchStatus: MatchStatus;
  failReasons: FailReason[];
  isRecommendedAnchor?: boolean;
}

interface CandidateGroup {
  groupKey: string;
  universityId: number;
  universityName: string;
  universityCode?: string | null;
  university?: {
    is985?: boolean;
    is211?: boolean;
    isDoubleFirstClass?: boolean;
    softRanking?: number | null;
    runningNature?: string | null;
    province?: string | null;
    city?: string | null;
  };
  groupCode?: string | null;
  groupName?: string | null;
  batch?: string | null;
  recruitType?: string | null;
  subjects?: string | null;
  currentPlanYear?: number | null;
  previousPlanYear?: number | null;
  currentPlanCount?: number | null;
  previousPlanCount?: number | null;
  planCountChange?: number | null;
  groupMinScore?: number | null;
  groupMinRank?: number | null;
  groupAdmissionCount?: number | null;
  scoreSource?: 'GROUP' | 'FILING' | 'MAJOR' | 'NONE' | string | null;
  predictedMinRank?: {
    point?: number | null;
    conservative?: number | null;
    optimistic?: number | null;
    confidence?: string | null;
    targetYear?: number | null;
  } | null;
  dynamicGradient?: DynamicGradientDetail | null;
  competition?: CompetitionDetail | null;
  selectionCompetition?: SelectionCompetitionDetail | null;
  supplementary?: SupplementaryDetail | null;
  suggestedGradient: Gradient;
  majorCount: number;
  selectableMajorCount: number;
  softFailCount: number;
  matchScore?: number | null;
  matchReasons?: string[];
  universityRank?: number | null;
  anchorMajorMinScore?: number | null;
  anchorMajorMinRank?: number | null;
  majorStrengthScore?: number | null;
  recommendedAnchorEnrollmentPlanId?: number | null;
  majors: CandidateMajor[];
}

interface CandidateGroupListResult {
  groups: CandidateGroup[];
  total: number;
  planYear?: number;
  sourceYear?: number;
  previousYear?: number;
  sourceBatchName?: string;
  isFallbackYear?: boolean;
  studentRankUsed?: number;
  studentRankSource?: 'PROFILE' | 'SCORE_SEGMENT' | 'MISSING' | string;
  storedRank?: number | null;
  scoreBasedRank?: number | null;
}

const GRADIENT_LABEL: Record<DynamicGradientTier, string> = {
  JI_CHONG: '极冲',
  CHONG: '冲',
  XIAO_CHONG: '小冲',
  WEN: '稳',
  WEN_BAO: '稳保',
  BAO: '保',
  QIANG_BAO: '强保',
  DIBAO: '兜底',
};

const GRADIENT_COLOR: Record<DynamicGradientTier, string> = {
  JI_CHONG: 'magenta',
  CHONG: 'red',
  XIAO_CHONG: 'orange',
  WEN: 'blue',
  WEN_BAO: 'geekblue',
  BAO: 'green',
  QIANG_BAO: 'cyan',
  DIBAO: 'lime',
};

const CANDIDATE_SORT_OPTIONS: Array<{ label: string; value: CandidateGroupSort }> = [
  { label: '综合推荐', value: 'MAJOR_MATCH' },
  { label: '位次更接近', value: 'RANK_FIT' },
  { label: '专业最低分高', value: 'MAJOR_MIN_SCORE_DESC' },
  { label: '学校排名优先', value: 'UNIVERSITY_RANK' },
  { label: '专业实力优先', value: 'MAJOR_STRENGTH' },
  { label: '招生人数多', value: 'PLAN_COUNT_DESC' },
  { label: '征集比例高', value: 'SUPPLEMENTARY_RATE_DESC' },
  { label: '安全程度高', value: 'SAFETY_DESC' },
];

function unwrap<T>(value: any): T {
  return (value?.data ?? value) as T;
}

function formatValue(value?: number | string | null, suffix = '') {
  if (value === null || value === undefined || value === '') return '-';
  return `${typeof value === 'number' ? value.toLocaleString() : value}${suffix}`;
}

function renderTags(values?: string[] | null, color: string = 'default') {
  const items = Array.isArray(values) ? values.filter(Boolean).slice(0, 10) : [];
  if (!items.length) return <span className="text-text-faint">暂无</span>;
  return (
    <Space size={[4, 6]} wrap>
      {items.map((value) => (
        <Tag key={value} color={color} className="m-0">{value}</Tag>
      ))}
    </Space>
  );
}

function gradientTier(item: { suggestedGradient?: Gradient; dynamicGradient?: DynamicGradientDetail | null }): DynamicGradientTier {
  return item.dynamicGradient?.tier ?? item.suggestedGradient ?? 'WEN';
}

function formatDynamicRank(detail?: DynamicGradientDetail | null) {
  if (!detail?.adjustedMinRank) return '-';
  const base = detail.baseMinRank ? `历史 ${detail.baseMinRank.toLocaleString()} 位` : '历史 -';
  return `${base} / 修正 ${detail.adjustedMinRank.toLocaleString()} 位`;
}

function formatCompetition(group: CandidateGroup) {
  const current = group.competition?.currentCount;
  const previous = group.competition?.previousCount;
  if (!current && !previous) return '竞争池暂无';
  return `${group.competition?.currentYear ?? '今年'} ${current ? current.toLocaleString() : '-'} / ${group.competition?.previousYear ?? '去年'} ${previous ? previous.toLocaleString() : '-'}`;
}

function formatSelectionCompetition(group: CandidateGroup) {
  const detail = group.selectionCompetition;
  if (!detail?.eligibleCount) return '选科池暂无';
  const source = detail.sourceType === 'PUBLIC_ESTIMATE' ? `${detail.sourceYear} 参考` : detail.sourceYear ?? '当前';
  return `选科池 ${detail.eligibleCount.toLocaleString()} 人 (${source})`;
}

function formatRankValue(value?: number | null) {
  return value ? `${value.toLocaleString()} 位` : '-';
}

function formatScoreValue(value?: number | null) {
  return value == null ? '-' : `${value} 分`;
}

function formatScoreRankValue(score?: number | null, rank?: number | null) {
  return `${formatScoreValue(score)} / ${formatRankValue(rank)}`;
}

function formatTuition(value?: number | null) {
  return value ? `${value.toLocaleString()} 元/年` : '-';
}

function getAnchorMajor(group: CandidateGroup) {
  return group.majors.find((major) => major.enrollmentPlanId === group.recommendedAnchorEnrollmentPlanId) ?? group.majors[0];
}

function getAdjustedRank(group: CandidateGroup, major?: CandidateMajor | null) {
  return major?.dynamicGradient?.adjustedMinRank ?? group.dynamicGradient?.adjustedMinRank ?? group.predictedMinRank?.point ?? null;
}

function getRiskToneClass(tone: 'ahead' | 'behind' | 'flat') {
  if (tone === 'ahead') return 'border-safe/30 bg-safe-fixed text-safe';
  if (tone === 'behind') return 'border-rush/30 bg-rush-fixed text-rush';
  return 'border-border-subtle bg-surface-dim text-text-tertiary';
}

function getAddActionLabel(group: CandidateGroup, major?: CandidateMajor, added?: boolean) {
  if (added) return '已在方案';
  if (!major) return '暂无可加入专业';
  if (major.matchStatus === 'SOFT_FAIL' || group.softFailCount > 0) return '确认风险后加入';
  return '加入推荐专业';
}

function getDecisionText(group: CandidateGroup, major: CandidateMajor | undefined, studentRank?: number | null) {
  const gap = formatRankGap(studentRank, getAdjustedRank(group, major));
  if (gap.tone === 'behind') return `${gap.text}，建议只作冲档或备选，加入前必须复核风险。`;
  if (major?.matchStatus === 'SOFT_FAIL') return `${gap.text}，位次可参考，但该专业命中软性风险。`;
  if (gap.tone === 'ahead') return `${gap.text}，可进入正式推荐，仍需确认专业排序。`;
  return '位次口径不足，先复核分数线、招生计划和专业限制。';
}

function riskReviewItems(group: CandidateGroup, major: CandidateMajor | undefined, studentRank?: number | null) {
  const planChange = formatGroupPlanChange(group);
  const adjustedRank = getAdjustedRank(group, major);
  const gap = formatRankGap(studentRank, adjustedRank);
  const supplementaryScope = group.supplementary?.scope;
  return [
    {
      title: '位次风险',
      tone: gap.tone === 'behind' ? 'danger' : gap.tone === 'ahead' ? 'ok' : 'warn',
      content: adjustedRank
        ? `排序位次 ${formatRankValue(studentRank)}，修正位次 ${formatRankValue(adjustedRank)}，${gap.text}。`
        : '暂无修正位次，不能只按分数判断风险。',
    },
    {
      title: '招生计划变化',
      tone: planChange.tone === 'down' ? 'warn' : 'ok',
      content: planChange.text,
    },
    {
      title: '专业组结构',
      tone: group.softFailCount > 0 ? 'warn' : 'ok',
      content: `${group.majorCount} 个专业，${group.selectableMajorCount} 个可选，${group.softFailCount} 个软性风险专业。`,
    },
    {
      title: '选科/限制',
      tone: major?.matchStatus === 'SOFT_FAIL' ? 'danger' : 'ok',
      content: major?.failReasons?.length
        ? major.failReasons.map((reason) => reason.note).join('；')
        : major?.subjectRequirements || group.subjects || '未命中软限制风险。',
    },
    {
      title: '征集参考',
      tone: supplementaryScope === 'UNIVERSITY_BATCH' ? 'warn' : hasSupplementaryData(group) ? 'warn' : 'ok',
      content: supplementaryScope === 'UNIVERSITY_BATCH'
        ? `${formatSupplementary(group)}，仅说明院校批次曾有余缺，不能直接降低本专业组风险。`
        : formatSupplementary(group),
    },
  ];
}

function MetricTile({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className="min-w-0 rounded-md border border-border-subtle bg-surface-dim px-3 py-2">
      <div className="text-xs text-text-faint">{label}</div>
      <div className="mt-1 break-words text-sm font-semibold leading-snug text-text">{value}</div>
      {note ? <div className="mt-1 line-clamp-2 text-xs text-text-tertiary">{note}</div> : null}
    </div>
  );
}

function EvidenceItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-t border-border-subtle pt-2 text-sm">
      <div className="text-xs text-text-faint">{label}</div>
      <div className="mt-1 line-clamp-2 text-text-secondary">{children}</div>
    </div>
  );
}

function UniversityBadges({ group }: { group: CandidateGroup }) {
  const tags = [
    group.university?.is985 ? '985' : null,
    group.university?.is211 ? '211' : null,
    group.university?.isDoubleFirstClass ? '双一流' : null,
    group.university?.runningNature,
  ].filter(Boolean);
  if (!tags.length) return null;
  return (
    <Space size={4} wrap>
      {tags.map((tag) => <Tag key={String(tag)} className="m-0">{tag}</Tag>)}
    </Space>
  );
}

export default function GeneratePlanPage() {
  const params = useParams<{ studentId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const studentId = params.studentId;
  const [batchConfigId, setBatchConfigId] = useState<number>();
  const [planId, setPlanId] = useState<number | undefined>(() => {
    const existingPlanId = Number(searchParams.get('planId'));
    return Number.isFinite(existingPlanId) && existingPlanId > 0 ? existingPlanId : undefined;
  });
  const [keyword, setKeyword] = useState('');
  const [searchText, setSearchText] = useState('');
  const [includeSoftFails, setIncludeSoftFails] = useState(true);
  const [candidateSort, setCandidateSort] = useState<CandidateGroupSort>('MAJOR_MATCH');
  const [candidatePage, setCandidatePage] = useState(1);
  const [expandedGroupKeys, setExpandedGroupKeys] = useState<string[]>([]);
  const [activeDetail, setActiveDetail] = useState<{ group: CandidateGroup; major: CandidateMajor } | null>(null);
  const candidatePageSize = 12;

  const { data: studentData, isLoading: studentLoading } = useQuery({
    queryKey: ['student-detail', studentId],
    queryFn: () => studentApi.getById(studentId),
  });
  const student = unwrap<Record<string, any>>(studentData);

  const { data: batchData, isLoading: batchLoading } = useQuery({
    queryKey: ['eligible-batches', studentId],
    queryFn: () => studentApi.getEligibleBatches(studentId),
  });
  const batches = unwrap<EligibleBatch[]>(batchData) ?? [];

  const { data: existingPlanData, isLoading: existingPlansLoading } = useQuery({
    queryKey: ['student-plans-latest', studentId],
    queryFn: () => planApi.listForStudent(studentId, { latest: true }),
  });
  const existingPlanRows = unwrap<WorkbenchPlan[]>(existingPlanData) ?? [];
  const existingPlans = useMemo(
    () => sortPlansForWorkbench(getLatestPlansByBatch(existingPlanRows), batches),
    [existingPlanRows, batches],
  );

  const { data: planData, isFetching: planFetching } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => planApi.getById(String(planId)),
    enabled: !!planId,
  });
  const plan = unwrap<Record<string, any>>(planData);
  const planItems = getPlanItemsForWorkbench(plan);

  const { data: groupData, isFetching: groupLoading } = useQuery({
    queryKey: ['plan-candidate-groups', planId, keyword, includeSoftFails, candidateSort, candidatePage],
    queryFn: () => planApi.getCandidateGroups(planId!, {
      page: candidatePage,
      pageSize: candidatePageSize,
      keyword,
      includeSoftFails,
      sort: candidateSort,
    }),
    enabled: !!planId,
  });
  const candidateGroups = unwrap<CandidateGroupListResult>(groupData);
  const groups = candidateGroups?.groups ?? [];
  const isUsingFallbackYear = Boolean(candidateGroups?.isFallbackYear && candidateGroups.sourceYear && candidateGroups.planYear);
  const isUsingScoreBasedRank = Boolean(
    candidateGroups?.studentRankSource === 'SCORE_SEGMENT' &&
    candidateGroups.scoreBasedRank &&
    candidateGroups.storedRank &&
    candidateGroups.scoreBasedRank !== candidateGroups.storedRank,
  );
  const rawStudentRank = Number(student?.provincialRank);
  const rawStudentScore = Number(student?.totalScore);
  const studentRankForDecision = candidateGroups?.studentRankUsed ?? (Number.isFinite(rawStudentRank) && rawStudentRank > 0 ? rawStudentRank : undefined);
  const studentScoreForDecision = Number.isFinite(rawStudentScore) ? rawStudentScore : undefined;

  const selectedBatchPlan = useMemo(
    () => findPlanForBatch(existingPlans, batchConfigId),
    [existingPlans, batchConfigId],
  );

  useEffect(() => {
    if (!planId && existingPlans.length > 0) {
      const firstPlan = existingPlans[0];
      setPlanId(firstPlan.id);
      setBatchConfigId(firstPlan.batchConfigId ?? undefined);
    }
  }, [existingPlans, planId]);

  useEffect(() => {
    setCandidatePage(1);
    setExpandedGroupKeys([]);
  }, [planId, keyword, includeSoftFails, candidateSort]);

  const createMutation = useMutation({
    mutationFn: () => planApi.createForStudent(studentId, { batchConfigId: batchConfigId! }),
    onSuccess: (res) => {
      const created = unwrap<Record<string, any>>(res);
      setPlanId(created.id);
      setBatchConfigId(created.batchConfigId ?? batchConfigId);
      queryClient.invalidateQueries({ queryKey: ['student-plans-latest', studentId] });
      void message.success('方案草稿已就绪');
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '创建方案失败');
    },
  });

  const addMutation = useMutation({
    mutationFn: ({ group, major }: { group: CandidateGroup; major: CandidateMajor }) =>
      planApi.addItem(planId!, {
        enrollmentPlanId: major.enrollmentPlanId,
        gradient: major.suggestedGradient ?? group.suggestedGradient,
        selectionReason: [
          `锚定专业：${major.majorName}`,
          ...(group.dynamicGradient?.reasons ?? []),
          ...(group.matchReasons ?? []),
          ...(major.matchReasons ?? []),
        ].filter(Boolean).join('；'),
        softFailReasons: major.failReasons,
        softFailOverrideConfirmed: major.matchStatus === 'SOFT_FAIL' ? true : undefined,
        overrideReason: major.matchStatus === 'SOFT_FAIL' ? '老师确认后覆盖软限制加入' : undefined,
      }),
    onSuccess: () => {
      void message.success('已加入当前方案');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '加入失败');
    },
  });

  const submitMutation = useMutation({
    mutationFn: () => planApi.submitForReview(String(planId)),
    onSuccess: () => {
      void message.success('已提交主管审核');
      router.push(`/teacher/plans/${planId}`);
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '提交审核失败');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (itemId: number) => planApi.deleteItem(String(planId), itemId),
    onSuccess: () => {
      void message.success('已移出方案');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (error: any) => {
      void message.error(error?.response?.data?.message ?? '移出失败');
    },
  });

  const batchOptions = useMemo(
    () =>
      batches.map((b) => {
        const existingPlan = findPlanForBatch(existingPlans, b.batchConfigId);
        const suffix = existingPlan ? ` · 已有V${existingPlan.versionNo ?? 1}` : '';
        return { label: `${b.batchName}（${b.maxGroupCount}组）${suffix}`, value: b.batchConfigId };
      }),
    [batches, existingPlans],
  );

  const openPlan = (nextPlan: WorkbenchPlan) => {
    setPlanId(nextPlan.id);
    setBatchConfigId(nextPlan.batchConfigId ?? undefined);
  };

  const openOrCreatePlan = () => {
    if (!batchConfigId) return;
    if (selectedBatchPlan) {
      openPlan(selectedBatchPlan);
      void message.success('已打开已有方案');
      return;
    }
    createMutation.mutate();
  };

  const toggleGroup = (key: string) => {
    setExpandedGroupKeys((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key],
    );
  };

  const addCandidateGroup = (group: CandidateGroup, major: CandidateMajor) => {
    if (isCandidateGroupAlreadyAdded(group, planItems)) {
      void message.warning('该专业组已经在当前方案中');
      return;
    }
    if (major.matchStatus === 'SOFT_FAIL') {
      Modal.confirm({
        title: '确认加入存在风险的专业组？',
        content: major.failReasons.map((r) => r.note).join('；') || '该专业存在软限制风险。',
        okText: '确认加入',
        cancelText: '取消',
        onOk: () => addMutation.mutate({ group, major }),
      });
      return;
    }
    addMutation.mutate({ group, major });
  };

  const majorColumns = (group: CandidateGroup): ColumnsType<CandidateMajor> => [
    {
      title: '专业名称',
      key: 'major',
      render: (_, major) => (
        <button
          type="button"
          className="text-left text-primary hover:text-primary-light"
          onClick={() => setActiveDetail({ group, major })}
        >
          <span className="font-medium">{major.majorName}</span>
          {major.majorCode ? <span className="ml-2 font-mono text-xs text-text-tertiary">{major.majorCode}</span> : null}
          {major.isRecommendedAnchor ? <Tag color="gold" className="ml-2">推荐锚定</Tag> : null}
        </button>
      ),
    },
    {
      title: '最低分 / 位次',
      width: 150,
      render: (_, major) => <span>{formatScoreRankValue(major.majorMinScore, major.majorMinRank)}</span>,
    },
    {
      title: '招生计划',
      dataIndex: 'planCount',
      width: 90,
      render: (value) => formatValue(value, '人'),
    },
    {
      title: '学制 / 学费',
      width: 130,
      render: (_, major) => (
        <div className="text-sm">
          <div>{major.standardDuration || major.duration || '-'}</div>
          <div className="text-xs text-text-tertiary">{formatTuition(major.tuition)}</div>
        </div>
      ),
    },
    {
      title: '匹配状态',
      width: 100,
      render: (_, major) => major.matchStatus === 'SOFT_FAIL'
        ? <Tag icon={<WarningOutlined />} color="warning">有风险</Tag>
        : <Tag color="success">可选</Tag>,
    },
    {
      title: '梯度',
      width: 90,
      render: (_, major) => (
        <Space size={4} wrap>
          <Tag color={GRADIENT_COLOR[gradientTier(major)]}>{GRADIENT_LABEL[gradientTier(major)]}</Tag>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 160,
      render: (_, major) => {
        const added = isCandidateGroupAlreadyAdded(group, planItems);
        return (
          <Space size={6}>
            <Button size="small" onClick={() => setActiveDetail({ group, major })}>详情</Button>
            <Button
              size="small"
              type="primary"
              icon={<PlusOutlined />}
              disabled={added}
              loading={addMutation.isPending}
              onClick={() => addCandidateGroup(group, major)}
            >
              {added ? '已加入' : '加入'}
            </Button>
          </Space>
        );
      },
    },
  ];

  if (studentLoading) {
    return <div className="py-24 text-center"><Spin size="large" /></div>;
  }

  return (
    <div className="space-y-5">
      <Link href={`/teacher/students/${studentId}`} className="inline-flex items-center gap-2 text-sm text-text-tertiary no-underline">
        <ArrowLeftOutlined /> 返回学生详情
      </Link>

      <section className="rounded-lg bg-surface p-5 shadow-card">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <Descriptions title="生成方案工作台" size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
            <Descriptions.Item label="学生">{student?.user?.realName || student?.realName || student?.user?.username}</Descriptions.Item>
            <Descriptions.Item label="总分">{student?.totalScore ?? '-'}</Descriptions.Item>
            <Descriptions.Item label={isUsingScoreBasedRank ? '档案位次' : '位次'}>
              <Space size={6} wrap>
                <span>{student?.provincialRank ?? '-'}</span>
                {isUsingScoreBasedRank && candidateGroups?.scoreBasedRank ? (
                  <Tag color="warning" className="m-0">排序用 {candidateGroups.scoreBasedRank.toLocaleString()}</Tag>
                ) : null}
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="资料状态">{student?.intakeStatus || 'DRAFT'}</Descriptions.Item>
          </Descriptions>
          <Space wrap>
            <Select
              placeholder="选择批次"
              value={batchConfigId}
              loading={batchLoading}
              options={batchOptions}
              onChange={setBatchConfigId}
              className="min-w-[280px]"
            />
            <Button
              type="primary"
              icon={<FileTextOutlined />}
              disabled={!batchConfigId || student?.intakeStatus !== 'VERIFIED'}
              loading={createMutation.isPending}
              onClick={openOrCreatePlan}
            >
              {selectedBatchPlan ? '打开已有方案' : '创建方案草稿'}
            </Button>
            {planId ? (
              <>
                <Button onClick={() => router.push(`/teacher/plans/${planId}`)}>查看详情</Button>
                <Button
                  type="primary"
                  icon={<SendOutlined />}
                  disabled={plan?.status !== 'DRAFT' || !planItems.length}
                  loading={submitMutation.isPending}
                  onClick={() => submitMutation.mutate()}
                >
                  提交审核
                </Button>
              </>
            ) : null}
          </Space>
        </div>
        {student?.intakeStatus !== 'VERIFIED' ? (
          <Alert className="mt-4" type="warning" showIcon message="学生资料尚未确认，需要先在学生详情页完成资料审核。" />
        ) : null}
        <div className="mt-4 border-t border-border-subtle pt-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-medium text-text">已有方案</span>
            {existingPlansLoading ? <span className="text-xs text-text-tertiary">加载中...</span> : null}
          </div>
          {existingPlans.length ? (
            <Space wrap>
              {existingPlans.map((existingPlan) => {
                const batchName = existingPlan.batchName ?? existingPlan.batch ?? `批次 ${existingPlan.batchConfigId ?? existingPlan.id}`;
                return (
                  <Button
                    key={existingPlan.id}
                    type={existingPlan.id === planId ? 'primary' : 'default'}
                    onClick={() => openPlan(existingPlan)}
                  >
                    {batchName} · V{existingPlan.versionNo ?? 1} · {existingPlan.status ?? 'DRAFT'}
                  </Button>
                );
              })}
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无已创建方案" />
          )}
        </div>
      </section>

      {planId ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 rounded-lg border border-border bg-surface-high shadow-card">
            <div className="border-b border-border-subtle px-4 py-4">
              <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end">
                <div>
                  <h2 className="m-0 text-lg font-semibold text-text">院校专业组候选池</h2>
                  <p className="m-0 mt-1 text-sm text-text-tertiary">
                    按后端候选结果展示专业组，排序参考位次、专业匹配、计划变化、竞争池、选科池和征集口径。
                  </p>
                </div>
                <Space wrap>
                  <Input.Search
                    placeholder="院校/专业/专业组"
                    allowClear
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    onSearch={setKeyword}
                    className="w-[240px]"
                  />
                  <Select
                    value={candidateSort}
                    onChange={(value: CandidateGroupSort) => setCandidateSort(value)}
                    options={CANDIDATE_SORT_OPTIONS}
                    className="w-[170px]"
                  />
                  <Select
                    value={includeSoftFails ? 'all' : 'pass'}
                    onChange={(value) => setIncludeSoftFails(value === 'all')}
                    options={[
                      { label: '显示风险项', value: 'all' },
                      { label: '仅可选项', value: 'pass' },
                    ]}
                    className="w-[130px]"
                  />
                </Space>
              </div>

              <div className="mt-4 grid overflow-hidden rounded-md border border-border-subtle bg-surface-dim text-sm md:grid-cols-4">
                <div className="px-3 py-2">
                  <div className="text-xs text-text-faint">候选总量</div>
                  <div className="mt-1 font-semibold text-text">{candidateGroups?.total ?? 0} 个专业组</div>
                </div>
                <div className="border-t border-border-subtle px-3 py-2 md:border-l md:border-t-0">
                  <div className="text-xs text-text-faint">排序位次</div>
                  <div className="mt-1 font-semibold text-text">{formatRankValue(studentRankForDecision)}</div>
                </div>
                <div className="border-t border-border-subtle px-3 py-2 md:border-l md:border-t-0">
                  <div className="text-xs text-text-faint">方案年份</div>
                  <div className="mt-1 font-semibold text-text">{candidateGroups?.planYear ?? '-'}</div>
                </div>
                <div className="border-t border-border-subtle px-3 py-2 md:border-l md:border-t-0">
                  <div className="text-xs text-text-faint">当前方案</div>
                  <div className="mt-1 font-semibold text-text">{planItems.length} 个志愿项</div>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4">
              {isUsingFallbackYear ? (
                <Alert
                  type="info"
                  showIcon
                  message={`当前候选池参考 ${candidateGroups.sourceYear} 年招生计划，方案年份仍为 ${candidateGroups.planYear}。人数变化按 ${candidateGroups.previousYear ?? (candidateGroups.sourceYear! - 1)} 年对比。`}
                />
              ) : null}

              {isUsingScoreBasedRank ? (
                <Alert
                  type="warning"
                  showIcon
                  message={`档案位次 ${candidateGroups?.storedRank?.toLocaleString()} 与 ${student?.totalScore ?? '-'} 分明显不匹配，候选排序已按 ${candidateGroups?.sourceYear ?? '当前'} 年一分一段估算位次 ${candidateGroups?.scoreBasedRank?.toLocaleString()} 计算。`}
                />
              ) : null}

              {groupLoading ? (
                <div className="py-16 text-center">
                  <Spin size="large" />
                  <div className="mt-4 text-sm font-medium text-text">正在计算候选专业组</div>
                  <div className="mt-1 text-xs text-text-tertiary">系统正在综合位次、计划变化、竞争人数、选科池和征集数据</div>
                </div>
              ) : groups.length ? (
                <>
                  <div className="space-y-3">
                    {groups.map((group) => {
                      const expanded = expandedGroupKeys.includes(group.groupKey);
                      const planChange = formatGroupPlanChange(group);
                      const added = isCandidateGroupAlreadyAdded(group, planItems);
                      const anchor = getAnchorMajor(group);
                      const adjustedRank = getAdjustedRank(group, anchor);
                      const rankGap = formatRankGap(studentRankForDecision, adjustedRank);
                      const previewMajors = group.majors.slice(0, expanded ? Math.min(group.majors.length, 6) : 3);
                      const evidence = [
                        ...(group.matchReasons ?? []),
                        ...(anchor?.matchReasons ?? []),
                      ].filter(Boolean);
                      return (
                        <div key={group.groupKey} className="rounded-lg border border-border bg-surface-high px-4 py-3 shadow-card transition hover:border-ring">
                          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                            <button type="button" className="min-w-0 text-left" onClick={() => toggleGroup(group.groupKey)}>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-base font-semibold text-text">{group.universityName}</span>
                                <Tag color={GRADIENT_COLOR[gradientTier(group)]} className="m-0">{GRADIENT_LABEL[gradientTier(group)]}</Tag>
                                {added ? <Tag color="processing" className="m-0">已在方案</Tag> : null}
                                {group.softFailCount > 0 ? <Tag color="warning" icon={<WarningOutlined />} className="m-0">{group.softFailCount} 个风险专业</Tag> : null}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
                                <span>{formatCandidateGroup(group)}</span>
                                {group.university?.province || group.university?.city ? <span>{group.university?.province}{group.university?.city ? ` · ${group.university.city}` : ''}</span> : null}
                                <UniversityBadges group={group} />
                              </div>
                            </button>
                            <Space wrap className="xl:justify-end">
                              <Button size="small" onClick={() => anchor && setActiveDetail({ group, major: anchor })}>详情复核</Button>
                              <Button
                                size="small"
                                icon={<DownOutlined rotate={expanded ? 180 : 0} />}
                                onClick={() => toggleGroup(group.groupKey)}
                              >
                                {expanded ? '收起专业' : `展开 ${group.majors.length} 个专业`}
                              </Button>
                              {anchor ? (
                                <Button
                                  size="small"
                                  type="primary"
                                  icon={<PlusOutlined />}
                                  disabled={added}
                                  loading={addMutation.isPending}
                                  onClick={() => addCandidateGroup(group, anchor)}
                                >
                                  {getAddActionLabel(group, anchor, added)}
                                </Button>
                              ) : null}
                            </Space>
                          </div>

                          <div className={`mt-3 rounded-md border px-3 py-2 ${getRiskToneClass(rankGap.tone)}`}>
                            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                              <div className="font-semibold">
                                {GRADIENT_LABEL[gradientTier(group)]} · {rankGap.text}
                              </div>
                              <div className="text-sm">
                                修正位次 {formatRankValue(adjustedRank)}，排序位次 {formatRankValue(studentRankForDecision)}
                              </div>
                            </div>
                            {group.dynamicGradient?.reasons?.length ? (
                              <div className="mt-1 text-sm">{group.dynamicGradient.reasons.join('；')}</div>
                            ) : null}
                          </div>

                          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                            <MetricTile label="组最低分 / 位次" value={formatScoreRankValue(group.groupMinScore, group.groupMinRank)} note={formatGroupScoreLine(group)} />
                            <MetricTile label="招生计划变化" value={planChange.text} note={planChange.tone === 'down' ? '缩招需复核' : '按后端年份口径'} />
                            <MetricTile label="专业数 / 可选数" value={`${group.majorCount} 个 / ${group.selectableMajorCount} 个`} note={group.softFailCount ? `${group.softFailCount} 个软性风险` : '无软性风险命中'} />
                            <MetricTile label="锚定专业" value={anchor?.majorName ?? '-'} note={anchor ? formatScoreRankValue(anchor.majorMinScore, anchor.majorMinRank) : '-'} />
                          </div>

                          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <EvidenceItem label="匹配依据">{evidence.length ? evidence.slice(0, 2).join('；') : '按专业匹配排序'}</EvidenceItem>
                            <EvidenceItem label="竞争池">{formatCompetition(group)}</EvidenceItem>
                            <EvidenceItem label="选科池">{formatSelectionCompetition(group)}</EvidenceItem>
                            <EvidenceItem label="征集口径">{formatSupplementary(group)}</EvidenceItem>
                          </div>

                          <div className="mt-3 overflow-hidden rounded-md border border-border-subtle">
                            {previewMajors.map((major) => (
                              <div key={major.enrollmentPlanId} className="grid gap-2 border-t border-border-subtle bg-surface-high px-3 py-2 text-sm first:border-t-0 md:grid-cols-[minmax(0,1.6fr)_150px_90px_120px_92px] md:items-center">
                                <button type="button" className="min-w-0 text-left text-primary hover:text-primary-light" onClick={() => setActiveDetail({ group, major })}>
                                  <span className="block truncate font-medium">{major.majorName}</span>
                                  {major.isRecommendedAnchor ? <Tag color="gold" className="ml-2">锚定</Tag> : null}
                                </button>
                                <span className="text-text-secondary">{formatScoreRankValue(major.majorMinScore, major.majorMinRank)}</span>
                                <span className="text-text-secondary">招 {major.planCount ?? '-'} 人</span>
                                <span>
                                  {major.matchStatus === 'SOFT_FAIL'
                                    ? <Tag color="warning" icon={<WarningOutlined />} className="m-0">风险</Tag>
                                    : <Tag color="success" className="m-0">可选</Tag>}
                                </span>
                                <Button size="small" onClick={() => setActiveDetail({ group, major })}>专业详情</Button>
                              </div>
                            ))}
                          </div>

                          {expanded ? (
                            <div className="mt-4">
                              <Table
                                rowKey="enrollmentPlanId"
                                size="small"
                                columns={majorColumns(group)}
                                dataSource={group.majors}
                                pagination={false}
                                scroll={{ x: 900 }}
                              />
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {candidateGroups && candidateGroups.total > candidatePageSize ? (
                    <div className="flex justify-end pt-1">
                      <Pagination
                        size="small"
                        current={candidatePage}
                        pageSize={candidatePageSize}
                        total={candidateGroups.total}
                        showSizeChanger={false}
                        showTotal={(total) => `共 ${total} 个专业组`}
                        onChange={setCandidatePage}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的专业组" />
              )}
            </div>
          </section>

          <aside className="rounded-lg border border-border bg-surface-high p-4 shadow-card xl:sticky xl:top-20 xl:self-start">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="m-0 text-base font-semibold text-text">当前方案</h2>
              {planFetching ? <Spin size="small" /> : null}
            </div>
            <div className="mb-4 grid overflow-hidden rounded-md border border-border-subtle bg-surface-dim text-sm">
              <div className="grid grid-cols-3">
                <div className="px-3 py-2">
                  <div className="text-xs text-text-faint">已选</div>
                  <div className="mt-1 font-semibold text-text">{planItems.length}</div>
                </div>
                <div className="border-l border-border-subtle px-3 py-2">
                  <div className="text-xs text-text-faint">风险覆盖</div>
                  <div className="mt-1 font-semibold text-text">{planItems.filter((item: any) => item.overrideSoftFail).length}</div>
                </div>
                <div className="border-l border-border-subtle px-3 py-2">
                  <div className="text-xs text-text-faint">状态</div>
                  <div className="mt-1 truncate font-semibold text-text">{plan?.status ?? '-'}</div>
                </div>
              </div>
            </div>
            {planItems.length ? (
              <div className="space-y-2">
                {planItems.map((item: any) => (
                  <div key={item.id} className="rounded-md border border-border-subtle bg-surface-high px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-medium">{item.order ?? item.sequence}. {item.universityName}</div>
                        <div className="mt-1 text-xs text-text-muted">
                          {item.groupCode ? `专业组 ${item.groupCode} · ` : ''}{item.majorName}
                        </div>
                      </div>
                      <Space size={4}>
                        <Tag color={GRADIENT_COLOR[item.gradient as Gradient] || 'default'} className="m-0">
                          {GRADIENT_LABEL[item.gradient as Gradient] || item.gradient}
                        </Tag>
                        {plan?.status === 'DRAFT' ? (
                          <Button
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            loading={removeMutation.isPending}
                            onClick={() => removeMutation.mutate(item.id)}
                          />
                        ) : null}
                      </Space>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1 text-xs text-text-tertiary">
                      <span>{item.score25Group ?? item.score25Major ?? '-'} 分</span>
                      <span>/</span>
                      <span>{item.rank25Group ?? item.rank25Major ? (item.rank25Group ?? item.rank25Major).toLocaleString() : '-'} 位</span>
                      {item.overrideSoftFail ? <Tag color="orange" className="m-0">覆盖风险</Tag> : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧专业组加入志愿项" />
            )}
            <Button
              className="mt-4 w-full"
              type="primary"
              icon={<CheckOutlined />}
              disabled={plan?.status !== 'DRAFT' || !planItems.length}
              loading={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              提交主管审核
            </Button>
          </aside>
        </div>
      ) : null}

      <Drawer
        width={880}
        title={activeDetail ? (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span>{activeDetail.group.universityName}</span>
              <Tag color={GRADIENT_COLOR[gradientTier(activeDetail.group)]} className="m-0">
                {GRADIENT_LABEL[gradientTier(activeDetail.group)]}
              </Tag>
              {isCandidateGroupAlreadyAdded(activeDetail.group, planItems) ? <Tag color="processing" className="m-0">已在方案</Tag> : null}
            </div>
            <div className="mt-1 text-sm font-normal text-text-tertiary">
              {formatCandidateGroup(activeDetail.group)}
              {activeDetail.group.subjects ? ` · ${activeDetail.group.subjects}` : ''}
              {activeDetail.group.university?.city ? ` · ${activeDetail.group.university.city}` : ''}
            </div>
          </div>
        ) : '专业组复核'}
        open={!!activeDetail}
        onClose={() => setActiveDetail(null)}
        extra={activeDetail ? (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={isCandidateGroupAlreadyAdded(activeDetail.group, planItems)}
            loading={addMutation.isPending}
            onClick={() => addCandidateGroup(activeDetail.group, activeDetail.major)}
          >
            {getAddActionLabel(activeDetail.group, activeDetail.major, isCandidateGroupAlreadyAdded(activeDetail.group, planItems))}
          </Button>
        ) : null}
        footer={activeDetail ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-text-tertiary">复核位次、招生计划和软性限制后再加入方案。</span>
            <Space>
              <Button onClick={() => setActiveDetail(null)}>关闭</Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={isCandidateGroupAlreadyAdded(activeDetail.group, planItems)}
                loading={addMutation.isPending}
                onClick={() => addCandidateGroup(activeDetail.group, activeDetail.major)}
              >
                {getAddActionLabel(activeDetail.group, activeDetail.major, isCandidateGroupAlreadyAdded(activeDetail.group, planItems))}
              </Button>
            </Space>
          </div>
        ) : null}
      >
        {activeDetail ? (
          <div className="space-y-5">
            <section className="rounded-lg border border-border bg-surface-high p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <MetricTile label="锚定专业" value={activeDetail.major.majorName} note={activeDetail.major.majorCode || activeDetail.major.majorCategory || '-'} />
                <MetricTile label="学生分 / 排序位次" value={`${formatScoreValue(studentScoreForDecision)} / ${formatRankValue(studentRankForDecision)}`} note={isUsingScoreBasedRank ? '已按一分一段估算位次排序' : '使用档案位次'} />
                <MetricTile label="组最低分 / 位次" value={formatScoreRankValue(activeDetail.group.groupMinScore, activeDetail.group.groupMinRank)} note={formatGroupScoreLine(activeDetail.group)} />
                <MetricTile label="专业最低分 / 位次" value={formatScoreRankValue(activeDetail.major.majorMinScore, activeDetail.major.majorMinRank)} note={`录取 ${formatValue(activeDetail.major.majorAdmissionCount, '人')}`} />
                <MetricTile label="修正位次" value={formatRankValue(getAdjustedRank(activeDetail.group, activeDetail.major))} note={formatDynamicRank(activeDetail.major.dynamicGradient ?? activeDetail.group.dynamicGradient)} />
                <MetricTile label="当前判断" value={getDecisionText(activeDetail.group, activeDetail.major, studentRankForDecision)} />
              </div>
            </section>

            <section>
              <h3 className="m-0 mb-3 text-base font-semibold">专业列表</h3>
              <Table
                rowKey="enrollmentPlanId"
                size="small"
                columns={majorColumns(activeDetail.group)}
                dataSource={activeDetail.group.majors}
                pagination={false}
                scroll={{ x: 900 }}
              />
            </section>

            <section>
              <h3 className="m-0 mb-3 text-base font-semibold">风险复核</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {riskReviewItems(activeDetail.group, activeDetail.major, studentRankForDecision).map((item) => (
                  <div
                    key={item.title}
                    className={[
                      'rounded-md border px-3 py-2 text-sm',
                      item.tone === 'danger' ? 'border-rush/30 bg-rush-fixed text-rush' : '',
                      item.tone === 'warn' ? 'border-accent/30 bg-accent-fixed text-text-secondary' : '',
                      item.tone === 'ok' ? 'border-safe/30 bg-safe-fixed text-safe' : '',
                    ].join(' ')}
                  >
                    <div className="font-semibold">{item.title}</div>
                    <div className="mt-1 leading-relaxed">{item.content}</div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="m-0 mb-3 text-base font-semibold">历史数据</h3>
              <Table
                size="small"
                pagination={false}
                rowKey="year"
                dataSource={[
                  {
                    year: activeDetail.group.currentPlanYear ?? '当前',
                    score: activeDetail.major.majorMinScore,
                    rank: activeDetail.major.majorMinRank,
                    count: activeDetail.major.majorAdmissionCount,
                    source: '专业录取',
                  },
                  {
                    year: activeDetail.group.previousPlanYear ?? '上一年',
                    score: activeDetail.major.previousMajorMinScore,
                    rank: activeDetail.major.previousMajorMinRank,
                    count: activeDetail.major.previousMajorAdmissionCount,
                    source: '历史专业',
                  },
                ]}
                columns={[
                  { title: '年份', dataIndex: 'year', width: 90 },
                  { title: '最低分', dataIndex: 'score', render: (value) => value ?? '-' },
                  { title: '最低位次', dataIndex: 'rank', render: (value) => formatRankValue(value) },
                  { title: '录取人数', dataIndex: 'count', render: (value) => value ?? '-' },
                  { title: '数据来源', dataIndex: 'source' },
                ]}
              />
              {activeDetail.major.planNotes ? (
                <Alert className="mt-3" type="info" showIcon message="招生备注" description={activeDetail.major.planNotes} />
              ) : null}
              {activeDetail.major.subjectRequirements ? (
                <Alert className="mt-3" type="warning" showIcon message="选科要求" description={activeDetail.major.subjectRequirements} />
              ) : null}
            </section>

            <section>
              <h3 className="m-0 mb-3 text-base font-semibold">专业画像</h3>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="专业代码">{activeDetail.major.majorCode || '-'}</Descriptions.Item>
                <Descriptions.Item label="门类">{activeDetail.major.majorCategory || '-'}</Descriptions.Item>
                <Descriptions.Item label="学科">{activeDetail.major.discipline || '-'}</Descriptions.Item>
                <Descriptions.Item label="评级">{activeDetail.major.softRating || activeDetail.major.disciplineEval || '-'}</Descriptions.Item>
                <Descriptions.Item label="学位">{activeDetail.major.degree || '-'}</Descriptions.Item>
                <Descriptions.Item label="学制">{activeDetail.major.standardDuration || activeDetail.major.duration || '-'}</Descriptions.Item>
                <Descriptions.Item label="学费">{formatTuition(activeDetail.major.tuition)}</Descriptions.Item>
                <Descriptions.Item label="招生计划">{formatValue(activeDetail.major.planCount, '人')}</Descriptions.Item>
                <Descriptions.Item label="就业率">{formatValue(activeDetail.major.employmentRate, '%')}</Descriptions.Item>
                <Descriptions.Item label="平均薪资">{formatValue(activeDetail.major.avgSalary, '元')}</Descriptions.Item>
              </Descriptions>
              <p className="mt-3 text-sm leading-relaxed text-text-tertiary">
                {activeDetail.major.description || '该专业暂无长文本介绍，当前优先展示已接入的招生计划、录取和就业升学数据。'}
              </p>
              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-1 text-xs text-text-faint">核心课程</div>
                  {renderTags(activeDetail.major.coreCourses, 'blue')}
                </div>
                <div>
                  <div className="mb-1 text-xs text-text-faint">就业方向</div>
                  {renderTags(activeDetail.major.careerDirections, 'green')}
                </div>
                <div>
                  <div className="mb-1 text-xs text-text-faint">升学方向</div>
                  {renderTags(activeDetail.major.postgraduateDirections, 'purple')}
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
