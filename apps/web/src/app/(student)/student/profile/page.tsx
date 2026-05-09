'use client';

import Link from 'next/link';
import { Alert, Button, Collapse, Spin } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
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

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
}

export default function StudentProfilePage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spin size="large" />
      </div>
    );
  }

  if (error || !data) {
    return <Alert type="error" message="加载档案失败，请刷新重试" />;
  }

  const profile: Record<string, any> = (data as any).data ?? data;
  const progress = profile.progress;
  if (!progress) return <Alert type="error" message="档案进度信息缺失" />;

  const filled = Math.round((progress.overallCompleteness / 100) * 64);
  const initial = (profile.realName || profile.username || '同').charAt(0);
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
    { key: '6', label: '6. 志愿偏好与排除项', children: <PreferenceSection profile={profile} /> },
    { key: '7', label: '7. 升学规划与个性', children: <PlanningSection profile={profile} /> },
  ];

  return (
    <div className="pb-20">
      <SaveStatusBar />

      <section className="relative -mx-4 -mt-4 overflow-hidden bg-[#1e3a5f] px-5 pb-16 pt-5 text-white sm:-mx-6 lg:-mx-8">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url('/images/bg-student-welcome.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'right center',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-br from-[#1e3a5f] to-[#15212e]" />
        <div className="relative flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[2px] text-accent-light">Student Profile</p>
            <h1 className="mt-2 font-serif text-2xl font-semibold">我的档案</h1>
          </div>
          <Link href="/student/recommend">
            <Button type="primary" size="small" className="border-0 bg-accent">
              推荐入口
            </Button>
          </Link>
        </div>
        <div className="relative mt-6 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border-[3px] border-white/20 bg-gradient-to-br from-accent to-accent-light font-serif text-2xl font-semibold">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-2xl font-semibold">{profile.realName || profile.username || '同学'}</h2>
              <span className="rounded-md border border-safe/40 bg-safe/20 px-2 py-0.5 text-[11px] font-medium text-[#a7e0c4]">
                已建档
              </span>
            </div>
            <p className="mt-1 text-sm text-white/70">
              {[profile.highSchool, profile.classInfo, profile.examType, profile.examYear].filter(Boolean).join(' · ') || '完善学校、班级和考试年份后会显示在这里'}
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-11 grid grid-cols-4 rounded-2xl bg-surface py-4 shadow-card-hover">
        {[
          ['总分', formatNumber(profile.totalScore), 'text-accent'],
          ['省排名', formatNumber(profile.provincialRank), 'text-text'],
          ['完整度', `${progress.overallCompleteness}%`, 'text-accent'],
          ['已填', `${filled}/64`, 'text-text'],
        ].map(([label, value, color]) => (
          <div key={label} className="border-r border-border-subtle px-2 text-center last:border-r-0">
            <p className={`font-serif text-lg font-semibold ${color}`}>{value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[1.2px] text-text-muted">{label}</p>
          </div>
        ))}
      </section>

      <section className="mt-5 rounded-2xl bg-surface px-4 py-4 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-base font-semibold text-text">推荐资料完整度</h2>
          <SettingOutlined className="text-text-faint" />
        </div>
        <CompactProgress
          percent={progress.overallCompleteness}
          filled={filled}
          total={64}
          missing={progress.missingFieldsForRecommend ?? []}
        />
      </section>

      <section className="mt-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-lg font-semibold text-text">档案内容</h2>
          <span className="text-xs text-text-muted">修改后自动保存</span>
        </div>
        <Collapse
          defaultActiveKey={['1', '2', '3']}
          items={items}
          size="small"
          expandIconPosition="end"
          className="bg-surface"
        />
      </section>
    </div>
  );
}
