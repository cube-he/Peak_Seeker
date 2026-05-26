'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, Empty, Input, Modal, Space, Spin, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeftOutlined, CheckCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';

const GRADIENT_LABEL: Record<string, string> = {
  CHONG: '冲',
  WEN: '稳',
  BAO: '保',
};

function unwrap<T>(value: any): T {
  return (value?.data ?? value) as T;
}

export default function StudentPlanDetailPage() {
  const params = useParams<{ id: string }>();
  const planId = params.id;
  const queryClient = useQueryClient();
  const [changeComment, setChangeComment] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => planApi.getById(planId),
  });
  const plan = unwrap<Record<string, any>>(data);
  const items = plan?.items ?? [];

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });

  const confirmMutation = useMutation({
    mutationFn: () => planApi.confirmPlan(planId),
    onSuccess: () => { void message.success('已确认方案'); refresh(); },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '确认失败'),
  });

  const requestChangeMutation = useMutation({
    mutationFn: () => planApi.requestChange(planId, changeComment),
    onSuccess: () => {
      setChangeComment('');
      void message.success('修改意见已提交');
      refresh();
    },
    onError: (error: any) => message.error(error?.response?.data?.message ?? '提交失败'),
  });

  const openChangeModal = () => {
    Modal.confirm({
      title: '提交修改意见',
      content: (
        <Input.TextArea
          rows={4}
          placeholder="请写明希望老师修改的地方"
          defaultValue={changeComment}
          onChange={(e) => setChangeComment(e.target.value)}
        />
      ),
      okText: '提交',
      cancelText: '取消',
      onOk: () => requestChangeMutation.mutate(),
    });
  };

  const columns: ColumnsType<any> = [
    { title: '序号', dataIndex: 'order', width: 70 },
    { title: '院校', dataIndex: 'universityName' },
    { title: '专业', dataIndex: 'majorName' },
    { title: '梯度', dataIndex: 'gradient', width: 80, render: (v) => <Tag>{GRADIENT_LABEL[v] || v}</Tag> },
    { title: '历史位次', dataIndex: 'historicalMinRank', width: 120, render: (v) => v ?? '-' },
  ];

  if (isLoading) {
    return <div className="py-32 text-center"><Spin size="large" /></div>;
  }

  if (!plan) {
    return <Empty description="方案不存在或无权访问" />;
  }

  return (
    <div className="space-y-5">
      <Link href="/student/plans" className="inline-flex items-center gap-2 text-sm text-text-tertiary no-underline">
        <ArrowLeftOutlined /> 返回我的方案
      </Link>

      <Card className="rounded-2xl bg-[#1e3a5f] text-white shadow-card">
        <p className="text-[11px] uppercase tracking-[2px] text-accent-light">Plan Detail</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold">{plan.name || '志愿方案'}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PlanStatusBadge status={plan.status} />
          <span className="text-sm text-white/70">{plan.batch || '未知批次'}</span>
          <span className="text-sm text-white/50">v{plan.version || 1}</span>
        </div>
      </Card>

      <Alert
        type="warning"
        showIcon
        message="本方案仅供参考，最终志愿填报请以你与老师充分沟通后的结果为准。"
        description="方案不构成任何招生承诺。"
      />

      {plan.status === 'APPROVED' ? (
        <Card className="rounded-2xl shadow-card">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
            <div>
              <h2 className="font-serif text-lg font-semibold text-text">主管已审核通过</h2>
              <p className="mt-1 text-sm text-text-muted">确认后，出方案老师可以进行最终定稿；如有问题，可退回修改。</p>
            </div>
            <Space wrap>
              <Button icon={<QuestionCircleOutlined />} onClick={openChangeModal} loading={requestChangeMutation.isPending}>
                退回修改
              </Button>
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => confirmMutation.mutate()} loading={confirmMutation.isPending}>
                确认方案
              </Button>
            </Space>
          </div>
        </Card>
      ) : null}

      {plan.status === 'PARENT_CONFIRMED' ? (
        <Alert type="success" showIcon message="你已确认方案，等待老师定稿。" />
      ) : null}
      {plan.status === 'FINALIZED' ? (
        <Alert type="success" showIcon message="方案已定稿。" />
      ) : null}

      <Card title="志愿明细" className="rounded-2xl shadow-card">
        <Table rowKey="id" columns={columns} dataSource={items} pagination={false} />
      </Card>
    </div>
  );
}
