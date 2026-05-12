'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Tooltip,
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
      title: '专业',
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
      title: '计划',
      dataIndex: 'planCount',
      width: 70,
      render: (value) => formatValue(value, '人'),
    },
    {
      title: '学费',
      dataIndex: 'tuition',
      width: 90,
      render: (value) => (value ? `${Number(value).toLocaleString()}元` : '-'),
    },
    {
      title: '专业线',
      width: 150,
      render: (_, major) => (
        <span>{major.majorMinScore ?? '-'} 分 / {major.majorMinRank ? major.majorMinRank.toLocaleString() : '-'} 位</span>
      ),
    },
    {
      title: '匹配',
      width: 150,
      render: (_, major) => (
        <Space size={4} wrap>
          <Tag color={GRADIENT_COLOR[gradientTier(major)]}>{GRADIENT_LABEL[gradientTier(major)]}</Tag>
          {major.matchStatus === 'SOFT_FAIL' ? <Tag icon={<WarningOutlined />} color="warning">有风险</Tag> : <Tag color="success">可选</Tag>}
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
          <section className="min-w-0 rounded-lg bg-surface p-5 shadow-card">
            <div className="mb-4 flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
              <div>
                <h2 className="m-0 text-lg font-semibold text-text">院校专业组候选池</h2>
                <p className="m-0 mt-1 text-sm text-text-tertiary">
                  默认按专业匹配优先排序，再参考分数线、招生人数和软限制风险。
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

            {isUsingFallbackYear ? (
              <Alert
                className="mb-4"
                type="info"
                showIcon
                message={`当前候选池参考 ${candidateGroups.sourceYear} 年招生计划，方案年份仍为 ${candidateGroups.planYear}。人数变化按 ${candidateGroups.previousYear ?? (candidateGroups.sourceYear! - 1)} 年对比。`}
              />
            ) : null}

            {isUsingScoreBasedRank ? (
              <Alert
                className="mb-4"
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
              <div className="space-y-3">
                {groups.map((group) => {
                  const expanded = expandedGroupKeys.includes(group.groupKey);
                  const planChange = formatGroupPlanChange(group);
                  const added = isCandidateGroupAlreadyAdded(group, planItems);
                  const anchor = group.majors.find((major) => major.enrollmentPlanId === group.recommendedAnchorEnrollmentPlanId) ?? group.majors[0];
                  return (
                    <div key={group.groupKey} className="rounded-lg border border-border-subtle bg-surface px-4 py-3">
                      <div className="flex flex-col gap-3">
                        <button type="button" className="w-full min-w-0 text-left" onClick={() => toggleGroup(group.groupKey)}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold text-text">{group.universityName}</span>
                            <Tag color={GRADIENT_COLOR[gradientTier(group)]} className="m-0">{GRADIENT_LABEL[gradientTier(group)]}</Tag>
                            {added ? <Tag color="processing" className="m-0">已在方案</Tag> : null}
                            {group.softFailCount > 0 ? <Tag color="warning" icon={<WarningOutlined />} className="m-0">{group.softFailCount} 个风险专业</Tag> : null}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-tertiary">
                            <span>{formatCandidateGroup(group)}</span>
                            <UniversityBadges group={group} />
                          </div>
                        </button>
                        <Space wrap>
                          <Tooltip title="当前专业组招生人数及与上一年的变化">
                            <Tag color={planChange.tone === 'up' ? 'green' : planChange.tone === 'down' ? 'red' : 'default'}>{planChange.text}</Tag>
                          </Tooltip>
                          <Tag>{formatGroupScoreLine(group)}</Tag>
                          {group.competition?.currentCount || group.competition?.previousCount ? <Tag>{formatCompetition(group)}</Tag> : null}
                          {group.dynamicGradient?.adjustedMinRank ? <Tag color="cyan">{formatDynamicRank(group.dynamicGradient)}</Tag> : null}
                          {group.selectionCompetition?.eligibleCount ? <Tag color="purple">{formatSelectionCompetition(group)}</Tag> : null}
                          <Tag color={hasSupplementaryData(group) ? 'gold' : 'default'}>{formatSupplementary(group)}</Tag>
                          {group.predictedMinRank?.point ? <Tag color="blue">预测 {group.predictedMinRank.point.toLocaleString()} 位</Tag> : null}
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
                              {added ? '已加入' : '加入推荐专业'}
                            </Button>
                          ) : null}
                        </Space>
                      </div>
                      <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                        <div className="rounded-md bg-surface-dim px-3 py-2">
                          <div className="text-xs text-text-faint">专业数</div>
                          <div className="font-medium">{group.majorCount} 个，{group.selectableMajorCount} 个可选</div>
                        </div>
                        <div className="rounded-md bg-surface-dim px-3 py-2">
                          <div className="text-xs text-text-faint">组最低位次</div>
                          <div className="font-medium">{group.groupMinRank ? group.groupMinRank.toLocaleString() : '-'}</div>
                        </div>
                        <div className="rounded-md bg-surface-dim px-3 py-2">
                          <div className="text-xs text-text-faint">匹配原因</div>
                          <div className="truncate font-medium">{group.matchReasons?.length ? group.matchReasons.join('、') : '按专业匹配排序'}</div>
                        </div>
                        <div className="rounded-md bg-surface-dim px-3 py-2">
                          <div className="text-xs text-text-faint">锚定专业</div>
                          <div className="truncate font-medium">{anchor?.majorName ?? '-'}</div>
                        </div>
                      </div>
                      {group.dynamicGradient?.reasons?.length ? (
                        <div className="mt-2 text-sm text-text-tertiary">
                          {group.dynamicGradient.reasons.join('；')}
                        </div>
                      ) : null}
                      {expanded ? (
                        <div className="mt-4">
                          <Table
                            rowKey="enrollmentPlanId"
                            size="small"
                            columns={majorColumns(group)}
                            dataSource={group.majors}
                            pagination={false}
                            scroll={{ x: 760 }}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {candidateGroups && candidateGroups.total > candidatePageSize ? (
                  <div className="flex justify-end pt-2">
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
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无符合条件的专业组" />
            )}
          </section>

          <aside className="rounded-lg bg-surface p-5 shadow-card xl:sticky xl:top-20 xl:self-start">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="m-0 text-base font-semibold text-text">当前方案</h2>
              {planFetching ? <Spin size="small" /> : null}
            </div>
            {planItems.length ? (
              <div className="space-y-2">
                {planItems.map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-border-subtle px-3 py-2">
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
        width={720}
        title={activeDetail ? `${activeDetail.major.majorName} · 专业详情` : '专业详情'}
        open={!!activeDetail}
        onClose={() => setActiveDetail(null)}
      >
        {activeDetail ? (
          <div className="space-y-5">
            <section>
              <h3 className="m-0 mb-3 text-base font-semibold">决策摘要</h3>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="院校">{activeDetail.group.universityName}</Descriptions.Item>
                <Descriptions.Item label="专业组">{formatCandidateGroup(activeDetail.group)}</Descriptions.Item>
                <Descriptions.Item label="组线">{formatGroupScoreLine(activeDetail.group)}</Descriptions.Item>
                <Descriptions.Item label="专业线">
                  {activeDetail.major.majorMinScore ?? '-'} 分 / {activeDetail.major.majorMinRank ? activeDetail.major.majorMinRank.toLocaleString() : '-'} 位
                </Descriptions.Item>
                <Descriptions.Item label="招生计划">{formatValue(activeDetail.major.planCount, '人')}</Descriptions.Item>
                <Descriptions.Item label="学费">{activeDetail.major.tuition ? `${activeDetail.major.tuition.toLocaleString()}元` : '-'}</Descriptions.Item>
                <Descriptions.Item label="风险" span={2}>
                  {activeDetail.major.failReasons.length
                    ? activeDetail.major.failReasons.map((reason) => reason.note).join('；')
                    : '未命中软限制风险'}
                </Descriptions.Item>
              </Descriptions>
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
                <Descriptions.Item label="就业率">{formatValue(activeDetail.major.employmentRate, '%')}</Descriptions.Item>
                <Descriptions.Item label="平均薪资">{formatValue(activeDetail.major.avgSalary, '元')}</Descriptions.Item>
                <Descriptions.Item label="硕士点">{activeDetail.major.localMasterPoint ? '有' : '暂无'}</Descriptions.Item>
                <Descriptions.Item label="博士点">{activeDetail.major.localDoctoralPoint ? '有' : '暂无'}</Descriptions.Item>
              </Descriptions>
              <p className="mt-3 text-sm leading-relaxed text-text-tertiary">
                {activeDetail.major.description || '该专业暂无长文本介绍，当前优先展示已接入的招生计划、录取和就业升学数据。'}
              </p>
            </section>

            <section>
              <h3 className="m-0 mb-3 text-base font-semibold">课程与去向</h3>
              <div className="space-y-3">
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

            <section>
              <h3 className="m-0 mb-3 text-base font-semibold">院校内录取变化</h3>
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
                  },
                  {
                    year: activeDetail.group.previousPlanYear ?? '上一年',
                    score: activeDetail.major.previousMajorMinScore,
                    rank: activeDetail.major.previousMajorMinRank,
                    count: activeDetail.major.previousMajorAdmissionCount,
                  },
                ]}
                columns={[
                  { title: '年份', dataIndex: 'year', width: 90 },
                  { title: '最低分', dataIndex: 'score', render: (value) => value ?? '-' },
                  { title: '最低位次', dataIndex: 'rank', render: (value) => value ? value.toLocaleString() : '-' },
                  { title: '录取人数', dataIndex: 'count', render: (value) => value ?? '-' },
                ]}
              />
              {activeDetail.major.planNotes ? (
                <Alert className="mt-3" type="info" showIcon message="招生备注" description={activeDetail.major.planNotes} />
              ) : null}
              {activeDetail.major.subjectRequirements ? (
                <Alert className="mt-3" type="warning" showIcon message="选科要求" description={activeDetail.major.subjectRequirements} />
              ) : null}
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
