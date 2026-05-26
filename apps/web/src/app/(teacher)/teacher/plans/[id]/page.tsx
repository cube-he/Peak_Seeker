'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Dropdown,
  Empty,
  Input,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  Timeline,
  Tooltip,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  ExportOutlined,
  FileDoneOutlined,
  FullscreenOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  RollbackOutlined,
  SendOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';
import PlanMajorSelectionEditor from '../components/PlanMajorSelectionEditor';
import PlanPreparationTable from '../components/PlanPreparationTable';

const GRADIENT_LABEL: Record<string, string> = {
  CHONG: '冲',
  WEN: '稳',
  BAO: '保',
};

const GRADIENT_COLOR: Record<string, string> = {
  CHONG: 'red',
  WEN: 'gold',
  BAO: 'green',
};

const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
  COMPREHENSIVE_SCIENCE: '理科',
  COMPREHENSIVE_LIBERAL: '文科',
};

const REVIEW_ACTION_LABEL: Record<string, { text: string; color: string }> = {
  APPROVE: { text: '通过', color: 'green' },
  REJECT: { text: '驳回', color: 'red' },
  REQUEST_CHANGE: { text: '退回修改', color: 'orange' },
  COMMENT: { text: '留言', color: 'default' },
};

function unwrap<T>(value: any): T {
  return (value?.data ?? value) as T;
}

function formatNumber(value: number | null | undefined) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
}

function formatRelativeTime(date: Date | null, now: Date) {
  if (!date) return '--';
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 86_400 * 30) return `${Math.floor(seconds / 86_400)} 天前`;
  return date.toLocaleString('zh-CN');
}

// 历史录取分来源枚举(供 UI 标注当前算法在用哪档)
export type HistoricalScoreSource = 'major25' | 'group25' | 'major24' | 'legacy';

export interface HistoricalScoreResult {
  score: number;
  source: HistoricalScoreSource;
}

// 来源标签:在单元格小字和 tooltip 里显示哪档数据
const SOURCE_LABEL: Record<HistoricalScoreSource, string> = {
  major25: '25 年专业级',
  group25: '25 年组级',
  major24: '24 年专业级',
  legacy: '旧字段(兼容)',
};

// 来源配色:让老师一眼区分数据质量; text-primary=navy(最优), text-safe=green(次优), muted=兜底
const SOURCE_TONE: Record<HistoricalScoreSource, string> = {
  major25: 'text-primary',       // 最优先,深蓝
  group25: 'text-text-secondary', // 较粗,深灰
  major24: 'text-safe',           // 较旧但精确,绿色
  legacy: 'text-text-muted',      // 兜底,弱化
};

// 历史最低分:返回 { score, source } 让 UI 能告诉老师当前是哪个维度的数据
// 优先级:25 年专业级 > 25 年专业组级 > 24 年专业级 > 旧字段
function getHistoricalScore(item: any): HistoricalScoreResult | null {
  if (item?.score25Major != null) return { score: item.score25Major, source: 'major25' };
  if (item?.score25Group != null) return { score: item.score25Group, source: 'group25' };
  if (item?.score24Major != null) return { score: item.score24Major, source: 'major24' };
  if (item?.lastYearMinScore != null) return { score: item.lastYearMinScore, source: 'legacy' };
  return null;
}

function getHistoricalRank(item: any): number | null {
  return item?.rank25Major ?? item?.rank25Group ?? item?.lastYearMinRank ?? null;
}

