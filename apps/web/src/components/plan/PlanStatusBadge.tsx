'use client';

import { Tag } from 'antd';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'default' },
  PENDING_REVIEW: { label: '待审核', color: 'orange' },
  REVIEWING: { label: '审核中', color: 'gold' },
  APPROVED: { label: '已通过', color: 'blue' },
  PARENT_CONFIRMED: { label: '家长已确认', color: 'cyan' },
  FINALIZED: { label: '已定稿', color: 'green' },
  REJECTED: { label: '已驳回', color: 'red' },
  PUBLISHED: { label: '已发布', color: 'purple' },
  OUTDATED: { label: '已过期', color: 'default' },
  ARCHIVED: { label: '已归档', color: 'default' },
};

interface PlanStatusBadgeProps {
  status?: string;
}

export default function PlanStatusBadge({ status }: PlanStatusBadgeProps) {
  const s = STATUS_MAP[status || ''] || { label: status || '未知', color: 'default' };
  return (
    <Tag color={s.color} className="m-0 text-[11px]">
      {s.label}
    </Tag>
  );
}
