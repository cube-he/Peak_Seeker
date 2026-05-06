'use client';

import { Spin, Alert, Collapse, Button } from 'antd';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import CompactProgress from '@/components/student/CompactProgress';
import SaveStatusBar from '@/components/student/SaveStatusBar';
import ProvenanceBadge from '@/components/student/ProvenanceBadge';
import BasicInfoSection from '@/components/student/sections/BasicInfoSection';
import ScoreSection from '@/components/student/sections/ScoreSection';
import HukouSection from '@/components/student/sections/HukouSection';
import BonusPolicySection from '@/components/student/sections/BonusPolicySection';
import HealthSection from '@/components/student/sections/HealthSection';
import PreferenceSection from '@/components/student/sections/PreferenceSection';
import PlanningSection from '@/components/student/sections/PlanningSection';

export default function StudentProfilePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  if (isLoading) return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  if (error || !data) return <Alert type="error" message="加载档案失败，请刷新重试" />;

  const profile: Record<string, any> = (data as any).data ?? data;
  const progress = profile.progress;
  if (!progress) return <Alert type="error" message="档案进度信息缺失" />;

  const filled = Math.round((progress.overallCompleteness / 100) * 64);
  const items = [
    { key: '1', label: '1. 基础信息', children: <BasicInfoSection profile={profile} /> },
    { key: '2', label: '2. 分数与选科', children: <ScoreSection profile={profile} /> },
    {
      key: '3',
      label: '3. 户籍与考试地',
      extra: <ProvenanceBadge updatedBy={profile.hukouUpdatedBy} updatedAt={profile.hukouUpdatedAt} />,
      children: <HukouSection profile={profile} />,
    },
    {
      key: '4',
      label: '4. 加分政策',
      extra: <ProvenanceBadge updatedBy={profile.bonusUpdatedBy} updatedAt={profile.bonusUpdatedAt} />,
      children: <BonusPolicySection profile={profile} />,
    },
    { key: '5', label: '5. 健康条件', children: <HealthSection profile={profile} /> },
    { key: '6', label: '6. 志愿偏好与排除', children: <PreferenceSection profile={profile} /> },
    { key: '7', label: '7. 升学规划与个性', children: <PlanningSection profile={profile} /> },
  ];

  return (
    <div className="space-y-3 pb-20">
      <SaveStatusBar />

      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-xl font-semibold text-text">我的档案</h1>
        <Link href="/student/recommend">
          <Button type="primary" size="small">查看老师方案 →</Button>
        </Link>
      </div>

      <CompactProgress
        percent={progress.overallCompleteness}
        filled={filled}
        total={64}
        missing={progress.missingFieldsForRecommend ?? []}
      />

      <Collapse
        defaultActiveKey={['1', '2', '3']}
        items={items}
        size="small"
        expandIconPosition="end"
      />
    </div>
  );
}
