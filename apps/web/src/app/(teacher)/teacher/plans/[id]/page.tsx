'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Button, Card, Descriptions, Empty, Input, Modal, Space, Spin, Table, Tag, Timeline, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, CheckCircleOutlined, EditOutlined, ExportOutlined, FileDoneOutlined, PlayCircleOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';
import PlanMajorSelectionEditor from '../components/PlanMajorSelectionEditor';

const GRADIENT_LABEL: Record<string, string> = {
  CHONG: '冲',
  WEN: '稳',
  BAO: '保',
};

function unwrap<T>(value: any): T {
  return (value?.data ?? value) as T;
}

export default function PlanDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const planId = params.id;
  const [reviewComment, setReviewComment] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => planApi.getById(planId),
  });
  const plan = unwrap<Record<string, any>>(data);
  const items = plan?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });

  const submitMutation = useMutation({
    mutationFn: () => planApi.submitForReview(planId),
    onSuccess: () => { void message.success('已提交审核'); refresh(); },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '提交失败'),
  });

  const startReviewMutation = useMutation({
    mutationFn: () => planApi.startReview(planId),
    onSuccess: () => { void message.success('已认领审核'); refresh(); },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '认领失败'),
  });

  const reviewMutation = useMutation({
    mutationFn: (action: 'APPROVE' | 'REQUEST_CHANGE' | 'REJECT') =>
      planApi.reviewPlan(planId, { action, comment: reviewComment }),
    onSuccess: () => {
      setReviewComment('');
      void message.success('审核动作已提交');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '审核失败'),
  });

  const finalizeMutation = useMutation({
    mutationFn: () => planApi.finalizePlan(planId),
    onSuccess: () => { void message.success('方案已定稿'); refresh(); },
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

  const updateMajorSelectionMutation = useMutation({
    mutationFn: ({
      itemId,
      selectedMajors,
      candidateMajorRanking,
    }: {
      itemId: number;
      selectedMajors: unknown[];
      candidateMajorRanking: unknown[];
    }) => planApi.updateItem(planId, itemId, {
      selectedMajors,
      candidateMajorRanking,
    }),
    onSuccess: () => {
      const wasPendingReview = plan?.status === 'PENDING_REVIEW';
      void message.success(wasPendingReview ? '已保存，方案已退回草稿，请重新提交' : '专业选择已保存');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '专业选择保存失败'),
  });

  const confirmReview = (action: 'APPROVE' | 'REQUEST_CHANGE' | 'REJECT', title: string) => {
    Modal.confirm({
      title,
      content: (
        <Input.TextArea
          rows={4}
          placeholder="填写总体审核意见"
          defaultValue={reviewComment}
          onChange={(e) => setReviewComment(e.target.value)}
        />
      ),
      okText: '提交',
      cancelText: '取消',
      onOk: () => reviewMutation.mutate(action),
    });
  };

  const columns: ColumnsType<any> = [
    { title: '序号', dataIndex: 'order', width: 70 },
    { title: '院校', dataIndex: 'universityName' },
    { title: '专业', render: (_, item) => item.recommendedOrder ?? item.majorName },
    { title: '梯度', dataIndex: 'gradient', width: 80, render: (v) => <Tag>{GRADIENT_LABEL[v] || v}</Tag> },
    { title: '历史位次', dataIndex: 'historicalMinRank', width: 120, render: (v) => v ?? '-' },
    {
      title: '风险',
      width: 120,
      render: (_, item) => item.overrideSoftFail ? <Tag color="orange">覆盖灰色项</Tag> : <Tag color="green">常规</Tag>,
    },
  ];

  if (isLoading) {
    return <div className="py-32 text-center"><Spin size="large" /></div>;
  }

  if (!plan) {
    return <Empty description="方案不存在或无权访问" />;
  }

  return (
    <div className="space-y-5">
      <Link href="/teacher/plans" className="inline-flex items-center gap-2 text-sm text-text-tertiary no-underline">
        <ArrowLeftOutlined /> 返回方案列表
      </Link>

      <Card className="rounded-2xl shadow-card">
        <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
          <Descriptions title={plan.name || '方案详情'} column={{ xs: 1, sm: 2, lg: 4 }} size="small">
            <Descriptions.Item label="学生">{plan.studentName || '-'}</Descriptions.Item>
            <Descriptions.Item label="批次">{plan.batch || '-'}</Descriptions.Item>
            <Descriptions.Item label="版本">v{plan.version || 1}</Descriptions.Item>
            <Descriptions.Item label="状态"><PlanStatusBadge status={plan.status} /></Descriptions.Item>
            <Descriptions.Item label="志愿数">{items.length}</Descriptions.Item>
            <Descriptions.Item label="学生确认">{plan.studentConfirmedAt ? '已确认' : '未确认'}</Descriptions.Item>
          </Descriptions>
          <Space wrap>
            {plan.status === 'DRAFT' ? (
              <Button icon={<EditOutlined />} onClick={() => router.push(`/teacher/plans/generate/${plan.studentId}?planId=${plan.id}`)}>
                继续编辑
              </Button>
            ) : null}
            <Button icon={<ExportOutlined />} loading={exportMutation.isPending} onClick={() => exportMutation.mutate()}>
              导出
            </Button>
            {plan.status === 'DRAFT' ? (
              <Button type="primary" icon={<SendOutlined />} disabled={!items.length} loading={submitMutation.isPending} onClick={() => submitMutation.mutate()}>
                提交审核
              </Button>
            ) : null}
            {plan.status === 'PENDING_REVIEW' ? (
              <Button type="primary" icon={<PlayCircleOutlined />} loading={startReviewMutation.isPending} onClick={() => startReviewMutation.mutate()}>
                主管认领审核
              </Button>
            ) : null}
            {plan.status === 'REVIEWING' ? (
              <>
                <Button icon={<RollbackOutlined />} onClick={() => confirmReview('REQUEST_CHANGE', '退回老师修改')}>
                  退回修改
                </Button>
                <Button danger onClick={() => confirmReview('REJECT', '驳回方案')}>
                  驳回
                </Button>
                <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => confirmReview('APPROVE', '通过审核')}>
                  通过
                </Button>
              </>
            ) : null}
            {plan.status === 'STUDENT_CONFIRMED' ? (
              <Button type="primary" icon={<FileDoneOutlined />} loading={finalizeMutation.isPending} onClick={() => finalizeMutation.mutate()}>
                定稿
              </Button>
            ) : null}
          </Space>
        </div>
      </Card>

      {plan.studentChangeRequest ? (
        <Alert type="warning" showIcon message="学生退回修改意见" description={plan.studentChangeRequest} />
      ) : null}
      {plan.status === 'APPROVED' ? (
        <Alert type="info" showIcon message="主管已通过，等待学生确认或退回修改。" />
      ) : null}
      {plan.status === 'FINALIZED' ? (
        <Alert type="success" showIcon message="方案已定稿，后续修改请派生新版本。" />
      ) : null}

      <Card title="志愿明细" className="rounded-2xl shadow-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={items}
          pagination={false}
          expandable={{
            expandedRowRender: (item) => (
              <PlanMajorSelectionEditor
                item={item}
                status={plan.status}
                editable={plan.status === 'DRAFT' || plan.status === 'PENDING_REVIEW'}
                saving={updateMajorSelectionMutation.isPending}
                onSave={(payload) => updateMajorSelectionMutation.mutate({
                  itemId: item.id,
                  ...payload,
                })}
              />
            ),
            rowExpandable: (item) => Boolean(item.fullMajorRanking || item.selectedMajors?.length || item.recommendedOrder),
          }}
        />
      </Card>

      <Card title="审核与确认记录" className="rounded-2xl shadow-card">
        {plan.reviews?.length ? (
          <Timeline
            items={plan.reviews.map((r: any) => ({
              children: (
                <div>
                  <div className="font-medium">{r.action} / {r.reviewerRole}</div>
                  <div className="text-xs text-text-muted">{r.comment || '无备注'}</div>
                </div>
              ),
            }))}
          />
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无记录" />
        )}
      </Card>
    </div>
  );
}
