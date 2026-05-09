'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Button, Empty, Spin, Tag, message } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanItemCard from '@/components/plan/PlanItemCard';

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
  explanation?: string;
}

export default function StudentPlanDetailPage() {
  const params = useParams();
  const planId = params.id as string;
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

  const confirmMutation = useMutation({
    mutationFn: () => planApi.confirmPlan(planId),
    onSuccess: () => message.success('已确认方案'),
    onError: () => message.error('确认失败'),
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
      <Link href="/student/plans" className="inline-flex items-center gap-2 text-sm text-text-tertiary no-underline hover:text-primary">
        <ArrowLeftOutlined /> 返回方案列表
      </Link>

      <section className="rounded-2xl bg-[#1e3a5f] px-5 py-5 text-white shadow-card">
        <p className="text-[11px] uppercase tracking-[2px] text-accent-light">Plan Detail</p>
        <h1 className="mt-2 font-serif text-2xl font-semibold">方案详情</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Tag color={plan?.examSource === 'GAOKAO' ? 'green' : 'default'}>
            {plan?.examSource === 'GAOKAO' ? '高考正式' : '模拟预案'}
          </Tag>
          <span className="text-sm text-white/70">{BATCH_LABELS[plan?.batch] || plan?.batch || '未知批次'}</span>
          <span className="text-sm text-white/50">v{plan?.version || 1}</span>
        </div>
      </section>

      <Alert
        type="warning"
        message="本方案仅供参考，最终志愿填报请以你与老师的沟通为准。"
        description="方案不构成任何招生承诺。"
        showIcon
      />

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
              <span className="text-xs text-text-faint">({group.items.length})</span>
            </div>
            <div className="space-y-2">
              {group.items.map((item) => (
                <PlanItemCard
                  key={item.id}
                  item={item}
                  gradientColor={group.color}
                  expanded={expandedItems.has(item.id)}
                  onToggleExpand={() => toggleExpand(item.id)}
                  readOnly
                />
              ))}
            </div>
          </section>
        ))
      )}

      <div className="flex gap-3 border-t border-border-subtle pt-4">
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          size="large"
          onClick={() => confirmMutation.mutate()}
          loading={confirmMutation.isPending}
          className="flex-1 border-0"
        >
          确认方案
        </Button>
        <Button icon={<QuestionCircleOutlined />} size="large" className="flex-1" disabled title="提问功能待接入">
          向老师提问
        </Button>
      </div>
    </div>
  );
}
