'use client';

import Link from 'next/link';
import { Card, Progress, Tag } from 'antd';
import { CheckCircleFilled, ArrowRightOutlined } from '@ant-design/icons';

interface Props {
  stage: 1 | 2 | 3;
  title: string;
  subtitle: string;
  badge: string;
  filled: number;
  total: number;
  completed: boolean;
}

/**
 * W3 dashboard 阶段入口卡片。点击进入 /student/profile/stage/[stage]。
 * 完成时显示 badge tag「XXX 已解锁」。
 */
export default function StageCard({
  stage,
  title,
  subtitle,
  badge,
  filled,
  total,
  completed,
}: Props) {
  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
  return (
    <Link href={`/student/profile/stage/${stage}`} className="block">
      <Card hoverable className="transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2">
              <span className="font-serif text-base font-semibold text-text">
                阶段 {stage}：{title}
              </span>
              {completed && (
                <Tag icon={<CheckCircleFilled />} color="success">
                  {badge} 已解锁
                </Tag>
              )}
            </div>
            <p className="mb-3 text-xs text-text-secondary">{subtitle}</p>
            <div className="flex items-center gap-3">
              <Progress
                percent={percent}
                size="small"
                showInfo={false}
                className="flex-1"
                strokeColor={completed ? '#276749' : '#b8860b'}
              />
              <span className="whitespace-nowrap font-mono text-xs text-text-secondary">
                {filled}/{total}
              </span>
            </div>
          </div>
          <ArrowRightOutlined className="mt-1 text-text-faint" />
        </div>
      </Card>
    </Link>
  );
}
