'use client';

import Link from 'next/link';
import {
  AppstoreOutlined,
  BankOutlined,
  FileTextOutlined,
  StarOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  STUDENT_NAV_ITEMS,
  StudentNavKey,
  isStudentNavActive,
} from './studentNav';

const iconMap: Record<StudentNavKey, React.ReactNode> = {
  dashboard: <AppstoreOutlined />,
  plans: <FileTextOutlined />,
  recommend: <StarOutlined />,
  universities: <BankOutlined />,
  profile: <UserOutlined />,
};

function formatNumber(value?: number | null) {
  if (value === null || value === undefined) return '--';
  return value.toLocaleString('zh-CN');
}

function numericValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function displayName(profile?: Record<string, unknown>) {
  const value = profile?.realName || profile?.username;
  return typeof value === 'string' && value.trim() ? value : '同学';
}

function schoolLine(profile?: Record<string, unknown>) {
  const parts = [profile?.highSchool, profile?.classInfo].filter(
    (value): value is string =>
      typeof value === 'string' && value.trim().length > 0,
  );
  return parts.length ? parts.join(' · ') : '完善学校与班级信息';
}

export interface StudentSummaryRailProps {
  profile?: Record<string, unknown>;
  progress?: {
    overallCompleteness?: number;
    isRecommendable?: boolean;
  };
  plansCount?: number;
  activePathname: string;
}

export default function StudentSummaryRail({
  profile,
  progress,
  plansCount,
  activePathname,
}: StudentSummaryRailProps) {
  const name = displayName(profile);
  const initial = name.charAt(0);
  const recommendable = progress?.isRecommendable;

  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-xl bg-gradient-to-br from-primary to-[#15212e] p-5 text-white shadow-glow-primary">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/20 bg-gradient-to-br from-accent to-accent-light font-serif text-xl font-semibold">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="m-0 truncate font-serif text-lg font-semibold">{name}</p>
            <p className="m-0 mt-1 truncate text-xs text-white/65">
              {schoolLine(profile)}
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ['总分', formatNumber(numericValue(profile?.totalScore))],
            ['省排名', formatNumber(numericValue(profile?.provincialRank))],
            [
              '完整度',
              progress?.overallCompleteness !== undefined
                ? `${progress.overallCompleteness}%`
                : '--',
            ],
            ['方案', plansCount !== undefined ? String(plansCount) : '--'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/[0.08] px-3 py-2">
              <p className="m-0 font-serif text-lg font-semibold tabular-nums">
                {value}
              </p>
              <p className="m-0 text-[10px] uppercase tracking-[1.4px] text-white/50">
                {label}
              </p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-white/[0.08] px-3 py-2 text-xs text-white/65">
          {recommendable ? '资料已具备推荐条件' : '完善资料后推荐更稳定'}
        </div>
      </section>

      <nav className="rounded-xl bg-surface p-2 shadow-card" aria-label="学生端导航">
        {STUDENT_NAV_ITEMS.map((item) => {
          const active = isStudentNavActive(activePathname, item.href);
          return (
            <Link
              key={item.key}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={`grid grid-cols-[32px_1fr] items-center gap-3 rounded-lg px-3 py-3 text-text no-underline transition-colors ${
                active ? 'bg-primary-fixed text-primary' : 'hover:bg-surface-dim'
              }`}
            >
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-dim text-sm"
              >
                {iconMap[item.key]}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.label}</span>
                <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
