'use client';

import { useState } from 'react';
import {
  Button,
  Space,
  Empty,
  Spin,
  Affix,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  ExportOutlined,
  EditOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanItemCard from '@/components/plan/PlanItemCard';
import GradientNav from '@/components/plan/GradientNav';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';

// 6 gradient colors for the 6 tier buckets
const GRADIENT_TIERS = [
  { key: 'rush-high', label: '冲一冲 (上)', color: '#c53030', bgClass: 'bg-rush/5' },
  { key: 'rush-low', label: '冲一冲 (下)', color: '#e07050', bgClass: 'bg-rush/3' },
  { key: 'stable-high', label: '稳一稳 (上)', color: '#2c5282', bgClass: 'bg-stable/5' },
  { key: 'stable-low', label: '稳一稳 (下)', color: '#4a90d9', bgClass: 'bg-stable/3' },
  { key: 'safe-high', label: '保一保 (上)', color: '#276749', bgClass: 'bg-safe/5' },
  { key: 'safe-low', label: '保一保 (下)', color: '#48bb78', bgClass: 'bg-safe/3' },
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

  // Group items by gradient tier
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
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
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
    <div className="flex gap-6">
      {/* Gradient Navigation Sidebar (desktop only) */}
      <div className="hidden xl:block w-[200px] flex-shrink-0">
        <Affix offsetTop={80}>
          <GradientNav tiers={groupedItems} />
        </Affix>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-w-0 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <Link
              href="/teacher/plans"
              className="inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-primary no-underline transition-colors mb-2"
            >
              <ArrowLeftOutlined /> 返回方案列表
            </Link>
            <h1 className="font-serif text-xl font-semibold text-text">
              {plan?.studentName} — 方案详情
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <PlanStatusBadge status={plan?.status} />
              <span className="text-xs text-text-muted">v{plan?.version || 1}</span>
              <span className="text-xs text-text-muted">
                {plan?.batch === 'BATCH_1' ? '本科一批' : plan?.batch === 'BATCH_2' ? '本科二批' : plan?.batch}
              </span>
            </div>
          </div>
          <Space>
            <Button icon={<ExportOutlined />}>导出</Button>
            <Button icon={<EditOutlined />}>编辑</Button>
            <Button type="primary" icon={<CheckCircleOutlined />}>
              提交审核
            </Button>
          </Space>
        </div>

        {/* Plan Items grouped by gradient */}
        {groupedItems.length === 0 ? (
          <Empty description="方案中暂无志愿项目" />
        ) : (
          groupedItems.map((group) => (
            <div key={group.key} id={`gradient-${group.key}`}>
              <div className="flex items-center gap-2 mb-3">
                <div
                  className="w-3 h-3 rounded-sm"
                  style={{ backgroundColor: group.color }}
                />
                <h3 className="text-sm font-medium text-text-secondary">
                  {group.label}
                </h3>
                <span className="text-xs text-text-faint">
                  ({group.items.length} 个志愿)
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
                    onDelete={() => deleteMutation.mutate(item.id)}
                  />
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
