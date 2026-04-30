'use client';

import { useMemo } from 'react';
import { Card, Steps, Spin } from 'antd';
import {
  FileTextOutlined,
  StarOutlined,
  BellOutlined,
  RightOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { timelineApi } from '@/services/timeline-api';
import { useAuthStore } from '@/stores/authStore';

const PROGRESS_STEPS = [
  { title: '采集中', description: '完善个人信息' },
  { title: '生成中', description: '老师生成方案' },
  { title: '审核中', description: '方案审核' },
  { title: '已定版', description: '方案确认' },
  { title: '待填报', description: '正式填报' },
];

const STATUS_TO_STEP: Record<string, number> = {
  COLLECTING: 0,
  GENERATING: 1,
  REVIEWING: 2,
  FINALIZED: 3,
  SUBMITTED: 4,
};

export default function StudentDashboardPage() {
  const { user } = useAuthStore();

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  const profile = profileData?.data;
  const currentStep = STATUS_TO_STEP[profile?.status || 'COLLECTING'] ?? 0;

  const currentYear = useMemo(() => new Date().getFullYear(), []);
  const { data: timelineData } = useQuery({
    queryKey: ['timeline', currentYear],
    queryFn: () => timelineApi.getTimeline(currentYear),
    staleTime: 60 * 60 * 1000,
  });

  const countdownDays = useMemo(() => {
    const events = timelineData?.events ?? [];
    const countdown = events.find((e) => e.status === 'countdown');
    if (!countdown?.startDate) return null;
    const target = new Date(countdown.startDate);
    const now = new Date();
    return Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
  }, [timelineData]);

  return (
    <div className="space-y-4">
      {/* Greeting */}
      <div className="mb-4 rounded-xl shadow-card relative overflow-hidden bg-primary">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `url('/images/bg-student-welcome.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'right -40px center',
            backgroundRepeat: 'no-repeat',
          }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to right, rgba(30,58,95,0.85) 0%, rgba(30,58,95,0.3) 100%)' }}
        />
        <div className="relative p-5">
          <h1 className="font-serif text-xl font-semibold text-white">
            你好，{user?.realName || user?.username || '同学'} 👋
          </h1>
          <p className="text-sm text-white/65 mt-1">
            {countdownDays !== null ? (
              <>距离高考还有 <span className="font-semibold text-accent-light">{countdownDays}</span> 天</>
            ) : (
              '欢迎使用智愿家'
            )}
          </p>
        </div>
      </div>

      {/* Progress Card */}
      <Card size="small">
        <div className="mb-3">
          <span className="text-sm font-medium text-text-secondary">我的进度</span>
        </div>
        <Steps
          current={currentStep}
          size="small"
          items={PROGRESS_STEPS}
          direction="horizontal"
          responsive
        />
      </Card>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/student/plans" className="no-underline">
          <Card
            hoverable
            size="small"
            bodyStyle={{ padding: '16px' }}
            className="h-full"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-fixed rounded-lg flex items-center justify-center">
                <FileTextOutlined className="text-primary text-lg" />
              </div>
              <div>
                <div className="text-sm font-medium text-text">我的方案</div>
                <div className="text-xs text-text-muted">查看志愿方案</div>
              </div>
            </div>
          </Card>
        </Link>

        <Link href="/student/recommend" className="no-underline">
          <Card
            hoverable
            size="small"
            bodyStyle={{ padding: '16px' }}
            className="h-full"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-accent-fixed rounded-lg flex items-center justify-center">
                <StarOutlined className="text-accent text-lg" />
              </div>
              <div>
                <div className="text-sm font-medium text-text">智能推荐</div>
                <div className="text-xs text-text-muted">快速查看匹配</div>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Notifications */}
      <Card
        title={
          <span className="flex items-center gap-2 text-sm">
            <BellOutlined /> 最新消息
          </span>
        }
        size="small"
      >
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Spin />
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-0">
              <div className="w-2 h-2 bg-primary rounded-full mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text">你的个人信息仍需完善</p>
                <p className="text-xs text-text-muted mt-0.5">请尽快补充成绩和偏好信息</p>
              </div>
              <Link href="/student/profile" className="text-xs text-primary no-underline flex-shrink-0">
                去完善 <RightOutlined className="text-[10px]" />
              </Link>
            </div>
            <div className="flex items-start gap-3 py-2 border-b border-border-subtle last:border-0">
              <div className="w-2 h-2 bg-text-faint rounded-full mt-1.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text">2026年高考数据已更新</p>
                <p className="text-xs text-text-muted mt-0.5">院校库和专业库已同步最新数据</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Quick Browse */}
      <div className="flex gap-3">
        <Link href="/universities" className="no-underline flex-1">
          <Card hoverable size="small" bodyStyle={{ padding: '12px', textAlign: 'center' }}>
            <span className="text-sm text-text-secondary">院校库</span>
          </Card>
        </Link>
        <Link href="/majors" className="no-underline flex-1">
          <Card hoverable size="small" bodyStyle={{ padding: '12px', textAlign: 'center' }}>
            <span className="text-sm text-text-secondary">专业库</span>
          </Card>
        </Link>
        <Link href="/scores" className="no-underline flex-1">
          <Card hoverable size="small" bodyStyle={{ padding: '12px', textAlign: 'center' }}>
            <span className="text-sm text-text-secondary">分数线</span>
          </Card>
        </Link>
      </div>
    </div>
  );
}
