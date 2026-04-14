'use client';

import { useState } from 'react';
import { Button, Tag, Alert, Empty, Spin, message } from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  QuestionCircleOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanItemCard from '@/components/plan/PlanItemCard';
const GRADIENT_TIERS = [
  { key: 'rush-high', label: '冲一冲 (上)', color: '#c53030' },
  { key: 'rush-low', label: '冲一冲 (下)', color: '#e07050' },
  { key: 'stable-high', label: '稳一稳 (上)', color: '#2c5282' },
  { key: 'stable-low', label: '稳一稳 (下)', color: '#4a90d9' },
  { key: 'safe-high', label: '保一保 (上)', color: '#276749' },
  { key: 'safe-low', label: '保一保 (下)', color: '#48bb78' },
];

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
    <div className="space-y-4">
      {/* Disclaimer */}
      <Alert
        type="warning"
        message="本方案仅供参考，最终志愿填报请以您与老师的沟通为准。方案不构成任何招生承诺。"
        showIcon
        className="text-xs"
      />

      {/* Back + Title */}
      <div>
        <Link
          href="/student/plans"
          className="inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-primary no-underline transition-colors mb-2"
        >
          <ArrowLeftOutlined /> 返回方案列表
        </Link>
        <h1 className="font-serif text-lg font-semibold text-text">
          方案详情
        </h1>
        <div className="flex items-center gap-2 mt-1">
          <Tag color={plan?.examSource === 'GAOKAO' ? 'green' : 'default'}>
            {plan?.examSource === 'GAOKAO' ? '高考正式' : '二诊预案'}
          </Tag>
          <span className="text-xs text-text-muted">
            {plan?.batch === 'BATCH_1' ? '本科一批' : plan?.batch === 'BATCH_2' ? '本科二批' : plan?.batch}
          </span>
          <span className="text-xs text-text-faint">v{plan?.version}</span>
        </div>
      </div>

      {/* Gradient Navigation (mobile horizontal scroll) */}
      <div className="xl:hidden">
        <div className="flex gap-2 overflow-x-auto pb-2">
          {groupedItems.map((group) => (
            <a
              key={group.key}
              href={`#gradient-${group.key}`}
              className="no-underline flex-shrink-0"
            >
              <Tag
                color="default"
                className="cursor-pointer"
                style={{ borderLeft: `3px solid ${group.color}` }}
              >
                {group.label} ({group.items.length})
              </Tag>
            </a>
          ))}
        </div>
      </div>

      {/* Plan Items */}
      {groupedItems.length === 0 ? (
        <Empty description="方案中暂无志愿项目" />
      ) : (
        groupedItems.map((group) => (
          <div key={group.key} id={`gradient-${group.key}`}>
            <div className="flex items-center gap-2 mb-2">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: group.color }}
              />
              <h3 className="text-sm font-medium text-text-secondary">
                {group.label}
              </h3>
              <span className="text-xs text-text-faint">
                ({group.items.length})
              </span>
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
          </div>
        ))
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-border-subtle">
        <Button
          type="primary"
          icon={<CheckCircleOutlined />}
          size="large"
          onClick={() => confirmMutation.mutate()}
          loading={confirmMutation.isPending}
          className="flex-1"
        >
          确认方案
        </Button>
        <Button
          icon={<QuestionCircleOutlined />}
          size="large"
          className="flex-1"
        >
          向老师提问
        </Button>
      </div>
    </div>
  );
}