function isItemRisky(item: any): boolean {
  if (item?.overrideSoftFail) return true;
  if (Array.isArray(item?.softFailReasons) && item.softFailReasons.length > 0) return true;
  if (item?.riskWarning && String(item.riskWarning).trim()) return true;
  return false;
}

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const planId = params.id;

  const [reviewComment, setReviewComment] = useState('');
  // 教师对每个志愿的逐项批注：sequence -> annotation；提交审核时打包发送
  const [annotations, setAnnotations] = useState<Record<number, string>>({});
  // 标记是否已从 draft 恢复初值,避免后续 draftData 重新拉取(如 React Query refetch)时
  // 覆盖用户已经输入的内容
  const [draftLoaded, setDraftLoaded] = useState(false);
  // 预案一览表默认折叠；用户可点击展开内联预览，或点全屏按钮弹 Modal
  const [showPreparationFullscreen, setShowPreparationFullscreen] = useState(false);
  // 客户端启动后再产生 now，避免 SSR / 客户端时间不一致 hydration 警告
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => planApi.getById(planId),
  });
  const plan = unwrap<Record<string, any>>(data);
  const items: any[] = plan?.items ?? [];

  // 拉取当前审核人对此方案的草稿:用于在审核中断后恢复未提交的批注/总体意见
  const { data: draftData } = useQuery({
    queryKey: ['plan-review-draft', planId],
    queryFn: () => planApi.getReviewDraft(planId),
    // 只在能审核的状态拉取,避免 DRAFT 状态(老师做方案中)误拉
    enabled: !!plan && (plan.status === 'PENDING_REVIEW' || plan.status === 'REVIEWING'),
  });

  // 从服务端 draft 恢复:仅首次加载时填入,之后用户编辑不被覆盖
  useEffect(() => {
    if (draftLoaded) return;
    if (!draftData) return;
    if (draftData.comment) setReviewComment(draftData.comment);
    if (Array.isArray(draftData.itemAnnotations)) {
      const restored: Record<number, string> = {};
      for (const a of draftData.itemAnnotations) {
        restored[a.sequence] = a.annotation;
      }
      setAnnotations(restored);
    }
    setDraftLoaded(true);
  }, [draftData, draftLoaded]);

  // 「审下一份」依赖当前教师 PENDING_REVIEW 队列；只在审核相关状态拉
  const { data: queueData } = useQuery({
    queryKey: ['teacher-review-queue'],
    queryFn: () => planApi.getTeacherPlans({ status: 'PENDING_REVIEW', pageSize: 100 }),
    enabled: !!plan && (plan.status === 'REVIEWING' || plan.status === 'PENDING_REVIEW'),
  });
  const reviewQueue: any[] = queueData?.data?.data ?? queueData?.data ?? [];
  const currentIdx = reviewQueue.findIndex((p) => Number(p.id) === Number(planId));
  const nextInQueue = currentIdx >= 0 ? reviewQueue[currentIdx + 1] : reviewQueue[0];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });

  // 草稿保存:由 debounce 触发,失败不打扰用户(返回 toast 即可)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null);
  const saveDraftMutation = useMutation({
    mutationFn: (payload: {
      comment?: string;
      itemAnnotations?: { sequence: number; annotation: string }[];
    }) => planApi.upsertReviewDraft(planId, payload),
    onSuccess: () => setDraftSavedAt(new Date()),
    // 草稿保存失败不弹错;静默(下次还会重试)
    onError: () => {},
  });

  // 800ms 内连续输入只触发一次保存;避免每次按键都发请求
  const debouncedSave = useDebouncedCallback(
    (comment: string, annotations: Record<number, string>) => {
      const itemAnnotations = Object.entries(annotations)
        .filter(([, anno]) => anno && anno.trim())
        .map(([seq, annotation]) => ({ sequence: Number(seq), annotation: annotation.trim() }));
      saveDraftMutation.mutate({
        comment: comment || undefined,
        itemAnnotations: itemAnnotations.length ? itemAnnotations : undefined,
      });
    },
    800,
  );

  const submitMutation = useMutation({
    mutationFn: () => planApi.submitForReview(planId),
    onSuccess: () => {
      void message.success('已提交审核');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '提交失败'),
  });

  const startReviewMutation = useMutation({
    mutationFn: () => planApi.startReview(planId),
    onSuccess: () => {
      void message.success('已认领审核');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '认领失败'),
  });

  const reviewMutation = useMutation({
    mutationFn: (action: 'APPROVE' | 'REQUEST_CHANGE' | 'REJECT') => {
      const itemAnnotations = Object.entries(annotations)
        .filter(([, anno]) => anno && anno.trim())
        .map(([seq, annotation]) => ({ sequence: Number(seq), annotation: annotation.trim() }));
      return planApi.reviewPlan(planId, {
        action,
        comment: reviewComment,
        itemAnnotations: itemAnnotations.length ? itemAnnotations : undefined,
      });
    },
    onSuccess: () => {
      setReviewComment('');
      setAnnotations({});
      setDraftSavedAt(null);
      // 后端事务已删 draft,此处刷新 draft query 让 cache 一致(返回 null)
      void queryClient.invalidateQueries({ queryKey: ['plan-review-draft', planId] });
      void message.success('审核已提交');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '审核失败'),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => planApi.finalizePlan(planId),
    onSuccess: () => {
      void message.success('方案已定稿');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '定稿失败'),
  });

  const exportMutation = useMutation({
    mutationFn: () => planApi.exportPlan(planId),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-${planId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: () => message.error('导出失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => planApi.deletePlan(planId),
    onSuccess: () => {
      void message.success('方案已删除');
      void queryClient.invalidateQueries({ queryKey: ['teacher-plans'] });
      router.push('/teacher/plans');
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '删除失败'),
  });

  const updateMajorSelectionMutation = useMutation({
    mutationFn: ({
      itemId,
      selectedMajors,
      candidateMajorRanking,
    }: {
      itemId: number;
      selectedMajors: unknown[];
      candidateMajorRanking: unknown[];
    }) =>
      planApi.updateItem(planId, itemId, {
        selectedMajors,
        candidateMajorRanking,
      }),
    onSuccess: () => {
      const wasPendingReview = plan?.status === 'PENDING_REVIEW';
      void message.success(
        wasPendingReview ? '已保存，方案已退回草稿，请重新提交' : '专业选择已保存',
      );
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '专业选择保存失败'),
  });

  const annotationCount = Object.values(annotations).filter((s) => s && s.trim()).length;

  const confirmReview = (action: 'APPROVE' | 'REQUEST_CHANGE' | 'REJECT', title: string) => {
    Modal.confirm({
      title,
      width: 520,
      content: (
        <div className="space-y-3">
          <Input.TextArea
            rows={4}
            placeholder="填写总体审核意见（可选）"
            defaultValue={reviewComment}
            onChange={(e) => {
              const val = e.target.value;
              setReviewComment(val);
              debouncedSave(val, annotations);
            }}
          />
          {annotationCount > 0 ? (
            <p className="text-xs text-text-muted">
              已对 {annotationCount} 个志愿填写逐项批注，将随本次审核一起提交。
            </p>
          ) : null}
          {draftSavedAt ? (
            <p className="text-xs text-text-muted">
              草稿已保存于 {draftSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </p>
          ) : null}
        </div>
      ),
      okText: '提交',
      cancelText: '取消',
      onOk: () => reviewMutation.mutate(action),
    });
  };

  const confirmDeletePlan = () => {
    Modal.confirm({
      title: '删除草稿方案',
      content: `确认删除 ${plan?.studentName || '当前学生'} 的草稿方案？此操作不可恢复。`,
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: () => deleteMutation.mutateAsync(),
    });
  };

  // 上下文摘要计算
  const summary = useMemo(() => {
    const studentScore = plan?.scoreUsed ?? plan?.student?.totalScore ?? null;
    const studentRank = plan?.rankUsed ?? plan?.student?.provincialRank ?? null;
    const examType = plan?.student?.examType ?? null;
    const gradientCounts = items.reduce(
      (acc, it) => {
        if (it.gradient === 'CHONG') acc.chong++;
        else if (it.gradient === 'WEN') acc.wen++;
        else if (it.gradient === 'BAO') acc.bao++;
        return acc;
      },
      { chong: 0, wen: 0, bao: 0 },
    );
    const margins = items
      .map((it) => {
        const hist = getHistoricalScore(it);
        return studentScore != null && hist != null ? studentScore - hist.score : null;
      })
      .filter((m): m is number => m !== null);
    const avgMargin = margins.length
      ? Math.round((margins.reduce((a, b) => a + b, 0) / margins.length) * 10) / 10
      : null;
    const riskCount = items.filter(isItemRisky).length;
    return {
      studentScore,
      studentRank,
      examType,
      gradientCounts,
      avgMargin,
      riskCount,
    };
  }, [plan, items]);

  if (isLoading) {
    return (
      <div className="py-32 text-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!plan) {
    return <Empty description="方案不存在或无权访问" />;
  }

  const status: string = plan.status;
  const studentName = plan.studentName || '学生';
  const isReviewing = status === 'REVIEWING' || status === 'PENDING_REVIEW';

  // ── 主动作按钮（按 status 只突出一组） ──
  function renderPrimaryActions() {
    switch (status) {
      case 'DRAFT':
        return (
          <>
            <Button
              icon={<EditOutlined />}
              onClick={() => router.push(`/teacher/plans/generate/${plan.studentId}?planId=${plan.id}`)}
            >
              继续编辑
            </Button>
            <Button
              type="primary"
              icon={<SendOutlined />}
              disabled={!items.length}
              loading={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              提交审核
            </Button>
          </>
        );
      case 'PENDING_REVIEW':
        return (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={startReviewMutation.isPending}
            onClick={() => startReviewMutation.mutate()}
          >
            认领审核
          </Button>
        );
      case 'REVIEWING':
        return (
          <>
            <Button danger onClick={() => confirmReview('REJECT', '驳回方案')}>
              驳回
            </Button>
            <Button icon={<RollbackOutlined />} onClick={() => confirmReview('REQUEST_CHANGE', '退回老师修改')}>
              退回修改
            </Button>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => confirmReview('APPROVE', '通过审核')}
            >
              通过
            </Button>
          </>
        );
      case 'APPROVED':
        return <Tag color="processing">等待家长确认</Tag>;
      case 'PARENT_CONFIRMED':
        return (
          <Button
            type="primary"
            icon={<FileDoneOutlined />}
            loading={finalizeMutation.isPending}
            onClick={() => finalizeMutation.mutate()}
          >
            定稿
          </Button>
        );
      case 'FINALIZED':
        return <Tag color="success">已定稿</Tag>;
      default:
        return null;
    }
  }

  // ── 次动作（折叠到 Dropdown） ──
  const moreMenuItems = [
    {
      key: 'export',
      icon: <ExportOutlined />,
      label: '导出 PDF',
      onClick: () => exportMutation.mutate(),
    },
    ...(status === 'DRAFT'
      ? [
          {
            key: 'delete',
            icon: <DeleteOutlined />,
            label: '删除草稿',
            danger: true,
            onClick: confirmDeletePlan,
          },
        ]
      : []),
  ];

  // ── 志愿明细表 ──
  const columns: ColumnsType<any> = [
    { title: '#', dataIndex: 'sequence', width: 50, fixed: 'left' },
    {
      title: '院校 / 专业',
      key: 'name',
      render: (_, item) => (
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text">{item.universityName}</div>
          <div className="truncate text-xs text-text-muted">
            {item.groupName ? `${item.groupName} · ` : ''}
            {item.majorName}
          </div>
        </div>
      ),
    },
    {
      title: '梯度',
      dataIndex: 'gradient',
      width: 60,
      render: (g: string) => (
        <Tag color={GRADIENT_COLOR[g] || 'default'}>{GRADIENT_LABEL[g] || g || '-'}</Tag>
      ),
    },
    {
      title: '历史录取',
      key: 'historical',
      width: 110,
      render: (_: unknown, item: any) => {
        const active = getHistoricalScore(item);  // 当前算法用的那一档
        const rank = getHistoricalRank(item);

        // 收集所有可用档位用于 hover/tooltip
        const all: { source: HistoricalScoreSource; score: number }[] = [];
        if (item.score25Major != null) all.push({ source: 'major25', score: item.score25Major });
        if (item.score25Group != null) all.push({ source: 'group25', score: item.score25Group });
        if (item.score24Major != null) all.push({ source: 'major24', score: item.score24Major });
        if (all.length === 0 && item.lastYearMinScore != null) {
          all.push({ source: 'legacy', score: item.lastYearMinScore });
        }

        if (active == null && rank === null) {
          return <span className="text-xs text-text-faint">--</span>;
        }
        return (
          <div className="space-y-0.5">
            {active != null ? (
              <Tooltip
                title={
                  <div className="space-y-1 text-xs">
                    <div className="font-medium">历史录取分(各维度)</div>
                    {all.map((d) => (
                      <div key={d.source} className={d.source === active.source ? 'font-medium' : 'opacity-70'}>
                        {SOURCE_LABEL[d.source]}: {d.score}
                        {d.source === active.source ? ' ← 当前算法' : ''}
                      </div>
                    ))}
                    <div className="border-t border-white/20 pt-1 text-white/60">
                      数据来源:四川省教育考试院历年录取数据
                    </div>
                  </div>
                }
              >
                <div className="flex flex-col leading-tight cursor-default">
                  <span className={`text-sm font-medium ${SOURCE_TONE[active.source]}`}>
                    {active.score} 分
                  </span>
                  <span className="text-[10px] text-text-muted">{SOURCE_LABEL[active.source]}</span>
                </div>
              </Tooltip>
            ) : null}
            {rank !== null ? <div className="text-xs text-text-muted">{formatNumber(rank)} 位</div> : null}
          </div>
        );
      },
    },
    {
      title: '分差',
      key: 'margin',
      width: 80,
      sorter: (a, b) => {
        const histA = getHistoricalScore(a);
        const histB = getHistoricalScore(b);
        const sa = summary.studentScore != null && histA != null
          ? summary.studentScore - histA.score
          : Number.POSITIVE_INFINITY;
        const sb = summary.studentScore != null && histB != null
          ? summary.studentScore - histB.score
          : Number.POSITIVE_INFINITY;
        return sa - sb;
      },
      render: (_, item) => {
        const hist = getHistoricalScore(item);
        if (summary.studentScore == null || hist == null) {
          return <span className="text-xs text-text-faint">--</span>;
        }
        const margin = summary.studentScore - hist.score;
        const colorClass =
          margin < 0 ? 'text-rush' : margin >= 20 ? 'text-safe' : 'text-accent';
        return (
          <span className={`text-sm font-semibold ${colorClass}`}>
            {margin > 0 ? '+' : ''}
            {margin}
          </span>
        );
      },
    },
    {
      title: '招生',
      dataIndex: 'planCount',
      width: 60,
      render: (count: number | null | undefined) =>
        count ? <span className="text-sm">{count}</span> : <span className="text-xs text-text-faint">--</span>,
    },
    {
      title: '风险',
      key: 'risk',
      width: 80,
      render: (_, item) => {
        if (!isItemRisky(item)) return <Tag color="green">正常</Tag>;
        const reasons: string[] = [];
        if (item.overrideSoftFail) reasons.push('已覆盖灰色项');
        if (Array.isArray(item.softFailReasons)) reasons.push(...item.softFailReasons.map(String));
        if (item.riskWarning) reasons.push(String(item.riskWarning));
        return (
          <Tooltip title={<div className="text-xs">{reasons.join(' · ') || '存在风险'}</div>}>
            <Tag color="orange" icon={<WarningOutlined />}>
              风险
            </Tag>
          </Tooltip>
        );
      },
    },
    {
      title: '批注',
      key: 'annotation',
      width: 60,
      render: (_, item) => {
        const hasAnnotation = !!annotations[item.sequence]?.trim();
        return hasAnnotation ? <Tag color="blue">已写</Tag> : <span className="text-xs text-text-faint">--</span>;
      },
    },
  ];

  return (
    <div className="space-y-5">
      {/* A · sticky 顶部栏 */}
      <div className="sticky top-14 z-20 -mx-4 border-b border-border bg-bg/95 px-4 py-4 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Link
          href="/teacher/plans"
          className="inline-flex items-center gap-1 text-xs text-text-tertiary no-underline hover:text-primary"
        >
          <ArrowLeftOutlined /> 返回方案列表
        </Link>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
              <Link
                href={`/teacher/students/${plan.studentId}`}
                className="font-semibold text-text no-underline hover:text-primary"
              >
                {studentName}
              </Link>
              {summary.studentScore != null ? (
                <span className="text-sm text-text-muted">· {summary.studentScore} 分</span>
              ) : null}
              {summary.studentRank != null ? (
                <span className="text-sm text-text-muted">/ {formatNumber(summary.studentRank)} 位</span>
              ) : null}
              {summary.examType ? (
                <span className="text-sm text-text-muted">
                  · {EXAM_TYPE_LABEL[summary.examType] ?? summary.examType}
                </span>
              ) : null}
              <span className="text-text-faint">|</span>
              <span className="text-sm text-text-muted">{plan.batch || '-'}</span>
              <span className="text-sm text-text-muted">v{plan.version}</span>
              <PlanStatusBadge status={status} />
            </h1>
          </div>
          <Space wrap>
            {renderPrimaryActions()}
            {moreMenuItems.length > 0 ? (
              <Dropdown menu={{ items: moreMenuItems }} placement="bottomRight" trigger={['click']}>
                <Button icon={<MoreOutlined />} aria-label="更多操作" />
              </Dropdown>
            ) : null}
          </Space>
        </div>
      </div>

      {/* B · 上下文摘要卡 */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <SummaryCell
          label="学生"
          value={summary.studentScore != null ? `${summary.studentScore} 分` : '--'}
          sub={summary.studentRank != null ? `${formatNumber(summary.studentRank)} 位` : ''}
        />
        <SummaryCell
          label="冲 / 稳 / 保"
          value={
            <span>
              <span className="text-rush">{summary.gradientCounts.chong}</span>
              <span className="mx-1 text-text-faint">/</span>
              <span className="text-accent">{summary.gradientCounts.wen}</span>
              <span className="mx-1 text-text-faint">/</span>
              <span className="text-safe">{summary.gradientCounts.bao}</span>
            </span>
          }
          sub={items.length ? `共 ${items.length} 个志愿` : ''}
        />
        <SummaryCell
          label="平均分差"
          value={
            summary.avgMargin !== null ? (
              <span
                className={
                  summary.avgMargin < 0
                    ? 'text-rush'
                    : summary.avgMargin >= 20
                    ? 'text-safe'
                    : 'text-accent'
                }
              >
                {summary.avgMargin > 0 ? '+' : ''}
                {summary.avgMargin}
              </span>
            ) : (
              '--'
            )
          }
          sub="学生分 - 历史最低分"
        />
        <SummaryCell
          label="风险志愿"
          value={
            <span className={summary.riskCount > 0 ? 'text-rush' : 'text-safe'}>
              {summary.riskCount}
            </span>
          }
          sub={summary.riskCount > 0 ? '见表格风险列' : '无风险标记'}
        />
      </section>

      {/* 家长退回意见或定稿提示 */}
      {plan.parentChangeRequest ? (
        <Alert
          type="warning"
          showIcon
          message="家长退回修改意见"
          description={plan.parentChangeRequest}
        />
      ) : null}
      {status === 'APPROVED' ? (
        <Alert type="info" showIcon message="主管已通过，等待家长确认或退回修改。" />
      ) : null}
      {status === 'FINALIZED' ? (
        <Alert type="success" showIcon message="方案已定稿，后续修改请派生新版本。" />
      ) : null}

      {/* C · 志愿明细 */}
      <Card
        title={
          <span>
            志愿明细
            {draftSavedAt ? (
              <span className="ml-2 text-xs text-text-muted">
                · 草稿已保存 {draftSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            ) : null}
          </span>
        }
        className="rounded-2xl shadow-card"
      >
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={false}
          scroll={{ x: 820 }}
          expandable={{
            expandedRowRender: (item) => (
              <ItemExpansion
                item={item}
                planStatus={status}
                editable={status === 'DRAFT' || status === 'PENDING_REVIEW'}
                annotation={annotations[item.sequence] ?? ''}
                onAnnotationChange={(val) => {
                  setAnnotations((prev) => {
                    const next = { ...prev, [item.sequence]: val };
                    // 同步触发草稿保存(取最新的 reviewComment 和 next annotations)
                    debouncedSave(reviewComment, next);
                    return next;
                  });
                }}
                showAnnotationInput={isReviewing}
                saving={updateMajorSelectionMutation.isPending}
                onSaveMajors={(payload) =>
                  updateMajorSelectionMutation.mutate({ itemId: item.id, ...payload })
                }
              />
            ),
          }}
        />
      </Card>

      {/* D · 审核记录 Timeline */}
      <Card title="审核与确认记录" className="rounded-2xl shadow-card">
        {plan.reviews?.length ? (
          <Timeline
            items={plan.reviews.map((r: any) => {
              const actionMeta = REVIEW_ACTION_LABEL[r.action] ?? { text: r.action, color: 'default' };
              return {
                children: (
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text">
                        {r.reviewer?.realName || r.reviewer?.username || '系统'}
                      </span>
                      {r.reviewerRole ? <Tag>{r.reviewerRole}</Tag> : null}
                      <Tag color={actionMeta.color}>{actionMeta.text}</Tag>
                      <span className="text-xs text-text-muted">
                        {now ? formatRelativeTime(new Date(r.createdAt), now) : ''}
                      </span>
                    </div>
                    {r.comment ? (
                      <div className="text-sm text-text-secondary">{r.comment}</div>
                    ) : (
                      <div className="text-xs text-text-faint">无备注</div>
                    )}
                    {Array.isArray(r.itemAnnotations) && r.itemAnnotations.length > 0 ? (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-text-muted">
                          逐项批注（{r.itemAnnotations.length}）
                        </summary>
                        <ul className="mt-2 space-y-1 pl-4 text-xs">
                          {r.itemAnnotations.map((a: any) => (
                            <li key={a.sequence} className="list-disc text-text-secondary">
                              #{a.sequence}：{a.annotation}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                ),
              };
            })}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无审核记录" />
        )}
      </Card>

      {/* 志愿填报预案一览表（默认折叠 · 主要用于打印 / 填报对照） */}
      <Collapse
        className="rounded-2xl bg-surface shadow-card"
        items={[
          {
            key: 'preparation',
            label: (
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text">志愿填报预案一览表</span>
                <span className="text-xs text-text-muted">用于打印 / 填报对照，按需展开</span>
              </div>
            ),
            extra: (
              <Button
                size="small"
                icon={<FullscreenOutlined />}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowPreparationFullscreen(true);
                }}
              >
                全屏预览
              </Button>
            ),
            children: <PlanPreparationTable plan={plan} items={items} />,
          },
        ]}
      />

      <Modal
        title="志愿填报预案一览表"
        open={showPreparationFullscreen}
        onCancel={() => setShowPreparationFullscreen(false)}
        footer={null}
        width="92vw"
        style={{ top: 24 }}
        destroyOnClose
      >
        <PlanPreparationTable plan={plan} items={items} />
      </Modal>

      {/* E · 审下一份 */}
      {isReviewing && reviewQueue.length > 0 ? (
        <div className="sticky bottom-4 flex flex-col items-stretch gap-2 rounded-xl border border-border bg-surface px-5 py-3 shadow-card sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm text-text-muted">
            待审队列共 {reviewQueue.length} 份
            {currentIdx >= 0 ? ` · 当前第 ${currentIdx + 1}` : ''}
          </span>
          {nextInQueue ? (
            <Button
              type="primary"
              icon={<ArrowRightOutlined />}
              onClick={() => router.push(`/teacher/plans/${nextInQueue.id}`)}
            >
              审下一份（{nextInQueue.studentName || `#${nextInQueue.id}`}）
            </Button>
          ) : (
            <Tag color="success">本队列已审完</Tag>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── 摘要单元格 ──
function SummaryCell({
  label,
  value,
  sub,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="rounded-2xl bg-surface px-4 py-3 shadow-card">
      <p className="m-0 text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="m-0 mt-1 text-xl font-semibold text-text">{value}</p>
      {sub ? <p className="m-0 mt-0.5 text-xs text-text-muted">{sub}</p> : null}
    </div>
  );
}

// ── 展开行：推荐理由 + 风险 + 调剂建议 + 专业选择编辑器 + 教师批注 ──
function ItemExpansion({
  item,
  planStatus,
  editable,
  annotation,
  onAnnotationChange,
  showAnnotationInput,
  saving,
  onSaveMajors,
}: {
  item: any;
  planStatus: string;
  editable: boolean;
  annotation: string;
  onAnnotationChange: (val: string) => void;
  showAnnotationInput: boolean;
  saving?: boolean;
  onSaveMajors?: (payload: { selectedMajors: unknown[]; candidateMajorRanking: unknown[] }) => void;
}) {
  const hasMetaInfo = item.selectionReason || item.riskWarning || item.adjustmentAdvice;
  const hasMajorEditor =
    item.fullMajorRanking || item.selectedMajors?.length || item.recommendedOrder;

  return (
    <div className="space-y-4 py-2">
      {hasMetaInfo ? (
        <div className="grid gap-3 lg:grid-cols-3">
          {item.selectionReason ? (
            <InfoBlock label="推荐理由" tone="info" content={String(item.selectionReason)} />
          ) : null}
          {item.riskWarning ? (
            <InfoBlock label="风险提示" tone="warning" content={String(item.riskWarning)} />
          ) : null}
          {item.adjustmentAdvice ? (
            <InfoBlock label="调剂建议" tone="info" content={String(item.adjustmentAdvice)} />
          ) : null}
        </div>
      ) : null}

      {hasMajorEditor && onSaveMajors ? (
        <PlanMajorSelectionEditor
          item={item}
          status={planStatus}
          editable={editable}
          saving={saving}
          onSave={onSaveMajors}
        />
      ) : null}

      {showAnnotationInput ? (
        <div>
          <p className="mb-1 text-xs font-medium text-text-muted">
            教师逐项批注（仅本次审核携带）
          </p>
          <Input.TextArea
            rows={2}
            value={annotation}
            placeholder="对该志愿的具体意见，将随审核动作一起提交"
            onChange={(e) => onAnnotationChange(e.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}

function InfoBlock({
  label,
  tone,
  content,
}: {
  label: string;
  tone: 'info' | 'warning';
  content: string;
}) {
  const borderClass = tone === 'warning' ? 'border-l-rush' : 'border-l-primary';
  return (
    <div className={`rounded-md border-l-2 ${borderClass} bg-bg/40 px-3 py-2`}>
      <p className="m-0 text-[11px] font-medium uppercase tracking-wider text-text-muted">{label}</p>
      <p className="m-0 mt-1 whitespace-pre-line text-xs text-text-secondary">{content}</p>
    </div>
  );
}
