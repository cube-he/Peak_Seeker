'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Alert, Button, Card, Descriptions, Empty, Input, Modal, Select, Space, Spin, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, CheckOutlined, DeleteOutlined, FileTextOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type EligibleBatch } from '@/services/student-api';
import { planApi } from '@/services/plan-api';
import {
  findPlanForBatch,
  formatCandidateGroup,
  getLatestPlansByBatch,
  sortPlansForWorkbench,
  type WorkbenchPlan,
} from './plan-workbench-utils';

interface Candidate {
  enrollmentPlanId: number;
  universityName: string;
  groupCode?: string;
  groupName?: string | null;
  majorCode?: string;
  majorName: string;
  recruitType?: string;
  suggestedGradient: 'CHONG' | 'WEN' | 'BAO';
  matchStatus: 'PASS' | 'SOFT_FAIL';
  failReasons: Array<{ rule: string; note: string; severity?: string }>;
  history?: { rank25Group?: number | null; rank25Major?: number | null };
  tuition?: number | null;
  planCount?: number | null;
}

interface CandidateListResult {
  items: Candidate[];
  total: number;
  planYear?: number;
  sourceYear?: number;
  sourceBatchName?: string;
  isFallbackYear?: boolean;
}

const GRADIENT_LABEL: Record<string, string> = {
  CHONG: '冲',
  WEN: '稳',
  BAO: '保',
};

