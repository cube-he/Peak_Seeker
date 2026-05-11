'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Alert, Button, Spin, message } from 'antd';
import {
  ArrowRightOutlined,
  BankOutlined,
  BellOutlined,
  CheckCircleOutlined,
  EnvironmentOutlined,
  ExportOutlined,
  FileTextOutlined,
  MailOutlined,
  PhoneOutlined,
  SettingOutlined,
  StarOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import CompactProgress from '@/components/student/CompactProgress';
import SaveStatusBar from '@/components/student/SaveStatusBar';
import StudentSummaryRail from '@/components/student/workspace/StudentSummaryRail';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '@/components/student/workspace/StudentWorkspace';

const EXAM_TYPE_LABELS: Record<string, string> = {
  PHYSICS: '物理类',
  HISTORY: '历史类',
  COMPREHENSIVE_LIBERAL: '文科综合',
  COMPREHENSIVE_SCIENCE: '理科综合',
};

const FIRST_CHOICE_LABELS: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
};

const RE_CHOICE_LABELS: Record<string, string> = {
  CHEM: '化学',
  BIO: '生物',
  POL: '政治',
  GEO: '地理',
};

const PRIORITY_LABELS: Record<string, string> = {
  UNIVERSITY_FIRST: '院校优先',
  MAJOR_FIRST: '专业优先',
  CITY_FIRST: '城市优先',
  BALANCED: '均衡',
};

const TUITION_LABELS: Record<string, string> = {
  LOW: '经济敏感',
  MEDIUM: '适中',
  HIGH: '可接受中高学费',
  UNLIMITED: '无上限',
};

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
}

function display(value?: string | number | null, fallback = '待补充') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatPhone(value?: string | null) {
  if (!value) return '待绑定';
  if (value.length < 7) return value;
  return `${value.slice(0, 3)} ··· ${value.slice(-4)}`;
}

function formatList(value?: unknown, fallback = '待补充') {
  if (!Array.isArray(value) || value.length === 0) return fallback;
  return value.join(' · ');
}

function formatLocation(profile: Record<string, any>) {
  return [profile.province, profile.city, profile.county].filter(Boolean).join(' · ') || '待补充';
}

function formatExam(profile: Record<string, any>) {
  return [
    profile.examYear ? `${profile.examYear} 届` : null,
    profile.examType ? EXAM_TYPE_LABELS[profile.examType] ?? profile.examType : null,
  ].filter(Boolean).join(' · ') || '待补充';
}

function scoreRows(profile: Record<string, any>) {
  const rows = [
    ['语文', profile.scoreChinese, 150],
    ['数学', profile.scoreMath, 150],
    ['英语', profile.scoreEnglish, 150],
    [FIRST_CHOICE_LABELS[profile.firstChoice] || '首选', profile.scoreFirstChoice, 100],
    ['再选一', profile.scoreSub1, 100],
    ['再选二', profile.scoreSub2, 100],
  ] as const;

  return rows.map(([label, value, max]) => ({
    label,
    value: typeof value === 'number' ? value : null,
    height: typeof value === 'number' ? Math.max(12, Math.round((value / max) * 78)) : 12,
  }));
}

function selectedSubjects(profile: Record<string, any>) {
  const subjects = [
    profile.firstChoice ? FIRST_CHOICE_LABELS[profile.firstChoice] ?? profile.firstChoice : null,
    ...(Array.isArray(profile.reChoices)
      ? profile.reChoices.map((choice: string) => RE_CHOICE_LABELS[choice] ?? choice)
      : []),
  ].filter(Boolean);

  return subjects.length ? subjects : ['待选择'];
}

function stagePercent(stage?: { filled: number; total: number }) {
  if (!stage?.total) return 0;
  return Math.round((stage.filled / stage.total) * 100);
}

