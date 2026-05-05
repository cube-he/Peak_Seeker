'use client';

import { Card, Spin, Alert, Button } from 'antd';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import StageCard from '@/components/student/StageCard';
import ProgressBar from '@/components/student/ProgressBar';
import TeacherOnlyField from '@/components/student/TeacherOnlyField';
import { STAGE_LABELS } from '@/components/student/stage-fields';

/**
 * 学生端档案首页 (W3 三阶段渐进采集 dashboard)
 *
 * 替换原 220 行单页 Tab 表单。新结构：
 * - 顶部：双进度条（自填 / 总进度）+ recommend gate 提示
 * - 中部：3 张阶段卡片（点击进入对应表单页）
 * - 底部：① 由老师录入的只读字段卡片
 *
 * 注：getMyProfile 已在后端过滤 ① 字段，TeacherOnlyField 看到 undefined
 * 即正确显示「未录入」 — 这是预期，与 spec §4.3 一致。
 */
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

  if (!progress) {
    return <Alert type="error" message="档案进度信息缺失，请联系老师" />;
  }

  return (
    <div className="space-y-4 pb-20">
      <h1 className="font-serif text-xl font-semibold text-text">我的档案</h1>

      {/* 双进度条 */}
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

      {/* 3 张阶段卡片 */}
      <div className="space-y-3">
        {([1, 2, 3] as const).map((stage) => {
          const stageKey = `stage${stage}` as 'stage1' | 'stage2' | 'stage3';
          const s = progress.stageProgress[stageKey];
          const labels = STAGE_LABELS[String(stage) as '1' | '2' | '3'];
          return (
            <StageCard
              key={stage}
              stage={stage}
              title={labels.title}
              subtitle={labels.subtitle}
              badge={labels.badge}
              filled={s.filled}
              total={s.total}
              completed={s.completed}
            />
          );
        })}
      </div>

      {/* ① 老师录入字段（只读） */}
      <Card size="small" title="由老师录入的信息">
        <TeacherOnlyField
          label="全省位次"
          value={profile.provincialRank}
        />
        <TeacherOnlyField label="加分政策" value={profile.bonusPolicyStatus} />
        <TeacherOnlyField
          label="户籍"
          value={
            [profile.province, profile.city, profile.county]
              .filter(Boolean)
              .join('/') || null
          }
        />
        <TeacherOnlyField
          label="高考所在地"
          value={
            [
              profile.examLocationProvince,
              profile.examLocationCity,
              profile.examLocationCounty,
            ]
              .filter(Boolean)
              .join('/') || null
          }
        />
        <p className="mt-3 text-xs text-text-faint">
          以上信息由老师录入或自动计算，学生本人不可修改。如位次未显示，
          请确保「阶段 1」中已填写总分和科类，系统会自动算出位次。
        </p>
      </Card>

      {/* 推荐入口 */}
      <Link href="/student/recommend">
        <Button type="primary" size="large" block>
          查看老师为我生成的方案
        </Button>
      </Link>
    </div>
  );
}
