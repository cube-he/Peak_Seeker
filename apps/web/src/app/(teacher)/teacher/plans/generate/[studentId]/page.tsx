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
import styles from './candidate-pool-polished.module.css';

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
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

function gradientTone(tier: DynamicGradientTier) {
  if (tier === 'JI_CHONG' || tier === 'CHONG' || tier === 'XIAO_CHONG') return 'rush';
  if (tier === 'BAO' || tier === 'QIANG_BAO' || tier === 'DIBAO') return 'safe';
  return 'stable';
}

function tagClass(tone: 'rush' | 'stable' | 'safe' | 'muted' | 'warn' | 'extreme') {
  const toneClass = {
    rush: styles.tagRush,
    stable: styles.tagStable,
    safe: styles.tagSafe,
    muted: styles.tagMuted,
    warn: styles.tagWarn,
    extreme: styles.tagExtreme,
  }[tone];
  return cx(styles.tag, toneClass);
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
    <div className={styles.signal}>
      <div className={styles.label}>{label}</div>
      <div className={styles.value}>{value}</div>
      {note ? <div className={styles.sub}>{note}</div> : null}
    </div>
  );
}

function EvidenceItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.evidenceItem}>
      <b>{label}</b>
      <span>{children}</span>
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
    <>
      {tags.map((tag) => <span key={String(tag)} className={tagClass('muted')}>{tag}</span>)}
    </>
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
    <div className={styles.page}>
      <Link href={`/teacher/students/${studentId}`} className={styles.backLink}>
        <ArrowLeftOutlined /> 返回学生详情
      </Link>

      <section className={styles.compactHeader}>
        <div className={styles.studentIdentity}>
          <div className={styles.studentTop}>
            <div>
              <h1>生成方案工作台</h1>
              <p>学生：{student?.user?.realName || student?.realName || student?.user?.username || '-'} · 当前方案按后端候选池实时计算</p>
            </div>
            <div className={styles.headerActions}>
            <Select
              placeholder="选择批次"
              value={batchConfigId}
              loading={batchLoading}
              options={batchOptions}
              onChange={setBatchConfigId}
              className="min-w-[260px]"
            />
            <button
              type="button"
              className={cx(styles.btn, styles.btnSmall, styles.btnPrimary)}
              disabled={!batchConfigId || student?.intakeStatus !== 'VERIFIED'}
              onClick={openOrCreatePlan}
            >
              <FileTextOutlined />
              {selectedBatchPlan ? '打开已有方案' : '创建方案草稿'}
            </button>
            {planId ? (
              <>
                <button type="button" className={cx(styles.btn, styles.btnSmall)} onClick={() => router.push(`/teacher/plans/${planId}`)}>查看详情</button>
                <button
                  type="button"
                  className={cx(styles.btn, styles.btnSmall, styles.btnPrimary)}
                  disabled={plan?.status !== 'DRAFT' || !planItems.length}
                  onClick={() => submitMutation.mutate()}
                >
                  <SendOutlined />
                  提交审核
                </button>
              </>
            ) : null}
            </div>
          </div>
          <div className={styles.studentStrip}>
            <div className={styles.studentChip}><span>Score</span><strong>{student?.totalScore ?? '-'}</strong></div>
            <div className={styles.studentChip}><span>{isUsingScoreBasedRank ? 'Profile Rank' : 'Rank'}</span><strong>{formatRankValue(student?.provincialRank)}</strong></div>
            <div className={styles.studentChip}><span>Status</span><strong>{student?.intakeStatus || 'DRAFT'}</strong></div>
            {isUsingScoreBasedRank && candidateGroups?.scoreBasedRank ? (
              <div className={styles.studentChip}><span>Sort Rank</span><strong>{formatRankValue(candidateGroups.scoreBasedRank)}</strong></div>
            ) : null}
          </div>
          <div className={styles.noteRow}>
            <span className={styles.collectionNote}>已有方案</span>
            {existingPlansLoading ? <span className={styles.collectionNote}>加载中...</span> : null}
            {existingPlans.length ? existingPlans.map((existingPlan) => {
              const batchName = existingPlan.batchName ?? existingPlan.batch ?? `批次 ${existingPlan.batchConfigId ?? existingPlan.id}`;
              return (
                <button
                  key={existingPlan.id}
                  type="button"
                  className={cx(styles.btn, styles.btnSmall, existingPlan.id === planId && styles.btnPrimary)}
                  onClick={() => openPlan(existingPlan)}
                >
                  {batchName} · V{existingPlan.versionNo ?? 1} · {existingPlan.status ?? 'DRAFT'}
                </button>
              );
            }) : <span className={styles.collectionNote}>暂无已创建方案</span>}
          </div>
        </div>
        {student?.intakeStatus !== 'VERIFIED' ? (
          <Alert className="mt-4" type="warning" showIcon message="学生资料尚未确认，需要先在学生详情页完成资料审核。" />
        ) : null}
      </section>

      {planId ? (
        <>
        <div className={styles.summaryStrip}>
          <div className={styles.summaryCard}><div className={styles.label}>候选总量</div><div className={styles.value}>{candidateGroups?.total ?? 0}</div><div className={styles.hint}>专业组候选</div></div>
          <div className={styles.summaryCard}><div className={styles.label}>排序位次</div><div className={styles.value}>{formatRankValue(studentRankForDecision)}</div><div className={styles.hint}>{isUsingScoreBasedRank ? '一分一段估算' : '档案位次'}</div></div>
          <div className={styles.summaryCard}><div className={styles.label}>方案年份</div><div className={styles.value}>{candidateGroups?.planYear ?? '-'}</div><div className={styles.hint}>招生计划口径</div></div>
          <div className={styles.summaryCard}><div className={styles.label}>当前方案</div><div className={styles.value}>{planItems.length}</div><div className={styles.hint}>已加入志愿项</div></div>
        </div>

        <div className={styles.workbench}>
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <div className={styles.panelTitle}>
                <h2>院校专业组候选池</h2>
                <p>按后端候选结果展示专业组，排序参考位次、专业匹配、计划变化、竞争池、选科池和征集口径。</p>
              </div>
            </div>
            <div className={styles.toolbar}>
              <Input.Search
                placeholder="院校/专业/专业组"
                allowClear
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onSearch={setKeyword}
              />
              <div className={styles.filterRow}>
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
              </div>
            </div>
            <div className={styles.candidateView}>
              <div className={styles.densityNote}>
                <div>
                  当前展示 <strong>{groups.length}</strong> 个候选，按 <strong>{CANDIDATE_SORT_OPTIONS.find((item) => item.value === candidateSort)?.label}</strong> 排序
                </div>
                <span>{includeSoftFails ? '包含风险项' : '仅显示可选项'}</span>
              </div>
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
                  <div className={styles.cardList}>
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
                        <article key={group.groupKey} className={styles.candidateCard}>
                          <div className={styles.candidateTop}>
                            <span className={styles.crest}>{group.universityName?.slice(0, 1) || '校'}</span>
                            <button type="button" className="min-w-0 border-0 bg-transparent p-0 text-left" onClick={() => toggleGroup(group.groupKey)}>
                              <div className={styles.nameLine}>
                                <h3>{group.universityName}</h3>
                                <span className={tagClass(gradientTone(gradientTier(group)))}>{GRADIENT_LABEL[gradientTier(group)]}</span>
                                {added ? <span className={tagClass('muted')}>已加入</span> : null}
                                {group.softFailCount > 0 ? <span className={tagClass('warn')}>{group.softFailCount} 个风险专业</span> : null}
                                <UniversityBadges group={group} />
                              </div>
                              <div className={styles.subLine}>
                                {group.university?.province || group.university?.city ? <span>{group.university?.province}{group.university?.city ? ` · ${group.university.city}` : ''}</span> : null}
                                <span className={styles.dot}>·</span>
                                <span>{formatCandidateGroup(group)}</span>
                              </div>
                            </button>
                            <div className={styles.cardActions}>
                              <button type="button" className={cx(styles.btn, styles.btnSmall)} onClick={() => anchor && setActiveDetail({ group, major: anchor })}>详情</button>
                              <button
                                type="button"
                                className={cx(styles.btn, styles.btnSmall)}
                                onClick={() => toggleGroup(group.groupKey)}
                              >
                                专业 <DownOutlined rotate={expanded ? 180 : 0} />
                              </button>
                              {anchor ? (
                                <button
                                  type="button"
                                  className={cx(styles.btn, styles.btnSmall, !added && styles.btnPrimary)}
                                  disabled={added}
                                  onClick={() => addCandidateGroup(group, anchor)}
                                >
                                  <PlusOutlined />
                                  {getAddActionLabel(group, anchor, added)}
                                </button>
                              ) : null}
                            </div>
                          </div>

                          <div className={styles.rankSummary}>
                            <div className={styles.grade}>
                              <span className={tagClass(gradientTone(gradientTier(group)))}>梯度：{GRADIENT_LABEL[gradientTier(group)]}</span>
                              <span className={styles.collectionNote}>{formatSupplementary(group)}</span>
                            </div>
                            <div className={styles.diff}>
                              与学生位次差 <strong>{rankGap.text}</strong>
                              <br />
                              学生 {formatRankValue(studentRankForDecision)} / 修正 {formatRankValue(adjustedRank)}
                            </div>
                          </div>

                          <div className={styles.signalGrid}>
                            <MetricTile label="组最低" value={formatScoreRankValue(group.groupMinScore, group.groupMinRank)} note={formatGroupScoreLine(group)} />
                            <MetricTile label="修正位次" value={formatRankValue(adjustedRank)} note={formatDynamicRank(group.dynamicGradient)} />
                            <MetricTile label="招生计划" value={planChange.text} note={planChange.tone === 'down' ? '缩招需复核' : '按后端年份口径'} />
                            <MetricTile label="专业" value={`${group.majorCount} 个 / ${group.selectableMajorCount} 可选`} note={anchor?.majorName ?? '-'} />
                          </div>

                          <div className={styles.dataEvidence}>
                            <div className={styles.evidenceTitle}>数据依据</div>
                            <div className={styles.evidenceGrid}>
                              <EvidenceItem label="位次依据">
                                排序位次 {formatRankValue(studentRankForDecision)}，修正位次 {formatRankValue(adjustedRank)}，{rankGap.text}。
                              </EvidenceItem>
                              <EvidenceItem label="计划变化">{planChange.text}</EvidenceItem>
                              <EvidenceItem label="竞争变化">{formatCompetition(group)}；{formatSelectionCompetition(group)}</EvidenceItem>
                              <EvidenceItem label="风险提示">
                                {group.dynamicGradient?.reasons?.length
                                  ? group.dynamicGradient.reasons.slice(0, 2).join('；')
                                  : evidence.length ? evidence.slice(0, 2).join('；') : '按专业匹配排序'}
                              </EvidenceItem>
                            </div>
                            {group.supplementary?.scope === 'UNIVERSITY_BATCH' ? (
                              <div className={styles.noteRow}>
                                <span className={styles.compareNote}>院校批次征集仅参考，不直接降低专业组风险</span>
                              </div>
                            ) : null}
                          </div>

                          <div className={styles.majorList}>
                            {previewMajors.map((major) => (
                              <div key={major.enrollmentPlanId} className={styles.majorRow}>
                                <strong>{major.majorName}</strong>
                                <span className={styles.num}>{formatScoreRankValue(major.majorMinScore, major.majorMinRank)}</span>
                                <span>计划 {major.planCount ?? '-'}</span>
                                <span>{major.standardDuration || major.duration || '-'}</span>
                                <span>
                                  <span className={major.matchStatus === 'SOFT_FAIL' ? tagClass('warn') : tagClass(gradientTone(gradientTier(major)))}>
                                    {major.matchStatus === 'SOFT_FAIL' ? '风险' : GRADIENT_LABEL[gradientTier(major)]}
                                  </span>
                                </span>
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
                        </article>
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

          <aside className={styles.rail}>
            <div className={styles.railCard}>
              <h3>当前方案健康度</h3>
              {planFetching ? <Spin size="small" /> : null}
              <div className={styles.healthGrid}>
                <div className={styles.healthStat}><span>已选</span><strong>{planItems.length}</strong></div>
                <div className={styles.healthStat}><span>风险</span><strong>{planItems.filter((item: any) => item.overrideSoftFail).length}</strong></div>
                <div className={styles.healthStat}><span>状态</span><strong>{plan?.status ?? '-'}</strong></div>
              </div>
              <div className={styles.dist}><span /><span /><span /></div>
              <div className={styles.distLabels}><span>冲类</span><span>稳类</span><span>保类</span></div>
              <div className={styles.gapList}>
                <div><span>候选池</span><b>{candidateGroups?.total ?? 0} 个专业组</b></div>
                <div><span>排序位次</span><b>{formatRankValue(studentRankForDecision)}</b></div>
                <div><span>资料状态</span><b>{student?.intakeStatus || 'DRAFT'}</b></div>
              </div>
            </div>

            <div className={styles.railCard}>
              <h3>已选专业组</h3>
            {planItems.length ? (
              <div className={styles.selectedList}>
                {planItems.map((item: any) => (
                  <div key={item.id} className={styles.selectedItem}>
                    <div className={styles.selectedTop}>
                      <div>
                        <div className={styles.selectedName}>{item.order ?? item.sequence}. {item.universityName}</div>
                        <div className={styles.selectedMeta}>
                          {item.groupCode ? `专业组 ${item.groupCode} · ` : ''}{item.majorName}
                          {' · '}
                          {item.rank25Group ?? item.rank25Major ? `${(item.rank25Group ?? item.rank25Major).toLocaleString()} 位` : '位次 -'}
                        </div>
                      </div>
                      {plan?.status === 'DRAFT' ? (
                        <button
                          type="button"
                          className={cx(styles.btn, styles.btnSmall)}
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(item.id)}
                          aria-label="移除"
                        >
                          <DeleteOutlined />
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧专业组加入志愿项" />
            )}
            </div>

            <div className={styles.railCard}>
              <h3>下一步建议</h3>
              <div className={styles.suggestion}>
                <span className={styles.suggestionMark}>i</span>
                <ol className={styles.nextSteps}>
                  <li>优先补足稳 / 稳保，要求学生位次覆盖修正位次。</li>
                  <li>极冲只做备选，不占正式推荐名额。</li>
                  <li>软性风险专业先复核限制，再加入方案。</li>
                </ol>
              </div>
              <button
                type="button"
                className={cx(styles.btn, styles.btnPrimary)}
                disabled={plan?.status !== 'DRAFT' || !planItems.length || submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                <CheckOutlined />
                提交主管审核
              </button>
            </div>
          </aside>
        </div>
        </>
      ) : null}

      <Drawer
        width={880}
        rootClassName={styles.drawerRoot}
        title={activeDetail ? (
          <div>
            <div className={styles.drawerTitle}>
              <h2>{activeDetail.group.universityName}</h2>
              <span className={tagClass(gradientTone(gradientTier(activeDetail.group)))}>{GRADIENT_LABEL[gradientTier(activeDetail.group)]}</span>
              {isCandidateGroupAlreadyAdded(activeDetail.group, planItems) ? <span className={tagClass('muted')}>已在方案</span> : null}
            </div>
            <div className={styles.drawerMeta}>
              <span>{formatCandidateGroup(activeDetail.group)}</span>
              {activeDetail.group.subjects ? ` · ${activeDetail.group.subjects}` : ''}
              {activeDetail.group.university?.city ? ` · ${activeDetail.group.university.city}` : ''}
            </div>
          </div>
        ) : '专业组复核'}
        open={!!activeDetail}
        onClose={() => setActiveDetail(null)}
        extra={activeDetail ? (
          <button
            type="button"
            className={cx(styles.btn, styles.btnSmall, styles.btnPrimary)}
            disabled={isCandidateGroupAlreadyAdded(activeDetail.group, planItems)}
            onClick={() => addCandidateGroup(activeDetail.group, activeDetail.major)}
          >
            <PlusOutlined />
            {getAddActionLabel(activeDetail.group, activeDetail.major, isCandidateGroupAlreadyAdded(activeDetail.group, planItems))}
          </button>
        ) : null}
        footer={activeDetail ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm text-text-tertiary">复核位次、招生计划和软性限制后再加入方案。</span>
            <div className={styles.footActions}>
              <button type="button" className={styles.btn} onClick={() => setActiveDetail(null)}>关闭</button>
              <button
                type="button"
                className={cx(styles.btn, styles.btnPrimary)}
                disabled={isCandidateGroupAlreadyAdded(activeDetail.group, planItems)}
                onClick={() => addCandidateGroup(activeDetail.group, activeDetail.major)}
              >
                <PlusOutlined />
                {getAddActionLabel(activeDetail.group, activeDetail.major, isCandidateGroupAlreadyAdded(activeDetail.group, planItems))}
              </button>
            </div>
          </div>
        ) : null}
      >
        {activeDetail ? (
          <div>
            <section className={styles.decisionSummary}>
              <div className={styles.decisionGrid}>
                <div className={styles.decisionCell}><div className={styles.label}>Anchor</div><div className={styles.value}>{activeDetail.major.majorName}</div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Student Rank</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(studentRankForDecision)}</span><span className={styles.score}>{formatScoreValue(studentScoreForDecision)}</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Group Min</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(activeDetail.group.groupMinRank)}</span><span className={styles.score}>{formatScoreValue(activeDetail.group.groupMinScore)}</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Major Min</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(activeDetail.major.majorMinRank)}</span><span className={styles.score}>{formatScoreValue(activeDetail.major.majorMinScore)}</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Adjusted Rank</div><div className={styles.value}><span className={styles.rank}>{formatRankValue(getAdjustedRank(activeDetail.group, activeDetail.major))}</span><span className={styles.score}>dynamicGradient.adjustedMinRank</span></div></div>
                <div className={styles.decisionCell}><div className={styles.label}>Judgement</div><div className={styles.value}>{getDecisionText(activeDetail.group, activeDetail.major, studentRankForDecision)}</div></div>
              </div>
            </section>

            <section className={styles.drawerSection}>
              <h3>专业列表</h3>
              <Table
                className={styles.drawerTable}
                rowKey="enrollmentPlanId"
                size="small"
                columns={majorColumns(activeDetail.group)}
                dataSource={activeDetail.group.majors}
                pagination={false}
                scroll={{ x: 900 }}
              />
            </section>

            <section className={styles.drawerSection}>
              <h3>风险复核</h3>
              <div className={styles.riskReview}>
                {riskReviewItems(activeDetail.group, activeDetail.major, studentRankForDecision).map((item) => (
                  <div
                    key={item.title}
                    className={cx(
                      styles.riskItem,
                      item.tone === 'danger' && styles.riskDanger,
                      item.tone === 'warn' && styles.riskWarn,
                      item.tone === 'ok' && styles.riskOk,
                    )}
                  >
                    <b>{item.title}</b>
                    <div>{item.content}</div>
                  </div>
                ))}
              </div>
            </section>

            <section className={styles.drawerSection}>
              <h3>历史数据</h3>
              <Table
                className={styles.drawerTable}
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

            <section className={styles.drawerSection}>
              <h3>专业画像</h3>
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