function unwrap<T>(value: any): T {
  return (value?.data ?? value) as T;
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
  const [includeSoftFails, setIncludeSoftFails] = useState(true);

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

  const { data: candidateData, isFetching: candidateLoading } = useQuery({
    queryKey: ['plan-candidates', planId, keyword, includeSoftFails],
    queryFn: () => planApi.getCandidates(planId!, { page: 1, pageSize: 60, keyword, includeSoftFails }),
    enabled: !!planId,
  });
  const candidates = unwrap<CandidateListResult>(candidateData);
  const isUsingFallbackYear = Boolean(candidates?.isFallbackYear && candidates.sourceYear && candidates.planYear);
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
    mutationFn: (candidate: Candidate) =>
      planApi.addItem(planId!, {
        enrollmentPlanId: candidate.enrollmentPlanId,
        gradient: candidate.suggestedGradient,
        softFailReasons: candidate.failReasons,
        softFailOverrideConfirmed: candidate.matchStatus === 'SOFT_FAIL' ? true : undefined,
        overrideReason: candidate.matchStatus === 'SOFT_FAIL' ? '老师确认后覆盖软限制加入' : undefined,
      }),
    onSuccess: () => {
      void message.success('已加入方案');
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

  const addCandidate = (candidate: Candidate) => {
    if (candidate.matchStatus === 'SOFT_FAIL') {
      Modal.confirm({
        title: '确认加入灰色候选项？',
        content: candidate.failReasons.map((r) => r.note).join('；') || '该候选项存在软限制风险。',
        okText: '确认加入',
        cancelText: '取消',
        onOk: () => addMutation.mutate(candidate),
      });
      return;
    }
    addMutation.mutate(candidate);
  };

  const columns: ColumnsType<Candidate> = [
    {
      title: '院校专业组 / 专业',
      key: 'name',
      render: (_, c) => (
        <div className={c.matchStatus === 'SOFT_FAIL' ? 'text-text-muted' : 'text-text'}>
          <div className="font-medium">{c.universityName}</div>
          <div className="mt-1 text-xs text-text-muted">{formatCandidateGroup(c)}</div>
          <div className="mt-1 text-xs">
            {c.majorCode ? `${c.majorCode} ` : ''}{c.majorName}
          </div>
        </div>
      ),
    },
    {
      title: '梯度',
      dataIndex: 'suggestedGradient',
      width: 70,
      render: (v: string) => <Tag>{GRADIENT_LABEL[v] || v}</Tag>,
    },
    {
      title: '历史位次',
      width: 110,
      render: (_, c) => c.history?.rank25Group ?? c.history?.rank25Major ?? '-',
    },
    {
      title: '状态',
      width: 120,
      render: (_, c) =>
        c.matchStatus === 'SOFT_FAIL' ? (
          <Tag color="default">灰色</Tag>
        ) : (
          <Tag color="green">可选</Tag>
        ),
    },
    {
      title: '操作',
      width: 90,
      render: (_, c) => (
        <Button size="small" icon={<PlusOutlined />} onClick={() => addCandidate(c)} loading={addMutation.isPending}>
          加入
        </Button>
      ),
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

      <Card className="rounded-2xl shadow-card">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-center">
          <Descriptions title="生成方案工作台" size="small" column={{ xs: 1, sm: 2, lg: 4 }}>
            <Descriptions.Item label="学生">{student?.user?.realName || student?.realName || student?.user?.username}</Descriptions.Item>
            <Descriptions.Item label="总分">{student?.totalScore ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="位次">{student?.provincialRank ?? '-'}</Descriptions.Item>
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
                disabled={plan?.status !== 'DRAFT' || !plan?.items?.length}
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
          <Alert className="mt-4" type="warning" showIcon message="学生资料尚未确认，需先在学生详情页完成资料审核。" />
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
      </Card>

      {planId ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_360px]">
          <Card
            title="系统筛选候选池"
            extra={
              <Space>
                <Input.Search placeholder="院校/专业关键词" allowClear onSearch={setKeyword} className="w-[220px]" />
                <Select
                  value={includeSoftFails ? 'all' : 'pass'}
                  onChange={(v) => setIncludeSoftFails(v === 'all')}
                  options={[
                    { label: '显示灰色项', value: 'all' },
                    { label: '仅可选项', value: 'pass' },
                  ]}
                  className="w-[130px]"
                />
              </Space>
            }
            className="rounded-2xl shadow-card"
          >
            {isUsingFallbackYear ? (
              <Alert
                className="mb-4"
                type="info"
                showIcon
                message={`当前候选池参考 ${candidates.sourceYear} 年招生计划，方案年份仍为 ${candidates.planYear}。`}
              />
            ) : null}
            <Table
              rowKey="enrollmentPlanId"
              columns={columns}
              dataSource={candidates?.items ?? []}
              loading={candidateLoading}
              pagination={{ pageSize: 20, showSizeChanger: false }}
              rowClassName={(row) => (row.matchStatus === 'SOFT_FAIL' ? 'opacity-50 bg-gray-50' : '')}
              expandable={{
                expandedRowRender: (row) => (
                  <div className="text-xs text-text-muted">
                    {row.failReasons.length ? row.failReasons.map((r) => r.note).join('；') : '无软限制风险'}
                  </div>
                ),
              }}
            />
          </Card>

          <Card title="当前方案" loading={planFetching} className="rounded-2xl shadow-card">
            {plan?.items?.length ? (
              <div className="space-y-2">
                {plan.items.map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-border-subtle px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.order}. {item.universityName}</span>
                      <Space size={4}>
                        <Tag>{GRADIENT_LABEL[item.gradient] || item.gradient}</Tag>
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
                    <div className="mt-1 text-xs text-text-muted">
                      {item.groupCode ? `专业组 ${item.groupCode} · ` : ''}{item.majorName}
                    </div>
                    {item.overrideSoftFail ? <Tag className="mt-2" color="orange">已覆盖灰色限制</Tag> : null}
                  </div>
                ))}
              </div>
            ) : (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="从左侧候选池加入志愿项" />
            )}
            <Button
              className="mt-4 w-full"
              type="primary"
              icon={<CheckOutlined />}
              disabled={plan?.status !== 'DRAFT' || !plan?.items?.length}
              loading={submitMutation.isPending}
              onClick={() => submitMutation.mutate()}
            >
              提交主管审核
            </Button>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