export default function StudentProfilePage() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });
  const submitIntakeMutation = useMutation({
    mutationFn: () => studentApi.submitMyIntake(),
    onSuccess: () => {
      void message.success('资料已提交给老师确认');
      queryClient.invalidateQueries({ queryKey: ['student-my-profile'] });
    },
    onError: (e: any) => {
      void message.error(e?.response?.data?.message ?? '提交失败，请先补全核心资料');
    },
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
  const bars = scoreRows(profile);
  const stages = progress.stageProgress ?? {};
  const intakeStatus = profile.intakeStatus ?? 'DRAFT';
  const canSubmitIntake = progress.stageProgress?.stage1?.completed && !['SUBMITTED', 'VERIFIED'].includes(intakeStatus);
  const intakeStatusMessage =
    intakeStatus === 'VERIFIED'
      ? '老师已确认，可以进入方案生成'
      : intakeStatus === 'SUBMITTED'
        ? '已提交，等待老师确认'
        : intakeStatus === 'NEEDS_CHANGES'
          ? profile.intakeReviewComment || '老师退回，请按意见补充'
          : '核心资料完成后提交给老师确认';
  const submitButtonText = intakeStatus === 'NEEDS_CHANGES' ? '重新提交' : '提交资料';
  const rail = <StudentSummaryRail activePathname={pathname} profile={profile} progress={progress} />;
  const renderStageLinks = (compact = false) => (
    <div className="space-y-2.5">
      <StageLink
        href="/student/profile/stage/1"
        badge="1"
        title="核心信息"
        subtitle="身份、电话、成绩与选科"
        percent={stagePercent(stages.stage1)}
        complete={stages.stage1?.completed}
        compact={compact}
      />
      <StageLink
        href="/student/profile/stage/2"
        badge="2"
        title="完善信息"
        subtitle="身体条件、地域偏好与专业方向"
        percent={stagePercent(stages.stage2)}
        complete={stages.stage2?.completed}
        compact={compact}
      />
      <StageLink
        href="/student/profile/stage/3"
        badge="3"
        title="高级信息"
        subtitle="排除项、经济条件、兴趣性格"
        percent={stagePercent(stages.stage3)}
        complete={stages.stage3?.completed}
        compact={compact}
      />
    </div>
  );
  const aside = (
    <>
      <StudentWorkspacePanel
        title="推荐资料完整度"
        action={
          <Link href="/student/profile/stage/1" className="text-xs font-medium text-primary no-underline">
            继续完善
          </Link>
        }
      >
        <CompactProgress
          percent={progress.overallCompleteness}
          filled={filled}
          total={64}
          missing={progress.missingFieldsForRecommend ?? []}
        />
      </StudentWorkspacePanel>

      <StudentWorkspacePanel title="资料确认状态">
        <p className="m-0 text-xs leading-5 text-text-muted">{intakeStatusMessage}</p>
        <Button
          block
          className="mt-3"
          type="primary"
          disabled={!canSubmitIntake}
          loading={submitIntakeMutation.isPending}
          onClick={() => submitIntakeMutation.mutate()}
        >
          {submitButtonText}
        </Button>
      </StudentWorkspacePanel>

      <StudentWorkspacePanel title="档案填写">{renderStageLinks(true)}</StudentWorkspacePanel>
    </>
  );

  return (
    <StudentWorkspace rail={rail} aside={aside}>
      <div className="space-y-5 pb-20 lg:pb-0">
        <SaveStatusBar />

      <section className="relative -mx-4 -mt-4 overflow-hidden bg-gradient-to-br from-primary to-[#15212e] px-[18px] pb-[60px] pt-[18px] text-white sm:rounded-b-2xl">
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url('/images/bg-student-welcome.webp')`,
            backgroundSize: 'cover',
            backgroundPosition: 'right center',
          }}
        />
        <div className="relative z-10 mb-6 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[7px] bg-white/15 font-serif text-sm font-bold">
              智
            </span>
            <span className="font-serif text-[15px] font-semibold">智愿家</span>
          </div>
          <Link
            href="/student/profile/stage/1"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white no-underline transition-colors hover:bg-white/25"
            title="编辑档案"
          >
            <SettingOutlined />
          </Link>
        </div>

        <div className="relative z-10 flex items-center gap-3.5">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-[3px] border-white/20 bg-gradient-to-br from-accent to-accent-light font-serif text-[26px] font-semibold">
            {initial}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="m-0 font-serif text-[22px] font-semibold leading-tight">
                {profile.realName || profile.username || '同学'}
              </h1>
              <span className="inline-flex items-center gap-1 rounded-[5px] border border-safe/40 bg-safe/20 px-2 py-0.5 text-[10.5px] font-medium text-[#a7e0c4]">
                <CheckCircleOutlined className="text-[10px]" />
                已建档
              </span>
            </div>
            <p className="m-0 mt-1 text-xs leading-5 text-white/70">
              {[profile.highSchool, profile.classInfo, formatExam(profile)].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 -mt-11 grid grid-cols-4 overflow-hidden rounded-[14px] bg-surface py-4 shadow-card-hover">
        {[
          ['总分', formatNumber(profile.totalScore), 'text-accent'],
          ['省排名', formatNumber(profile.provincialRank), 'text-text'],
          ['完整度', `${progress.overallCompleteness}%`, 'text-accent'],
          ['已填', `${filled}/64`, 'text-text'],
        ].map(([label, value, color]) => (
          <div key={label} className="border-r border-border-subtle px-1 text-center last:border-r-0">
            <p className={`m-0 font-serif text-lg font-semibold leading-tight tabular-nums ${color}`}>
              {value}
            </p>
            <p className="m-0 mt-1 text-[9.5px] font-medium uppercase tracking-[1.4px] text-text-muted">
              {label}
            </p>
          </div>
        ))}
      </section>

      <section className="rounded-xl bg-surface px-4 py-4 shadow-card xl:hidden">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="m-0 font-serif text-base font-semibold text-text">推荐资料完整度</h2>
          <Link href="/student/profile/stage/1" className="text-xs font-medium text-primary no-underline">
            继续完善
          </Link>
        </div>
        <CompactProgress
          percent={progress.overallCompleteness}
          filled={filled}
          total={64}
          missing={progress.missingFieldsForRecommend ?? []}
        />
      </section>

      <section className="rounded-xl bg-surface px-4 py-4 shadow-card xl:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="m-0 font-serif text-base font-semibold text-text">资料确认状态</h2>
            <p className="m-0 mt-1 text-xs text-text-muted">{intakeStatusMessage}</p>
          </div>
          <Button
            type="primary"
            disabled={!canSubmitIntake}
            loading={submitIntakeMutation.isPending}
            onClick={() => submitIntakeMutation.mutate()}
          >
            {submitButtonText}
          </Button>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <SectionHeader title="基本信息" actionHref="/student/profile/stage/1" actionText="编辑" />
      <InfoCard>
        <InfoRow icon={<UserOutlined />} label="姓名" value={display(profile.realName)} editable />
        <InfoRow icon={<PhoneOutlined />} label="手机号" value={formatPhone(profile.phone)} muted={!profile.phone} editable />
        <InfoRow icon={<TeamOutlined />} label="家长手机" value={formatPhone(profile.parentPhone)} muted={!profile.parentPhone} editable />
        <InfoRow icon={<EnvironmentOutlined />} label="所在地" value={formatLocation(profile)} />
        <InfoRow icon={<BankOutlined />} label="所在学校" value={display(profile.highSchool)} />
        <InfoRow icon={<FileTextOutlined />} label="考试类型" value={formatExam(profile)} editable />
          </InfoCard>
        </div>

        <div>
          <SectionHeader title="选考科目" actionHref="/student/profile/stage/1" actionText="修改" />
          <InfoCard>
        <div className="px-4 py-3.5">
          <div className="mb-2 text-[11px] text-text-secondary">选科组合 · 当前成绩结构</div>
          <div className="flex flex-wrap gap-1.5">
            {selectedSubjects(profile).map((subject) => (
              <span
                key={subject}
                className="inline-flex items-center rounded-lg bg-accent-fixed px-3 py-1.5 text-xs font-medium text-accent"
              >
                {subject}
              </span>
            ))}
          </div>
        </div>
          </InfoCard>
        </div>

        <div>
          <SectionHeader title="成绩结构" actionHref="/student/profile/stage/1" actionText="查看详情" />
          <section className="rounded-xl bg-surface px-4 py-4 shadow-card">
        <div className="grid h-20 grid-cols-6 items-end gap-1.5">
          {bars.map((bar, index) => (
            <div key={`${bar.label}-${index}`} className="flex h-full flex-col items-center justify-end gap-1">
              <span className={`text-[10px] font-semibold ${index === 0 ? 'text-primary' : 'text-text'}`}>
                {bar.value ?? '--'}
              </span>
              <span
                className={`w-full rounded-t bg-gradient-to-b ${
                  index === 0 ? 'from-primary to-primary-light' : 'from-accent to-accent-light'
                }`}
                style={{ height: `${bar.height}px` }}
              />
            </div>
          ))}
        </div>
        <div className="mt-1.5 grid grid-cols-6 gap-1.5 text-center text-[9.5px] text-text-muted">
          {bars.map((bar, index) => (
            <span key={`${bar.label}-${index}`}>{bar.label}</span>
          ))}
        </div>
          </section>
        </div>

        <div>
          <SectionHeader title="意向偏好" actionHref="/student/profile/stage/2" actionText="编辑" />
          <InfoCard>
        <InfoRow label="意向城市" value={formatList(profile.preferredCities)} editable />
        <InfoRow label="意向院校" value={formatList(profile.preferredUniversities)} editable />
        <InfoRow label="意向专业" value={formatList(profile.preferredMajors)} editable />
        <InfoRow label="优先模式" value={profile.priorityMode ? PRIORITY_LABELS[profile.priorityMode] ?? profile.priorityMode : '待补充'} editable />
        <InfoRow label="学费预算" value={profile.tuitionBudget ? TUITION_LABELS[profile.tuitionBudget] ?? profile.tuitionBudget : '待补充'} editable />
          </InfoCard>
        </div>
      </div>

      <div className="xl:hidden">
        <SectionHeader title="档案填写" />
        {renderStageLinks()}
      </div>

      <SectionHeader title="账户与设置" />
      <InfoCard>
        <SettingLink icon={<StarOutlined />} href="/student/recommend" title="推荐入口" subtitle="基于当前档案生成冲稳保参考" />
        <SettingLink icon={<FileTextOutlined />} href="/student/plans" title="我的方案" subtitle="查看老师生成的志愿方案" />
        <SettingLink icon={<BellOutlined />} href="/student/dashboard" title="消息提醒" subtitle="时间线与档案待完善提醒" />
        <SettingLink icon={<ExportOutlined />} href="/student/profile" title="导出我的数据" subtitle="PDF / CSV 能力待后端开放" disabled />
        <SettingLink icon={<MailOutlined />} href="/student/profile" title="帮助中心 / 反馈" subtitle="联系老师或提交使用反馈" disabled />
      </InfoCard>

      <div className="mt-5 text-center text-[11px] text-text-faint">智愿家 · 2026 高考志愿填报助手</div>
      </div>
    </StudentWorkspace>
  );
}

function SectionHeader({
  title,
  actionHref,
  actionText,
}: {
  title: string;
  actionHref?: string;
  actionText?: string;
}) {
  return (
    <div className="mx-0 mt-6 mb-2.5 flex items-center justify-between">
      <h2 className="m-0 font-serif text-base font-semibold text-text">{title}</h2>
      {actionHref && actionText ? (
        <Link href={actionHref} className="text-[11px] font-medium text-primary no-underline">
          {actionText}
        </Link>
      ) : null}
    </div>
  );
}

function InfoCard({ children }: { children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-xl bg-surface shadow-card">{children}</section>;
}

function InfoRow({
  icon,
  label,
  value,
  muted,
  editable,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
  editable?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-4 py-3 text-[13px] last:border-b-0">
      <div className="flex shrink-0 items-center gap-2 text-xs text-text-tertiary">
        {icon ? (
          <span className="flex h-[22px] w-[22px] items-center justify-center rounded-md bg-surface-dim text-[11px] text-text-tertiary">
            {icon}
          </span>
        ) : null}
        {label}
      </div>
      <div className="flex min-w-0 items-center gap-2 text-right">
        <span className={`truncate font-medium ${muted ? 'text-text-muted' : 'text-text'}`}>{value}</span>
        {editable ? <ArrowRightOutlined className="shrink-0 text-[10px] text-text-faint" /> : null}
      </div>
    </div>
  );
}

function StageLink({
  href,
  badge,
  title,
  subtitle,
  percent,
  complete,
  compact,
}: {
  href: string;
  badge: string;
  title: string;
  subtitle: string;
  percent: number;
  complete?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-xl px-4 py-3 text-text no-underline ${
        compact ? 'bg-surface-dim shadow-none' : 'bg-surface shadow-card'
      }`}
    >
      <span
        className={`flex h-10 w-10 items-center justify-center rounded-[10px] font-serif text-lg font-semibold ${
          complete ? 'bg-primary text-white' : 'bg-accent-fixed text-accent'
        }`}
      >
        {complete ? <CheckCircleOutlined className="text-base" /> : badge}
      </span>
      <span className="min-w-0">
        <span className="block font-serif text-[15px] font-semibold text-text">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-text-muted">{subtitle}</span>
      </span>
      <span className="text-right">
        <span className="block font-serif text-base font-semibold tabular-nums text-accent">{percent}%</span>
        <ArrowRightOutlined className="text-[10px] text-text-faint" />
      </span>
    </Link>
  );
}

function SettingLink({
  icon,
  href,
  title,
  subtitle,
  disabled,
}: {
  icon: React.ReactNode;
  href: string;
  title: string;
  subtitle?: string;
  disabled?: boolean;
}) {
  const content = (
    <>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-dim text-sm text-text-tertiary">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-text">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-[10.5px] text-text-muted">{subtitle}</span> : null}
      </span>
      <ArrowRightOutlined className="text-[10px] text-text-faint" />
    </>
  );

  if (disabled) {
    return (
      <div className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-border-subtle px-4 py-3 opacity-70 last:border-b-0">
        {content}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-border-subtle px-4 py-3 text-text no-underline last:border-b-0"
    >
      {content}
    </Link>
  );
}
