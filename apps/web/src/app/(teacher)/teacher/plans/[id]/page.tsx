'use client';

import { useEffect, useMemo, useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Button,
  Collapse,
  Dropdown,
  Empty,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Spin,
  Tag,
  message,
} from 'antd';
import {
  ArrowRightOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExportOutlined,
  FileDoneOutlined,
  FullscreenOutlined,
  MoreOutlined,
  PlayCircleOutlined,
  RightOutlined,
  RollbackOutlined,
  SendOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/stores/authStore';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';
import PlanMajorSelectionEditor from '../components/PlanMajorSelectionEditor';
import PlanPreparationTable from '../components/PlanPreparationTable';
import {
  getPlanItemMajorSelection,
  type PlanItemMajorSelectionLike,
} from '../generate/[studentId]/plan-workbench-utils';

const GRADIENT_LABEL: Record<string, string> = {
  CHONG: '冲',
  WEN: '稳',
  BAO: '保',
};

// 后端梯度枚举 → 设计稿 tier class (冲=rush / 稳=stable / 保=safe)
const GRADIENT_TIER: Record<string, 'rush' | 'stable' | 'safe'> = {
  CHONG: 'rush',
  WEN: 'stable',
  BAO: 'safe',
};

// 设计稿志愿表分段元信息 (顺序固定 冲→稳→保)
const TIER_META: {
  tier: 'rush' | 'stable' | 'safe';
  gradient: string;
  ch: string;
  label: string;
  en: string;
}[] = [
  { tier: 'rush', gradient: 'CHONG', ch: '冲', label: '冲一冲', en: 'REACH' },
  { tier: 'stable', gradient: 'WEN', ch: '稳', label: '稳一稳', en: 'MATCH' },
  { tier: 'safe', gradient: 'BAO', ch: '保', label: '保一保', en: 'SAFETY' },
];

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

// Timeline 圆点配色 (设计稿 pd2-tl-dot tone-*): 通过=safe / 驳回·退回=rush / 其余=muted
const REVIEW_ACTION_TONE: Record<string, 'safe' | 'rush' | 'primary' | 'muted'> = {
  APPROVE: 'safe',
  REJECT: 'rush',
  REQUEST_CHANGE: 'rush',
  COMMENT: 'muted',
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

type DiffKind = 'same' | 'modified' | 'added' | 'removed' | 'reordered';

interface DiffRow {
  sequence: number;
  current: any | null;
  compare: any | null;
  kind: DiffKind;
}

function diffPlanItems(currentItems: any[], compareItems: any[]): DiffRow[] {
  const currentBySeq = new Map<number, any>();
  currentItems.forEach((it) => currentBySeq.set(it.sequence, it));
  const compareBySeq = new Map<number, any>();
  compareItems.forEach((it) => compareBySeq.set(it.sequence, it));

  const allSeqs = new Set<number>([
    ...Array.from(currentBySeq.keys()),
    ...Array.from(compareBySeq.keys()),
  ]);
  const sortedSeqs = Array.from(allSeqs).sort((a, b) => a - b);

  const currentKey = (it: any) => `${it.universityId}-${it.majorId}`;
  const compareKey = (it: any) => `${it.universityId}-${it.majorId}`;
  const currentKeys = new Set(currentItems.map(currentKey));
  const compareKeys = new Set(compareItems.map(compareKey));

  return sortedSeqs.map((seq) => {
    const cur = currentBySeq.get(seq) ?? null;
    const cmp = compareBySeq.get(seq) ?? null;
    if (cur && cmp) {
      if (currentKey(cur) === compareKey(cmp)) {
        return { sequence: seq, current: cur, compare: cmp, kind: 'same' };
      }
      const curInCompare = compareKeys.has(currentKey(cur));
      const cmpInCurrent = currentKeys.has(compareKey(cmp));
      if (curInCompare && cmpInCurrent) {
        return { sequence: seq, current: cur, compare: cmp, kind: 'reordered' };
      }
      return { sequence: seq, current: cur, compare: cmp, kind: 'modified' };
    }
    if (cur && !cmp) {
      return { sequence: seq, current: cur, compare: null, kind: 'added' };
    }
    return { sequence: seq, current: null, compare: cmp, kind: 'removed' };
  });
}

const DIFF_BG: Record<DiffKind, string> = {
  same: 'bg-surface',
  modified: 'bg-amber-50',
  added: 'bg-green-50',
  removed: 'bg-red-50',
  reordered: 'bg-amber-50',
};

const DIFF_LABEL: Record<DiffKind, string> = {
  same: '',
  modified: '已修改',
  added: '新增',
  removed: '删除',
  reordered: '顺序变',
};

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const planId = params.id;

  // 审核动作(认领/驳回/退回/通过)后端只放行主管 (CASL isSupervisor 三道闸)。
  // 普通老师看到这些按钮点了必 403,误以为系统坏了 → 按角色分流。
  // zustand hydrate 有 race, 用 subscribe 同步 (沿用 dashboard 的模式)。
  const [isSupervisor, setIsSupervisor] = useState(false);
  useEffect(() => {
    const sync = () => setIsSupervisor(useAuthStore.getState().user?.teacherProfile?.isSupervisor === true);
    sync();
    return useAuthStore.subscribe(sync);
  }, []);

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
  // 对比模式:选另一版本对比当前版本
  const [compareVersionId, setCompareVersionId] = useState<number | null>(null);

  useEffect(() => {
    setNow(new Date());
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => planApi.getById(planId),
  });
  const plan = unwrap<Record<string, any>>(data);
  const items: any[] = plan?.items ?? [];

  // —— 志愿行段内拖拽排序 (与生成页同口径: 仅 DRAFT 可拖; 持久化到 sequence) ——
  const [localItems, setLocalItems] = useState<any[]>([]);
  useEffect(() => {
    // mutation 持有本地, 成功后 query 重拉再同步回来; 失败回滚也用它。
    setLocalItems(plan?.items ?? []);
  }, [plan?.id, (plan?.items ?? []).map((it: any) => `${it.id}:${it.sequence}`).join(',')]);
  const [dragRow, setDragRow] = useState<{ tier: string; pos: number } | null>(null);
  const [overRow, setOverRow] = useState<{ tier: string; pos: number } | null>(null);
  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => planApi.reorderItems(String(planId), ids),
    onSuccess: () => {
      void message.success('志愿顺序已保存');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message ?? '顺序保存失败');
      setLocalItems(plan?.items ?? []); // 回滚到服务端顺序
    },
  });
  // 单条删除志愿 (仅 DRAFT, 后端 canEditItems 兜底)
  const deleteItemMutation = useMutation({
    mutationFn: (itemId: number) => planApi.deleteItem(planId, itemId),
    onSuccess: () => {
      void message.success('已删除该院校专业组');
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '删除失败'),
  });
  // 清空全部志愿
  const clearItemsMutation = useMutation({
    mutationFn: () => planApi.clearItems(planId),
    onSuccess: (res: any) => {
      void message.success(`已清空 ${unwrap<any>(res)?.count ?? ''} 条志愿`);
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '清空失败'),
  });
  // 段内重排 → 重建整体顺序(冲→稳→保, 各段内序保留)→ 持久化全量 itemId 顺序
  const commitRowReorder = (tier: string, from: number, to: number) => {
    if (from === to) return;
    const byTier: Record<string, any[]> = { rush: [], stable: [], safe: [] };
    for (const it of localItems) byTier[GRADIENT_TIER[it.gradient] ?? 'rush'].push(it);
    const arr = byTier[tier];
    if (!arr || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return;
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    const next = [...byTier.rush, ...byTier.stable, ...byTier.safe];
    setLocalItems(next);
    reorderMutation.mutate(next.map((it) => it.id));
  };
  const handleRowDragEnd = () => {
    if (dragRow && overRow && dragRow.tier === overRow.tier) {
      commitRowReorder(dragRow.tier, dragRow.pos, overRow.pos);
    }
    setDragRow(null);
    setOverRow(null);
  };

  // 拉同学生同批次的所有版本(用于切换器)
  const { data: versionsData } = useQuery({
    queryKey: ['plan-versions', planId],
    queryFn: () => planApi.getVersions(planId),
    enabled: !!plan,
  });
  const versions = versionsData?.versions ?? [];

  // 当用户选择对比版本时,加载该版本的 items
  const { data: compareData } = useQuery({
    queryKey: ['plan-compare', compareVersionId],
    queryFn: () => planApi.getById(String(compareVersionId)),
    enabled: !!compareVersionId,
  });
  const comparePlan = unwrap<Record<string, any>>(compareData);
  const compareItems = comparePlan?.items ?? [];

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

  // REJECTED 方案不可编辑不可重交,派生 DRAFT 新版本是唯一出路
  // 撤回审核: 主管认领前老师可拉回草稿调序/改组 (PENDING_REVIEW → DRAFT)
  const withdrawMutation = useMutation({
    mutationFn: () => planApi.withdrawReview(planId),
    onSuccess: () => {
      void message.success('已撤回到草稿,可去生成工作台调整顺序后重新提交');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '撤回失败'),
  });

  const deriveMutation = useMutation({
    mutationFn: () => planApi.deriveVersion(planId),
    onSuccess: (data: any) => {
      void message.success('已派生新版本,可继续修改');
      const newId = data?.id;
      if (newId) {
        router.push(`/teacher/plans/${newId}`);
      } else {
        refresh();
      }
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '派生新版本失败'),
  });

  const exportMutation = useMutation({
    mutationFn: () => planApi.exportExcel(planId),
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `plan-${planId}.xlsx`;
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
    return {
      studentScore,
      studentRank,
      examType,
      gradientCounts,
      avgMargin,
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
  // 逐项批注框与"审下一份"队列只对主管开放 (普通老师没有审核权, 写了也提交不出去)
  const isReviewing = isSupervisor && (status === 'REVIEWING' || status === 'PENDING_REVIEW');

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
        // 仅主管能认领; 普通老师可在主管认领前撤回修改 (归属校验由后端兜底, 非本人撤回返回 403)
        return isSupervisor ? (
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={startReviewMutation.isPending}
            onClick={() => startReviewMutation.mutate()}
          >
            认领审核
          </Button>
        ) : (
          <>
            <Tag color="processing">已提交,等待主管认领审核</Tag>
            <Button
              danger
              icon={<RollbackOutlined />}
              loading={withdrawMutation.isPending}
              onClick={() =>
                Modal.confirm({
                  title: '撤回审核?',
                  content: '方案将退回草稿,可在生成工作台调整顺序、增删组;改完需要重新提交主管审核。',
                  okText: '撤回',
                  cancelText: '取消',
                  onOk: () => withdrawMutation.mutate(),
                })
              }
            >
              撤回修改
            </Button>
          </>
        );
      case 'REVIEWING':
        return isSupervisor ? (
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
        ) : (
          <Tag color="processing">主管审核中</Tag>
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
      case 'REJECTED':
        return (
          <>
            <Tag color="error">已驳回</Tag>
            <Button
              type="primary"
              icon={<EditOutlined />}
              loading={deriveMutation.isPending}
              onClick={() => deriveMutation.mutate()}
            >
              派生新版本修改
            </Button>
          </>
        );
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

  // 设计稿志愿表 4 个统计 (冲/稳/保 计数 + 招生计划合计)
  const planSum = items.reduce((acc, it) => acc + (it.planCount ?? 0), 0);

  return (
    <div className="pd2 view-transition">
      {/* —— Header (设计稿 pd2-header: 面包屑 + 学生 link + 分数/位次/科类 + 批次/版本/状态) —— */}
      <div className="pd2-header fade-up d1">
        <div className="lhs">
          <div className="crumb">
            <Link href="/teacher/plans">方案管理</Link>
            <span className="sep">/</span>
            <Link href={`/teacher/students/${plan.studentId}`}>{studentName}</Link>
            <span className="sep">/</span>
            <span>v{plan.version} 方案</span>
          </div>
          <h1>
            <Link className="stu-link" href={`/teacher/students/${plan.studentId}`}>
              {studentName}
            </Link>
            <span className="meta">
              {summary.examType === 'PHYSICS' || summary.examType === 'HISTORY' ? (
                <span className={`subj-chip ${summary.examType === 'PHYSICS' ? 'physics' : 'history'}`}>
                  {summary.examType === 'PHYSICS' ? '物理类' : '历史类'}
                </span>
              ) : summary.examType ? (
                <span>{EXAM_TYPE_LABEL[summary.examType] ?? summary.examType}</span>
              ) : null}
              {summary.studentScore != null ? <span>{summary.studentScore} 分</span> : null}
              {summary.studentRank != null ? (
                <>
                  <span className="dot" />
                  <span>位次 {formatNumber(summary.studentRank)}</span>
                </>
              ) : null}
            </span>
          </h1>
          <div className="version-line">
            <span className="batch">{plan.batch || '-'}</span>
            <span className="ver">v{plan.version}</span>
            <PlanStatusBadge status={status} />
            {plan.updatedAt && now ? (
              <span className="updated">更新于 {formatRelativeTime(new Date(plan.updatedAt), now)}</span>
            ) : null}
          </div>
        </div>
        <div className="actions">
          {/* 主操作 / 次操作 保留原 antd 业务逻辑 (状态机 + 权限) */}
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

      {/* —— 家长退回 banner (设计稿 pd2-parent-banner) —— */}
      {plan.parentChangeRequest ? (
        <div className="pd2-parent-banner fade-up">
          <span className="ic">
            <WarningOutlined />
          </span>
          <div>
            <strong>家长退回了 v{plan.version} 方案：</strong>
            <div className="quote">“{plan.parentChangeRequest}”</div>
          </div>
        </div>
      ) : null}
      {status === 'APPROVED' ? (
        <Alert type="info" showIcon message="主管已通过，等待家长确认或退回修改。" />
      ) : null}
      {status === 'FINALIZED' ? (
        <Alert type="success" showIcon message="方案已定稿，后续修改请派生新版本。" />
      ) : null}

      {/* —— 版本对比工具栏 (设计稿 pd2-compare-bar; antd Select 保留对比逻辑) —— */}
      {versions.length > 1 ? (
        <div className="pd2-compare-bar fade-up d2">
          <div className="lhs">
            <span className="pd2-lbl">版本对比：</span>
            <Select
              size="small"
              allowClear
              placeholder="选择另一版本对比"
              value={compareVersionId}
              onChange={(val) => setCompareVersionId(val ?? null)}
              style={{ minWidth: 240 }}
              options={versions
                .filter((v) => v.id !== Number(planId))
                .map((v) => ({
                  label: `v${v.versionNo}${v.versionNote ? ` (${v.versionNote})` : ''} · ${v.status}`,
                  value: v.id,
                }))}
            />
            {compareVersionId !== null ? (
              <Button size="small" onClick={() => setCompareVersionId(null)}>
                退出对比
              </Button>
            ) : null}
          </div>
          <div className="rhs">
            共 <strong>{versions.length}</strong> 个版本 · 当前 <strong>v{plan.version}</strong>
          </div>
        </div>
      ) : null}

      {/* —— 版本对比面板 —— */}
      {compareVersionId !== null && compareItems.length > 0 ? (
        <ComparePanel
          currentItems={items}
          compareItems={compareItems}
          currentLabel={`v${plan?.versionNo ?? '?'}`}
          compareLabel={`v${comparePlan?.versionNo ?? '?'}`}
        />
      ) : null}

      {/* —— Summary (设计稿 pd-summary: 冲/稳/保/招生计划合计) —— */}
      <div className="pd-summary fade-up d2">
        <div className="pd-stat t-rush">
          <div className="k">冲 · Reach</div>
          <div className="v">{summary.gradientCounts.chong}</div>
          <div className="sub">高于位次 · 冲刺院校</div>
        </div>
        <div className="pd-stat t-stable">
          <div className="k">稳 · Match</div>
          <div className="v">{summary.gradientCounts.wen}</div>
          <div className="sub">持平位次 · 稳妥院校</div>
        </div>
        <div className="pd-stat t-safe">
          <div className="k">保 · Safety</div>
          <div className="v">{summary.gradientCounts.bao}</div>
          <div className="sub">低于位次 · 保底院校</div>
        </div>
        <div className="pd-stat t-all">
          <div className="k">招生计划合计</div>
          <div className="v">{planSum || '--'}</div>
          <div className="sub">所有专业组招生人数总和</div>
        </div>
      </div>


      {/* —— 主管审核 panel (REVIEWING/PENDING_REVIEW + 主管; 设计稿 pd2-review-panel) —— */}
      {isReviewing ? (
        <div className="pd2-review-panel fade-up d2">
          <div className="head">
            <h3>
              主管审核
              <span className="status-pill">{status === 'REVIEWING' ? '审核中' : '待认领'}</span>
            </h3>
            <div className="meta">
              {annotationCount > 0 ? (
                <span>
                  已对 <strong>{annotationCount}</strong> 个志愿填写逐项批注，将随审核动作一起提交
                </span>
              ) : (
                <span>可对每条志愿单独批注，或填写总体审核意见后通过 / 退回</span>
              )}
              {draftSavedAt ? (
                <span>
                  {' '}· 草稿已保存{' '}
                  {draftSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                </span>
              ) : null}
            </div>
          </div>
          <textarea
            className="pd2-reviewer-textarea"
            placeholder="填写总体审核意见（可选），通过 / 退回 时一起提交"
            value={reviewComment}
            onChange={(e) => {
              const val = e.target.value;
              setReviewComment(val);
              debouncedSave(val, annotations);
            }}
            rows={3}
          />
        </div>
      ) : null}

      {/* —— 24 条志愿表 (设计稿 pl-tbl div-grid) —— */}
      <div className="pl-tbl fade-up d3">
        <div className="pl-tbl-toolhint">
          <span className="ic">
            <FileDoneOutlined />
          </span>
          点击任意行查看并编辑<b>组内专业</b>
          {draftSavedAt ? (
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
              草稿已保存 {draftSavedAt.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          ) : null}
          {status === 'DRAFT' && localItems.length > 0 ? (
            <Popconfirm
              title="清空全部志愿"
              description={`确认删除当前方案的全部 ${localItems.length} 条院校专业组？此操作不可恢复。`}
              okText="清空"
              okButtonProps={{ danger: true }}
              cancelText="取消"
              onConfirm={() => clearItemsMutation.mutate()}
            >
              <Button
                size="small"
                danger
                type="text"
                icon={<DeleteOutlined />}
                loading={clearItemsMutation.isPending}
                style={{ marginLeft: draftSavedAt ? 8 : 'auto' }}
              >
                清空
              </Button>
            </Popconfirm>
          ) : null}
        </div>
        <div className="pl-tbl-head">
          <span>顺位</span>
          <span>梯度</span>
          <span>院校</span>
          <span>专业组</span>
          <span>专业</span>
          <span style={{ textAlign: 'right' }}>计划</span>
          <span style={{ textAlign: 'right' }}>最低分</span>
          <span style={{ textAlign: 'right' }}>最低位次</span>
          <span>{isReviewing ? '批注' : ''}</span>
        </div>

        {localItems.length === 0 ? (
          <div style={{ padding: '32px 22px' }}>
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无志愿明细" />
          </div>
        ) : (
          TIER_META.map((meta) => {
            const tierItems = localItems.filter((it) => GRADIENT_TIER[it.gradient] === meta.tier);
            if (tierItems.length === 0) return null;
            const canDragRows = status === 'DRAFT' && !reorderMutation.isPending;
            return (
              <div key={meta.tier}>
                <div className={`pl-section t-${meta.tier}`}>
                  <span className="lbl">
                    ● {meta.ch} · {meta.label}
                  </span>
                  <span className="sub">
                    {meta.en} · 本段 {tierItems.length} 条
                  </span>
                </div>
                {tierItems.map((item, pos) => (
                  <PlanRow
                    key={item.id}
                    item={item}
                    studentRank={summary.studentRank}
                    reviewMode={isReviewing}
                    canDrag={canDragRows}
                    isDragging={dragRow?.tier === meta.tier && dragRow?.pos === pos}
                    isDragOver={overRow?.tier === meta.tier && overRow?.pos === pos && !(dragRow?.tier === meta.tier && dragRow?.pos === pos)}
                    onDragStartRow={() => setDragRow({ tier: meta.tier, pos })}
                    onDragOverRow={() => { if (dragRow && dragRow.tier === meta.tier) setOverRow({ tier: meta.tier, pos }); }}
                    onDragEndRow={handleRowDragEnd}
                    annotation={annotations[item.sequence] ?? ''}
                    hasAnnotation={!!annotations[item.sequence]?.trim()}
                    onAnnotationChange={(val) => {
                      setAnnotations((prev) => {
                        const next = { ...prev, [item.sequence]: val };
                        debouncedSave(reviewComment, next);
                        return next;
                      });
                    }}
                    planStatus={status}
                    editable={status === 'DRAFT' || status === 'PENDING_REVIEW'}
                    saving={updateMajorSelectionMutation.isPending}
                    onSaveMajors={(payload) =>
                      updateMajorSelectionMutation.mutate({ itemId: item.id, ...payload })
                    }
                    canDelete={status === 'DRAFT'}
                    deleting={deleteItemMutation.isPending && deleteItemMutation.variables === item.id}
                    onDelete={() => deleteItemMutation.mutate(item.id)}
                  />
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* —— 审核与确认记录 Timeline (设计稿 pd2-timeline) —— */}
      <div className="pd2-timeline fade-up d4">
        <h3>审核与确认记录</h3>
        {plan.reviews?.length ? (
          <div className="pd2-tl-list">
            {[...plan.reviews].reverse().map((r: any) => {
              const actionMeta = REVIEW_ACTION_LABEL[r.action] ?? { text: r.action, color: 'default' };
              const tone = REVIEW_ACTION_TONE[r.action] ?? 'muted';
              return (
                <div className="pd2-tl-item" key={r.id ?? `${r.action}-${r.createdAt}`}>
                  <span className={`pd2-tl-dot tone-${tone}`}>
                    {tone === 'safe' ? (
                      <CheckCircleOutlined />
                    ) : tone === 'rush' ? (
                      <WarningOutlined />
                    ) : (
                      <SendOutlined />
                    )}
                  </span>
                  <div className="pd2-tl-body">
                    <div className="pd2-tl-head">
                      <strong>{r.reviewer?.realName || r.reviewer?.username || '系统'}</strong>
                      {r.reviewerRole ? <span className="pd2-role-tag">{r.reviewerRole}</span> : null}
                      <span className={`pd2-action-tag tone-${tone}`}>{actionMeta.text}</span>
                      <span className="pd2-tl-time">
                        {now ? formatRelativeTime(new Date(r.createdAt), now) : ''}
                      </span>
                    </div>
                    {r.comment ? <div className="pd2-tl-comment">{r.comment}</div> : null}
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
                </div>
              );
            })}
          </div>
        ) : (
          <div className="pd2-tl-empty">暂无审核记录</div>
        )}
      </div>

      {/* —— 志愿填报预案一览表 (默认折叠 · 打印 / 填报对照, 保留 antd Collapse + Modal) —— */}
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

      {/* —— 审下一份 (保留原业务逻辑) —— */}
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
/* SummaryCell 已被设计稿 .stat-cluster + .scell 替换, 函数定义删除避免 unused. */

// ── 志愿行 (设计稿 pl-row div-grid): 院校/专业组/专业/计划/历史分位次 + 点击展开组内专业编辑 ──
function PlanRow({
  item,
  studentRank,
  reviewMode,
  annotation,
  hasAnnotation,
  onAnnotationChange,
  planStatus,
  editable,
  saving,
  onSaveMajors,
  canDrag,
  isDragging,
  isDragOver,
  onDragStartRow,
  onDragOverRow,
  onDragEndRow,
  canDelete,
  deleting,
  onDelete,
}: {
  item: any;
  studentRank: number | null;
  reviewMode: boolean;
  annotation: string;
  hasAnnotation: boolean;
  onAnnotationChange: (val: string) => void;
  planStatus: string;
  editable: boolean;
  saving?: boolean;
  onSaveMajors?: (payload: { selectedMajors: unknown[]; candidateMajorRanking: unknown[] }) => void;
  canDrag?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStartRow?: () => void;
  onDragOverRow?: () => void;
  onDragEndRow?: () => void;
  canDelete?: boolean;
  deleting?: boolean;
  onDelete?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const tier = GRADIENT_TIER[item.gradient] ?? 'rush';

  // 已填报专业摘要 (设计稿 majors 列): 取已选专业名拼接, 回退到 majorName
  const selection = getPlanItemMajorSelection(item as PlanItemMajorSelectionLike);
  const selectedCount = selection.selectedMajors.length;
  const poolCount = selection.candidateMajorRanking.length || selectedCount;
  const fillTxt =
    selectedCount > 0
      ? selection.selectedMajors.map((m) => m.majorName).join(' / ')
      : item.majorName || '—';

  // 历史最低分 / 位次 (复用现有取数算法)
  const hist = getHistoricalScore(item);
  const histRank = getHistoricalRank(item);
  // 最低位次相对学生位次差 (设计稿: 低 N=保险绿 / 高 N=偏险红)
  let rankDiff: React.ReactNode = null;
  if (histRank != null && studentRank != null) {
    const diff = histRank - studentRank;
    rankDiff =
      diff > 0 ? (
        <span style={{ color: 'var(--safe)' }}>低 {Math.abs(diff).toLocaleString()}</span>
      ) : diff < 0 ? (
        <span style={{ color: 'var(--rush)' }}>高 {Math.abs(diff).toLocaleString()}</span>
      ) : (
        <span>持平</span>
      );
  }

  const hasMetaInfo = item.selectionReason || item.riskWarning || item.adjustmentAdvice;
  const hasMajorEditor = item.fullMajorRanking || item.selectedMajors?.length || item.recommendedOrder;

  return (
    <>
      <div
        className={`pl-row ${expanded ? 'is-expanded' : ''} ${canDrag ? 'can-drag' : ''} ${isDragging ? 'is-dragging' : ''} ${isDragOver ? 'is-dragover' : ''}`}
        draggable={canDrag}
        onDragStart={(e) => {
          if (!canDrag) return;
          onDragStartRow?.();
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => {
          if (!canDrag) return;
          e.preventDefault();
          onDragOverRow?.();
        }}
        onDragEnd={() => onDragEndRow?.()}
        onClick={(e) => {
          // 批注按钮单独处理, 不触发展开
          if ((e.target as HTMLElement).closest('.pd2-annotate-btn')) return;
          setExpanded((v) => !v);
        }}
      >
        <span className="idx">
          <span
            className="pl-grip"
            title={canDrag ? '拖动调整顺位' : (planStatus === 'PENDING_REVIEW' ? '审核中 — 点「撤回修改」退回草稿后可调序' : '仅草稿状态可调序')}
          >⋮⋮</span>
          {String(item.sequence).padStart(2, '0')}
        </span>
        <span className={`tier-dot t-${tier}`}>{GRADIENT_LABEL[item.gradient] ?? '-'}</span>
        <div className="uni">
          <div>
            <div className="uname">{item.universityName}</div>
            <div className="ucode">院校代码 {item.universityCode || '—'}</div>
          </div>
        </div>
        <span className="grp">{item.groupCode || '—'}</span>
        <div className="majors">
          <span className={`pl-major-chev ${expanded ? 'is-open' : ''}`}>
            <RightOutlined />
          </span>
          <span className="pl-major-txt">{fillTxt}</span>
          <span className="pl-major-count">
            已填 {selectedCount}/6 · 组内 {poolCount} 个
          </span>
          {item.selectionReason ? (
            <div
              style={{
                fontSize: 10.5,
                color: 'var(--text-faint)',
                marginTop: 3,
                fontStyle: 'italic',
                flexBasis: '100%',
              }}
            >
              理由 · {item.selectionReason}
            </div>
          ) : null}
        </div>
        <span className="plan">{item.planCount ?? '—'}</span>
        <span className="score">{hist != null ? hist.score : '—'}</span>
        <span className="rank">
          {histRank != null ? histRank.toLocaleString() : '—'}
          {rankDiff ? (
            <>
              <br />
              <span style={{ fontSize: 10.5 }}>{rankDiff}</span>
            </>
          ) : null}
        </span>
        <span className="more">
          {reviewMode ? (
            <button
              type="button"
              className={`pd2-annotate-btn ${hasAnnotation ? 'has' : ''}`}
              onClick={() => setAnnotateOpen((o) => !o)}
              title={hasAnnotation ? '已批注' : '加批注'}
            >
              {hasAnnotation ? '已写' : '+'}
            </button>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {canDelete && onDelete ? (
                // 阻止冒泡: 否则点击会触发整行展开
                <span onClick={(e) => e.stopPropagation()}>
                  <Popconfirm
                    title="删除该院校专业组"
                    description={`确认从方案中删除「${item.universityName}${item.groupCode ? ' · ' + item.groupCode : ''}」？`}
                    okText="删除"
                    okButtonProps={{ danger: true }}
                    cancelText="取消"
                    onConfirm={onDelete}
                  >
                    <Button
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      loading={deleting}
                      title="从方案中删除此院校专业组"
                    />
                  </Popconfirm>
                </span>
              ) : null}
              <span className={`pl-row-chev ${expanded ? 'is-open' : ''}`} title={expanded ? '收起' : '查看组内专业'}>
                <DownOutlined />
              </span>
            </span>
          )}
        </span>
      </div>

      {expanded ? (
        <div className="pl-majors-panel">
          <div className="pl-majors-head">
            组内专业 · 选择并排序填报
            <span className="sub">
              [{item.groupCode || '—'}] {item.universityName} · 平行志愿每组最多填 6 个，顺序即调剂优先级
            </span>
          </div>
          <div className="space-y-4">
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
          </div>
        </div>
      ) : null}

      {reviewMode && annotateOpen ? (
        <div className="pd2-annotate-row">
          <span className="pd2-annotate-label">教师对第 {item.sequence} 顺位的批注</span>
          <textarea
            value={annotation}
            onChange={(e) => onAnnotationChange(e.target.value)}
            placeholder="对该志愿的具体意见，将随审核动作一起提交"
            rows={2}
          />
        </div>
      ) : null}
    </>
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

function ComparePanel({
  currentItems,
  compareItems,
  currentLabel,
  compareLabel,
}: {
  currentItems: any[];
  compareItems: any[];
  currentLabel: string;
  compareLabel: string;
}) {
  const rows = diffPlanItems(currentItems, compareItems);
  const summary = rows.reduce(
    (acc, r) => {
      acc[r.kind] = (acc[r.kind] ?? 0) + 1;
      return acc;
    },
    {} as Record<DiffKind, number>,
  );

  return (
    <div className="rounded-lg border border-border-subtle bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="m-0 text-base font-semibold text-text">版本对比</h3>
        <p className="m-0 text-xs text-text-muted">
          相同 {summary.same ?? 0} · 修改 {summary.modified ?? 0} · 顺序变{' '}
          {summary.reordered ?? 0} · 新增 {summary.added ?? 0} · 删除{' '}
          {summary.removed ?? 0}
        </p>
      </div>
      <div className="grid grid-cols-[60px_1fr_1fr] gap-1 text-xs">
        <div className="font-medium text-text-muted">#</div>
        <div className="font-medium text-text">{currentLabel}(当前)</div>
        <div className="font-medium text-text">{compareLabel}(对比)</div>
        {rows.map((row) => (
          <ComparePanelRow key={row.sequence} row={row} />
        ))}
      </div>
    </div>
  );
}

function ComparePanelRow({ row }: { row: DiffRow }) {
  const bg = DIFF_BG[row.kind];
  return (
    <>
      <div className={`flex items-start gap-1 rounded-l py-2 pl-2 ${bg}`}>
        <span className="text-text">{row.sequence}</span>
        {row.kind !== 'same' ? (
          <span className="rounded bg-text-muted/20 px-1 text-[10px] text-text-muted">
            {DIFF_LABEL[row.kind]}
          </span>
        ) : null}
      </div>
      <div className={`px-2 py-2 ${bg}`}>
        {row.current ? (
          <div>
            <p className="m-0 truncate text-sm">{row.current.universityName}</p>
            <p className="m-0 text-[11px] text-text-muted">
              {row.current.groupName} · {row.current.majorName}
            </p>
          </div>
        ) : (
          <span className="text-text-muted">--</span>
        )}
      </div>
      <div className={`rounded-r px-2 py-2 ${bg}`}>
        {row.compare ? (
          <div>
            <p className="m-0 truncate text-sm">{row.compare.universityName}</p>
            <p className="m-0 text-[11px] text-text-muted">
              {row.compare.groupName} · {row.compare.majorName}
            </p>
          </div>
        ) : (
          <span className="text-text-muted">--</span>
        )}
      </div>
    </>
  );
}

