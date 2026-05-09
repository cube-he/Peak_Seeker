'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button, Empty, Spin, Space, message } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanItemCard from '@/components/plan/PlanItemCard';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';

const GRADIENT_TIERS = [
  { key: 'rush-high', label: '冲一冲（高）', color: '#c53030' },
  { key: 'rush-low', label: '冲一冲（低）', color: '#e07050' },
  { key: 'rush', label: '冲一冲', color: '#c53030' },
  { key: 'stable-high', label: '稳一稳（高）', color: '#2c5282' },
  { key: 'stable-low', label: '稳一稳（低）', color: '#4a90d9' },
  { key: 'stable', label: '稳一稳', color: '#2c5282' },
  { key: 'safe-high', label: '保一保（高）', color: '#276749' },
  { key: 'safe-low', label: '保一保（低）', color: '#48bb78' },
  { key: 'safe', label: '保一保', color: '#276749' },
];

const BATCH_LABELS: Record<string, string> = {
  EARLY: '本科提前批',
  BATCH_1: '本科一批',
  BATCH_2: '本科二批',
  JUNIOR_COLLEGE: '专科批',
};

interface PlanItem {
  id: number;
  order: number;
  universityName: string;
  majorName: string;
  admissionProbability?: number;
  gradient: string;
  historicalMinScore?: number;
  historicalMinRank?: number;
  notes?: string;
}

export default function PlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;
  const queryClient = useQueryClient();
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const { data: planData, isLoading } = useQuery({
    queryKey: ['plan-detail', planId],
    queryFn: () => planApi.getById(planId),
  });

  const plan = planData?.data;
  const items: PlanItem[] = plan?.items || [];

  const groupedItems = GRADIENT_TIERS.map((tier) => ({
    ...tier,
    items: items.filter((item) => item.gradient === tier.key),
  })).filter((group) => group.items.length > 0);

  const deleteMutation = useMutation({
    mutationFn: (itemId: number) => planApi.deleteItem(planId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan-detail', planId] });
      message.success('已删除');
    },
  });

  const toggleExpand = (itemId: number) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Link href="/teacher/plans" className="mb-2 inline-flex items-center gap-2 text-sm text-text-tertiary no-underline hover:text-primary">
            <ArrowLeftOutlined /> 返回方案列表
          </Link>
          <h1 className="font-serif text-3xl font-semibold text-text">
            {plan?.studentName || '学生'} · 方案详情
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <PlanStatusBadge status={plan?.status} />
            <span className="text-xs text-text-muted">v{plan?.version || 1}</span>
            <span className="text-xs text-text-muted">{BATCH_LABELS[plan?.batch] || plan?.batch || '未知批次'}</span>
          </div>
        </div>
        <Space wrap>
          <Button icon={<ExportOutlined />} disabled title="导出待接入">导出</Button>
          <Button icon={<EditOutlined />} disabled title="编辑待接入">编辑</Button>
          <Button type="primary" icon={<CheckCircleOutlined />} className="border-0" disabled title="提交审核待接入">
            提交审核
          </Button>
        </Space>
      </header>

      {groupedItems.length === 0 ? (
        <div className="rounded-2xl bg-surface py-12 shadow-card">
          <Empty description="方案中暂无志愿项目" />
        </div>
      ) : (
        groupedItems.map((group) => (
          <section key={group.key} id={`gradient-${group.key}`} className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: group.color }} />
              <h2 className="text-sm font-medium text-text-secondary">{group.label}</h2>
              <span className="text-xs text-text-faint">({group.items.length} 个志愿)</span>
            </div>
            <div className="space-y-2">
              {group.items.map((item) => (
                <PlanItemCard
                  key={item.id}
                  item={item}
                  gradientColor={group.color}
                  expanded={expandedItems.has(item.id)}
                  onToggleExpand={() => toggleExpand(item.id)}
                  onDelete={() => deleteMutation.mutate(item.id)}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
