'use client';

import { Card, Tag, Empty, Spin, Alert } from 'antd';
import { FileTextOutlined, RightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { planApi } from '@/services/plan-api';
import PlanStatusBadge from '@/components/plan/PlanStatusBadge';

const BATCH_LABELS: Record<string, string> = {
  EARLY: '本科提前批',
  BATCH_1: '本科一批',
  BATCH_2: '本科二批',
  JUNIOR_COLLEGE: '专科批',
};

interface Plan {
  id: number;
  batch: string;
  examSource: string;
  status: string;
  version: number;
  itemCount: number;
  updatedAt: string;
}

export default function StudentPlansPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['student-plans'],
    queryFn: () => planApi.getMyPlans(),
  });

  const plans: Plan[] = data?.data || [];

  // Group by batch
  const groupedPlans: Record<string, Plan[]> = {};
  plans.forEach((plan) => {
    const key = plan.batch || 'OTHER';
    if (!groupedPlans[key]) groupedPlans[key] = [];
    groupedPlans[key].push(plan);
  });

  return (
    <div className="space-y-4">
      {/* Disclaimer Banner */}
      <Alert
        type="info"
        message="方案仅供参考"
        description="以下方案由老师为您生成，建议与老师充分沟通后确认最终志愿。方案不构成任何招生承诺。"
        showIcon
        closable
      />

      <h1 className="font-serif text-xl font-semibold text-text">我的方案</h1>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spin size="large" />
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              <div className="text-center">
                <p className="text-text-muted">暂无志愿方案</p>
                <p className="text-xs text-text-faint mt-1">
                  老师生成方案后将在此显示
                </p>
              </div>
            }
          />
        </Card>
      ) : (
        Object.entries(groupedPlans).map(([batchKey, batchPlans]) => (
          <div key={batchKey} className="space-y-2">
            <h2 className="text-sm font-medium text-text-secondary px-1">
              {BATCH_LABELS[batchKey] || batchKey}
            </h2>
            {batchPlans.map((plan) => (
              <Link
                key={plan.id}
                href={`/student/plans/${plan.id}`}
                className="no-underline block"
              >
                <Card
                  hoverable
                  size="small"
                  bodyStyle={{ padding: '14px 16px' }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-primary-fixed rounded-lg flex items-center justify-center">
                        <FileTextOutlined className="text-primary text-lg" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text">
                            {BATCH_LABELS[plan.batch] || plan.batch}
                          </span>
                          <PlanStatusBadge status={plan.status} />
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {plan.examSource === 'GAOKAO' ? (
                            <Tag color="green" className="text-[10px] m-0">高考正式</Tag>
                          ) : (
                            <Tag color="default" className="text-[10px] m-0">二诊预案</Tag>
                          )}
                          <span className="text-xs text-text-faint">
                            {plan.itemCount} 个志愿 · v{plan.version}
                          </span>
                        </div>
                      </div>
                    </div>
                    <RightOutlined className="text-text-faint text-xs" />
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
