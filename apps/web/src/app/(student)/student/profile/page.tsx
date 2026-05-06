'use client';

import { Spin, Alert, Card, Button } from 'antd';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import ProgressBar from '@/components/student/ProgressBar';
import SaveStatusBar from '@/components/student/SaveStatusBar';
import BasicInfoSection from '@/components/student/sections/BasicInfoSection';
import ScoreSection from '@/components/student/sections/ScoreSection';
import HukouSection from '@/components/student/sections/HukouSection';
import BonusPolicySection from '@/components/student/sections/BonusPolicySection';
import HealthSection from '@/components/student/sections/HealthSection';
import PreferenceSection from '@/components/student/sections/PreferenceSection';
import PlanningSection from '@/components/student/sections/PlanningSection';

/**
 * 学生档案首页（2026-05-06 redesign）。
 * 7 个版块平铺；自动保存；老师修改在版块标题旁显示 provenance 小标。
 * 旧的 stage/[stage]/page.tsx 表单页保留作兼容入口（学生从老链接进入仍能工作）。
 */
export default function StudentProfilePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Spin size="large" /></div>;
  }

  if (error || !data) {
    return <Alert type="error" message="加载档案失败，请刷新重试" />;
  }

  const profile: Record<string, any> = (data as any).data ?? data;
  const progress = profile.progress;

  if (!progress) {
    return <Alert type="error" message="档案进度信息缺失，请联系老师" />;
  }

  return (
    <div className="space-y-4 pb-20">
      <h1 className="font-serif text-xl font-semibold text-text">我的档案</h1>

      <SaveStatusBar />

      {/* 进度条 */}
      <Card size="small">
        <div className="space-y-3">
          <ProgressBar
            label="自填进度"
            percent={progress.studentSelfCompleteness}
            hint="完善信息有助于老师为你生成更精准的方案"
          />
          <ProgressBar
            label="档案总进度（含老师录入）"
            percent={progress.overallCompleteness}
          />
          {!progress.isRecommendable &&
            progress.missingFieldsForRecommend?.length > 0 && (
              <p className="text-xs text-text-faint">
                当前未达到「可推荐」阈值，缺少：
                <span className="ml-1 text-text-secondary">
                  {progress.missingFieldsForRecommend.slice(0, 5).join('、')}
                  {progress.missingFieldsForRecommend.length > 5 ? ' 等' : ''}
                </span>
              </p>
            )}
        </div>
      </Card>

      {/* 7 个版块 */}
      <BasicInfoSection profile={profile} />
      <ScoreSection profile={profile} />
      <HukouSection profile={profile} />
      <BonusPolicySection profile={profile} />
      <HealthSection profile={profile} />
      <PreferenceSection profile={profile} />
      <PlanningSection profile={profile} />

      {/* 推荐入口 */}
      <Link href="/student/recommend">
        <Button type="primary" size="large" block>
          查看老师为我生成的方案
        </Button>
      </Link>
    </div>
  );
}
