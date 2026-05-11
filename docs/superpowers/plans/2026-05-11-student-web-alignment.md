# Student Web Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the student core pages from mobile-shell layouts into a shared desktop WillNest workspace while preserving the existing mobile experience.

**Architecture:** Add small shared student workspace primitives, then migrate the four approved pages into a desktop three-column composition. Keep existing data fetching, mutations, routes, and mobile bottom navigation intact.

**Tech Stack:** Next.js 14 App Router, React 18, TypeScript, Tailwind CSS, Ant Design 5, React Query, Jest + Testing Library.

---

## File Structure

Create focused shared UI and logic under `apps/web/src/components/student/workspace/`:

- `studentNav.ts`: route metadata and active-route matching.
- `StudentWorkspace.tsx`: generic desktop three-column layout primitives and reusable panel wrapper.
- `StudentSummaryRail.tsx`: desktop left rail showing student identity, stats, and navigation.
- `__tests__/studentNav.test.ts`: unit tests for active-route matching.
- `__tests__/StudentWorkspace.test.tsx`: component tests for layout primitives.
- `__tests__/StudentSummaryRail.test.tsx`: component tests for rail rendering and fallback values.

Modify existing student surfaces:

- `apps/web/src/app/(student)/student/layout.tsx`: add desktop top navigation and remove remaining narrow desktop assumptions from chrome.
- `apps/web/src/app/(student)/student/profile/page.tsx`: use `StudentWorkspace` with profile main content and right rail actions.
- `apps/web/src/app/(student)/student/dashboard/page.tsx`: use `StudentWorkspace` with overview main content and reminders/right rail.
- `apps/web/src/app/(student)/student/plans/page.tsx`: use `StudentWorkspace` with widened plan list and status/help right rail.
- `apps/web/src/app/(student)/student/recommend/page.tsx`: use `StudentWorkspace` with recommendation flow and readiness right rail.

Do not modify:

- Backend service code.
- Prisma schema or migration files.
- `/student/profile/stage/[stage]` form behavior.
- `pnpm-lock.yaml`.

## Task 1: Student Navigation Helper

**Files:**
- Create: `apps/web/src/components/student/workspace/studentNav.ts`
- Create: `apps/web/src/components/student/workspace/__tests__/studentNav.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/web/src/components/student/workspace/__tests__/studentNav.test.ts`:

```ts
import { STUDENT_NAV_ITEMS, isStudentNavActive } from '../studentNav';

describe('studentNav', () => {
  it('marks exact route matches as active', () => {
    expect(isStudentNavActive('/student/profile', '/student/profile')).toBe(true);
  });

  it('marks nested route matches as active', () => {
    expect(isStudentNavActive('/student/plans/12', '/student/plans')).toBe(true);
  });

  it('does not match sibling routes with the same prefix', () => {
    expect(isStudentNavActive('/student/plans-extra', '/student/plans')).toBe(false);
  });

  it('keeps the expected student navigation order', () => {
    expect(STUDENT_NAV_ITEMS.map((item) => item.key)).toEqual([
      'dashboard',
      'plans',
      'recommend',
      'universities',
      'profile',
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter web test -- studentNav.test.ts
```

Expected: FAIL because `../studentNav` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/components/student/workspace/studentNav.ts`:

```ts
export type StudentNavKey =
  | 'dashboard'
  | 'plans'
  | 'recommend'
  | 'universities'
  | 'profile';

export interface StudentNavItem {
  key: StudentNavKey;
  href: string;
  label: string;
  description: string;
  highlight?: boolean;
}

export const STUDENT_NAV_ITEMS: StudentNavItem[] = [
  {
    key: 'dashboard',
    href: '/student/dashboard',
    label: '首页',
    description: '进度与提醒',
  },
  {
    key: 'plans',
    href: '/student/plans',
    label: '方案',
    description: '老师生成的志愿方案',
  },
  {
    key: 'recommend',
    href: '/student/recommend',
    label: '推荐',
    description: 'AI 快速推荐',
    highlight: true,
  },
  {
    key: 'universities',
    href: '/universities',
    label: '院校',
    description: '院校库查询',
  },
  {
    key: 'profile',
    href: '/student/profile',
    label: '我的',
    description: '档案与偏好',
  },
];

export function isStudentNavActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter web test -- studentNav.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/workspace/studentNav.ts apps/web/src/components/student/workspace/__tests__/studentNav.test.ts
git commit -m "feat(web): add student navigation helper"
```

## Task 2: Shared Student Workspace Primitives

**Files:**
- Create: `apps/web/src/components/student/workspace/StudentWorkspace.tsx`
- Create: `apps/web/src/components/student/workspace/__tests__/StudentWorkspace.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `apps/web/src/components/student/workspace/__tests__/StudentWorkspace.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '../StudentWorkspace';

describe('StudentWorkspace', () => {
  it('renders rail, main content, and aside in separate landmark regions', () => {
    render(
      <StudentWorkspace
        rail={<div>Rail content</div>}
        aside={<div>Aside content</div>}
      >
        <div>Main content</div>
      </StudentWorkspace>,
    );

    expect(screen.getByLabelText('学生工作台导航')).toHaveTextContent('Rail content');
    expect(screen.getByRole('main')).toHaveTextContent('Main content');
    expect(screen.getByLabelText('学生工作台辅助信息')).toHaveTextContent('Aside content');
  });

  it('does not render an aside region when aside content is absent', () => {
    render(
      <StudentWorkspace rail={<div>Rail content</div>}>
        <div>Main content</div>
      </StudentWorkspace>,
    );

    expect(screen.queryByLabelText('学生工作台辅助信息')).not.toBeInTheDocument();
  });

  it('renders a titled workspace panel with optional action', () => {
    render(
      <StudentWorkspacePanel
        title="资料完整度"
        action={<a href="/student/profile/stage/1">继续完善</a>}
      >
        <p>64%</p>
      </StudentWorkspacePanel>,
    );

    expect(screen.getByText('资料完整度')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '继续完善' })).toHaveAttribute(
      'href',
      '/student/profile/stage/1',
    );
    expect(screen.getByText('64%')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx
```

Expected: FAIL because `../StudentWorkspace` does not exist.

- [ ] **Step 3: Implement the workspace primitives**

Create `apps/web/src/components/student/workspace/StudentWorkspace.tsx`:

```tsx
'use client';

interface StudentWorkspaceProps {
  rail: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

interface StudentWorkspacePanelProps {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function StudentWorkspace({
  rail,
  aside,
  children,
  className = '',
}: StudentWorkspaceProps) {
  return (
    <div
      className={`grid w-full gap-5 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_300px] ${className}`}
    >
      <aside aria-label="学生工作台导航" className="hidden lg:block">
        {rail}
      </aside>
      <main className="min-w-0" role="main">
        {children}
      </main>
      {aside ? (
        <aside aria-label="学生工作台辅助信息" className="hidden xl:block">
          <div className="sticky top-20 space-y-4">{aside}</div>
        </aside>
      ) : null}
    </div>
  );
}

export function StudentWorkspacePanel({
  title,
  action,
  children,
  className = '',
}: StudentWorkspacePanelProps) {
  return (
    <section className={`rounded-xl bg-surface px-5 py-4 shadow-card ${className}`}>
      {title || action ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          {title ? (
            <h2 className="m-0 font-serif text-base font-semibold text-text">
              {title}
            </h2>
          ) : (
            <span />
          )}
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/workspace/StudentWorkspace.tsx apps/web/src/components/student/workspace/__tests__/StudentWorkspace.test.tsx
git commit -m "feat(web): add student workspace layout"
```

## Task 3: Desktop Student Summary Rail

**Files:**
- Create: `apps/web/src/components/student/workspace/StudentSummaryRail.tsx`
- Create: `apps/web/src/components/student/workspace/__tests__/StudentSummaryRail.test.tsx`

- [ ] **Step 1: Write the failing component tests**

Create `apps/web/src/components/student/workspace/__tests__/StudentSummaryRail.test.tsx`:

```tsx
/** @jest-environment jsdom */
import { render, screen } from '@testing-library/react';
import StudentSummaryRail from '../StudentSummaryRail';

describe('StudentSummaryRail', () => {
  it('shows student identity and numeric context', () => {
    render(
      <StudentSummaryRail
        activePathname="/student/profile"
        profile={{
          realName: '陈意涵',
          highSchool: '成都七中',
          classInfo: '高三 3 班',
          totalScore: 644,
          provincialRank: 8240,
        }}
        progress={{ overallCompleteness: 72, isRecommendable: true }}
        plansCount={3}
      />,
    );

    expect(screen.getByText('陈意涵')).toBeInTheDocument();
    expect(screen.getByText('成都七中 · 高三 3 班')).toBeInTheDocument();
    expect(screen.getByText('644')).toBeInTheDocument();
    expect(screen.getByText('8,240')).toBeInTheDocument();
    expect(screen.getByText('72%')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('uses fallback labels when profile values are missing', () => {
    render(
      <StudentSummaryRail
        activePathname="/student/dashboard"
        profile={{ username: 'student01' }}
      />,
    );

    expect(screen.getByText('student01')).toBeInTheDocument();
    expect(screen.getAllByText('--').length).toBeGreaterThanOrEqual(3);
  });

  it('marks the active navigation link', () => {
    render(
      <StudentSummaryRail
        activePathname="/student/plans/1"
        profile={{ realName: '陈意涵' }}
      />,
    );

    expect(screen.getByRole('link', { name: /方案/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm --filter web test -- StudentSummaryRail.test.tsx
```

Expected: FAIL because `../StudentSummaryRail` does not exist.

- [ ] **Step 3: Implement the summary rail**

Create `apps/web/src/components/student/workspace/StudentSummaryRail.tsx`:

```tsx
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

function displayName(profile?: Record<string, unknown>) {
  const value = profile?.realName || profile?.username;
  return typeof value === 'string' && value.trim() ? value : '同学';
}

function schoolLine(profile?: Record<string, unknown>) {
  const parts = [profile?.highSchool, profile?.classInfo].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0,
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
            <p className="m-0 mt-1 truncate text-xs text-white/65">{schoolLine(profile)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {[
            ['总分', formatNumber(profile?.totalScore as number | undefined)],
            ['省排名', formatNumber(profile?.provincialRank as number | undefined)],
            ['完整度', progress?.overallCompleteness !== undefined ? `${progress.overallCompleteness}%` : '--'],
            ['方案', plansCount !== undefined ? String(plansCount) : '--'],
          ].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-white/8 px-3 py-2">
              <p className="m-0 font-serif text-lg font-semibold tabular-nums">{value}</p>
              <p className="m-0 text-[10px] uppercase tracking-[1.4px] text-white/50">{label}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-lg bg-white/8 px-3 py-2 text-xs text-white/65">
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
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-dim text-sm">
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pnpm --filter web test -- StudentSummaryRail.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/student/workspace/StudentSummaryRail.tsx apps/web/src/components/student/workspace/__tests__/StudentSummaryRail.test.tsx
git commit -m "feat(web): add student summary rail"
```

## Task 4: Student Layout Desktop Navigation

**Files:**
- Modify: `apps/web/src/app/(student)/student/layout.tsx`

- [ ] **Step 1: Re-run navigation tests before touching the layout**

Run:

```bash
pnpm --filter web test -- studentNav.test.ts
```

Expected: PASS. This confirms the active-route helper is ready to drive both desktop and mobile navigation.

- [ ] **Step 2: Update imports in the student layout**

In `apps/web/src/app/(student)/student/layout.tsx`, add:

```tsx
import {
  STUDENT_NAV_ITEMS,
  StudentNavKey,
  isStudentNavActive,
} from '@/components/student/workspace/studentNav';
```

Keep the existing Ant Design icon imports, then add an icon map near the top of the file:

```tsx
const iconMap: Record<StudentNavKey, React.ComponentType> = {
  dashboard: AppstoreOutlined,
  plans: FileTextOutlined,
  recommend: StarOutlined,
  universities: BankOutlined,
  profile: UserOutlined,
};
```

- [ ] **Step 3: Replace the local `bottomTabs` array**

Remove the old `bottomTabs` constant and use `STUDENT_NAV_ITEMS` for both desktop and mobile navigation. In the bottom navigation map, replace `bottomTabs.map` with:

```tsx
{STUDENT_NAV_ITEMS.map((tab) => {
  const active = isActive(tab.href);
  const Icon = iconMap[tab.key];
  return (
    <Link
      key={tab.href}
      href={tab.href}
      className={`no-underline flex flex-col items-center justify-center gap-0.5 flex-1 py-1 rounded-lg transition-colors duration-200 ${
        active
          ? 'text-primary'
          : 'text-text-muted hover:text-text-secondary'
      }`}
    >
      {tab.highlight && !active ? (
        <span className="w-9 h-9 bg-gradient-to-br from-primary to-primary-light rounded-full flex items-center justify-center text-white text-base -mt-3 shadow-glow-primary">
          <Icon />
        </span>
      ) : (
        <Icon className={`text-lg ${active ? 'text-primary' : ''}`} />
      )}
      <span className={`text-[10px] leading-tight ${active ? 'font-medium' : ''} ${tab.highlight && !active ? 'mt-0.5' : ''}`}>
        {tab.label}
      </span>
    </Link>
  );
})}
```

- [ ] **Step 4: Add desktop top navigation**

Inside the header container, between `BrandLogo` and the right-side controls, add:

```tsx
<nav className="hidden items-center gap-1 lg:flex" aria-label="学生端桌面导航">
  {STUDENT_NAV_ITEMS.map((item) => {
    const active = isActive(item.href);
    const Icon = iconMap[item.key];
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm no-underline transition-colors ${
          active
            ? 'bg-primary-fixed text-primary'
            : 'text-text-tertiary hover:bg-surface-dim hover:text-primary'
        }`}
      >
        <Icon className="text-sm" />
        {item.label}
      </Link>
    );
  })}
</nav>
```

- [ ] **Step 5: Widen desktop chrome and keep mobile behavior**

Keep the header sticky and mobile bottom nav. Set the main class to:

```tsx
<main className="flex-1 px-4 py-4 pb-20 lg:mx-auto lg:w-full lg:max-w-[1200px] lg:px-8 lg:py-6 lg:pb-8">
  {children}
</main>
```

Expected behavior:

- Mobile remains full-width single-column with bottom nav.
- Desktop shows top nav and no bottom nav.
- The layout no longer constrains desktop children to `max-w-[600px]`.

- [ ] **Step 6: Verify layout helper tests still pass**

Run:

```bash
pnpm --filter web test -- studentNav.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(student)/student/layout.tsx
git commit -m "feat(web): add student desktop navigation"
```

## Task 5: Profile Page Desktop Workspace

**Files:**
- Modify: `apps/web/src/app/(student)/student/profile/page.tsx`

- [ ] **Step 1: Run shared workspace tests before the page migration**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Add imports**

In `apps/web/src/app/(student)/student/profile/page.tsx`, add:

```tsx
import { usePathname } from 'next/navigation';
import StudentSummaryRail from '@/components/student/workspace/StudentSummaryRail';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '@/components/student/workspace/StudentWorkspace';
```

- [ ] **Step 3: Read the active pathname and build workspace rails**

Inside `StudentProfilePage`, after `const queryClient = useQueryClient();`, add:

```tsx
const pathname = usePathname();
```

After `canSubmitIntake` is computed, add:

```tsx
const rail = (
  <StudentSummaryRail
    activePathname={pathname}
    profile={profile}
    progress={progress}
  />
);

const aside = (
  <>
    <StudentWorkspacePanel title="推荐资料完整度">
      <CompactProgress
        percent={progress.overallCompleteness}
        filled={filled}
        total={64}
        missing={progress.missingFieldsForRecommend ?? []}
      />
    </StudentWorkspacePanel>

    <StudentWorkspacePanel title="资料确认状态">
      <div className="space-y-3">
        <p className="m-0 text-sm leading-6 text-text-muted">
          {intakeStatus === 'VERIFIED'
            ? '老师已确认，可以进入方案生成'
            : intakeStatus === 'SUBMITTED'
              ? '已提交，等待老师确认'
              : intakeStatus === 'NEEDS_CHANGES'
                ? profile.intakeReviewComment || '老师退回，请按意见补充'
                : '核心资料完成后提交给老师确认'}
        </p>
        <Button
          type="primary"
          disabled={!canSubmitIntake}
          loading={submitIntakeMutation.isPending}
          onClick={() => submitIntakeMutation.mutate()}
          block
        >
          {intakeStatus === 'NEEDS_CHANGES' ? '重新提交' : '提交资料'}
        </Button>
      </div>
    </StudentWorkspacePanel>

    <StudentWorkspacePanel title="档案填写">
      <div className="space-y-2.5">
        <StageLink
          href="/student/profile/stage/1"
          badge="1"
          title="核心信息"
          subtitle="身份、电话、成绩与选科"
          percent={stagePercent(stages.stage1)}
          complete={stages.stage1?.completed}
        />
        <StageLink
          href="/student/profile/stage/2"
          badge="2"
          title="完善信息"
          subtitle="身体条件、地域偏好与专业方向"
          percent={stagePercent(stages.stage2)}
          complete={stages.stage2?.completed}
        />
        <StageLink
          href="/student/profile/stage/3"
          badge="3"
          title="高级信息"
          subtitle="排除项、经济条件、兴趣性格"
          percent={stagePercent(stages.stage3)}
          complete={stages.stage3?.completed}
        />
      </div>
    </StudentWorkspacePanel>
  </>
);
```

- [ ] **Step 4: Replace the page wrapper**

Replace:

```tsx
return (
  <div className="mx-auto max-w-[520px] pb-20">
```

with:

```tsx
return (
  <StudentWorkspace rail={rail} aside={aside}>
    <div className="space-y-5 pb-20 lg:pb-0">
```

Then close with:

```tsx
    </div>
  </StudentWorkspace>
);
```

Remove the duplicated mobile-only completeness, intake-status, and stage-entry sections from the main column on `xl` if they appear twice. Keep them in the main column for mobile by adding a separate wrapper:

```tsx
<div className="space-y-5 xl:hidden">
  {/* mobile completeness, intake status, and stage links */}
</div>
```

- [ ] **Step 5: Make profile sections desktop two-column**

Wrap the basic info, subjects, score structure, and preferences sections in a desktop grid:

```tsx
<div className="grid gap-5 lg:grid-cols-2">
  <div>{/* Basic info section */}</div>
  <div>{/* Subject section */}</div>
  <div>{/* Score structure section */}</div>
  <div>{/* Preference section */}</div>
</div>
```

Keep the hero and four-stat strip above the grid.

- [ ] **Step 6: Run focused verification**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
pnpm --filter web lint
```

Expected: tests PASS; lint exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(student)/student/profile/page.tsx
git commit -m "feat(web): align student profile desktop layout"
```

## Task 6: Dashboard Page Desktop Workspace

**Files:**
- Modify: `apps/web/src/app/(student)/student/dashboard/page.tsx`

- [ ] **Step 1: Run shared workspace tests**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Add imports**

In `apps/web/src/app/(student)/student/dashboard/page.tsx`, add:

```tsx
import { usePathname } from 'next/navigation';
import StudentSummaryRail from '@/components/student/workspace/StudentSummaryRail';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '@/components/student/workspace/StudentWorkspace';
```

- [ ] **Step 3: Build rail and aside content**

Inside the page component:

```tsx
const pathname = usePathname();
```

After `plans`, `completion`, and timeline values are available:

```tsx
const rail = (
  <StudentSummaryRail
    activePathname={pathname}
    profile={profile}
    progress={progressData?.data}
    plansCount={plans.length}
  />
);

const aside = (
  <>
    <StudentWorkspacePanel title="消息提醒">
      <div className="space-y-3">
        <Link href="/student/profile" className="block text-text no-underline">
          <span className="block text-sm font-medium">完善个人信息后，推荐会更稳定</span>
          <span className="mt-1 block text-xs leading-5 text-text-muted">
            {progressData?.data?.missingFieldsForRecommend?.length
              ? `仍有 ${progressData.data.missingFieldsForRecommend.length} 项关键信息待补充`
              : '成绩、选科和偏好越完整，方案越贴近真实填报'}
          </span>
        </Link>
        <div className="border-t border-border-subtle pt-3">
          <span className="block text-sm font-medium text-text">
            {currentYear} 年高考时间线已同步
          </span>
          <span className="mt-1 block text-xs leading-5 text-text-muted">
            倒计时、志愿填报节点会跟随后台时间线接口更新
          </span>
        </div>
      </div>
    </StudentWorkspacePanel>

    <StudentWorkspacePanel title="下一步">
      <div className="space-y-2 text-sm text-text-secondary">
        <Link href="/student/profile" className="block text-primary no-underline">
          完善档案资料
        </Link>
        <Link href="/student/recommend" className="block text-primary no-underline">
          生成快速推荐
        </Link>
        <Link href="/student/plans" className="block text-primary no-underline">
          查看老师方案
        </Link>
      </div>
    </StudentWorkspacePanel>
  </>
);
```

- [ ] **Step 4: Wrap dashboard content**

Replace the top-level:

```tsx
return (
  <div className="space-y-5">
```

with:

```tsx
return (
  <StudentWorkspace rail={rail} aside={aside}>
    <div className="space-y-5">
```

Close with:

```tsx
    </div>
  </StudentWorkspace>
);
```

Move the existing "消息提醒" section into a mobile-only block:

```tsx
<section className="xl:hidden">
  {/* existing mobile message reminder section */}
</section>
```

- [ ] **Step 5: Make desktop main content scan better**

Use desktop grids where the content is already card-based:

```tsx
<div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
  <section>{/* current plan */}</section>
  <section>{/* quick actions or progress support card */}</section>
</div>
```

Keep the welcome hero and decision progress strip full-width in the main column.

- [ ] **Step 6: Run focused verification**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
pnpm --filter web lint
```

Expected: tests PASS; lint exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(student)/student/dashboard/page.tsx
git commit -m "feat(web): align student dashboard desktop layout"
```

## Task 7: Plans Page Desktop Workspace

**Files:**
- Modify: `apps/web/src/app/(student)/student/plans/page.tsx`

- [ ] **Step 1: Run shared workspace tests**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Add imports and profile query**

In `apps/web/src/app/(student)/student/plans/page.tsx`, add:

```tsx
import { usePathname } from 'next/navigation';
import StudentSummaryRail from '@/components/student/workspace/StudentSummaryRail';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '@/components/student/workspace/StudentWorkspace';
import { studentApi } from '@/services/student-api';
```

Inside `StudentPlansPage`:

```tsx
const pathname = usePathname();
const { data: profileData } = useQuery({
  queryKey: ['student-my-profile'],
  queryFn: () => studentApi.getMyProfile(),
});
const profile = (profileData as any)?.data ?? profileData;
```

- [ ] **Step 3: Build rail and aside content**

After `plans` and counts are computed:

```tsx
const rail = (
  <StudentSummaryRail
    activePathname={pathname}
    profile={profile}
    progress={profile?.progress}
    plansCount={plans.length}
  />
);

const aside = (
  <>
    <StudentWorkspacePanel title="方案状态">
      <div className="space-y-3 text-sm leading-6 text-text-secondary">
        <p className="m-0">当前列表由老师生成，学生端可查看、确认或请求修改。</p>
        <p className="m-0">草稿、归档和当前方案会保留在同一列表中，便于对比。</p>
      </div>
    </StudentWorkspacePanel>
    <StudentWorkspacePanel title="能力说明">
      <p className="m-0 text-sm leading-6 text-text-muted">
        新建、复制和导出方案需要后端开放学生端方案编辑接口。当前先保留老师生成方案的查看入口。
      </p>
    </StudentWorkspacePanel>
  </>
);
```

- [ ] **Step 4: Wrap page content**

Replace:

```tsx
return (
  <div className="space-y-5">
```

with:

```tsx
return (
  <StudentWorkspace rail={rail} aside={aside}>
    <div className="space-y-5">
```

Close with:

```tsx
    </div>
  </StudentWorkspace>
);
```

- [ ] **Step 5: Widen plan cards on desktop**

In the plan card link class, add desktop-friendly spacing:

```tsx
className={`block overflow-hidden rounded-2xl border-l-[3px] bg-surface text-text no-underline shadow-card transition-shadow hover:shadow-card-hover lg:rounded-xl ${getPlanClass(plan.status)}`}
```

Change the card header grid to allow desktop scanning:

```tsx
<div className="grid gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
```

Keep mobile visual behavior unchanged.

- [ ] **Step 6: Run focused verification**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
pnpm --filter web lint
```

Expected: tests PASS; lint exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(student)/student/plans/page.tsx
git commit -m "feat(web): align student plans desktop layout"
```

## Task 8: Recommend Page Desktop Workspace

**Files:**
- Modify: `apps/web/src/app/(student)/student/recommend/page.tsx`

- [ ] **Step 1: Run shared workspace tests**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Add imports**

In `apps/web/src/app/(student)/student/recommend/page.tsx`, add:

```tsx
import { usePathname } from 'next/navigation';
import StudentSummaryRail from '@/components/student/workspace/StudentSummaryRail';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '@/components/student/workspace/StudentWorkspace';
```

- [ ] **Step 3: Build rail and aside content**

Inside `StudentRecommendPage`:

```tsx
const pathname = usePathname();
```

After `profile` and `effectiveScore` are computed:

```tsx
const rail = (
  <StudentSummaryRail
    activePathname={pathname}
    profile={profile}
    progress={profile?.progress}
  />
);

const aside = (
  <>
    <StudentWorkspacePanel title="推荐准备度">
      <div className="space-y-3">
        {[
          ['基本信息', effectiveScore ? `分数 ${effectiveScore}` : '等待输入分数', Boolean(effectiveScore)],
          ['省排名与选科', profile?.provincialRank ? `位次 ${profile.provincialRank}` : '待完善档案', Boolean(profile?.provincialRank)],
          ['专业与城市偏好', '补充偏好后结果更稳定', Boolean(profile?.preferredCities?.length || profile?.preferredMajors?.length)],
        ].map(([label, meta, done]) => (
          <div key={label as string} className="grid grid-cols-[24px_1fr] gap-3">
            <span className={`mt-0.5 h-5 w-5 rounded-full ${done ? 'bg-safe' : 'bg-accent-fixed'}`} />
            <span>
              <span className="block text-sm font-medium text-text">{label}</span>
              <span className="mt-0.5 block text-xs text-text-muted">{meta}</span>
            </span>
          </div>
        ))}
      </div>
    </StudentWorkspacePanel>

    <StudentWorkspacePanel title="下一步">
      <div className="space-y-2 text-sm">
        <Link href="/student/profile" className="block text-primary no-underline">
          完善档案资料
        </Link>
        <Link href="/universities" className="block text-primary no-underline">
          去院校库手动查看
        </Link>
      </div>
    </StudentWorkspacePanel>
  </>
);
```

- [ ] **Step 4: Wrap page content**

Replace:

```tsx
return (
  <div className="space-y-5">
```

with:

```tsx
return (
  <StudentWorkspace rail={rail} aside={aside}>
    <div className="space-y-5">
```

Close with:

```tsx
    </div>
  </StudentWorkspace>
);
```

Move the existing recommendation-flow section into a mobile-only block if it duplicates the right rail:

```tsx
<section className="xl:hidden">
  {/* existing recommendation flow steps */}
</section>
```

- [ ] **Step 5: Improve desktop result layout**

Where results render, keep rush/stable/safe grouping but allow desktop two-column cards when there is enough space:

```tsx
<div className="grid gap-4 lg:grid-cols-2">
  {items.map((item) => (
    <div key={item.id} className="grid grid-cols-[1fr_64px] gap-3 rounded-xl bg-surface px-4 py-3 shadow-card">
      {/* existing result row content */}
    </div>
  ))}
</div>
```

Keep the current single-column grouped list for mobile.

- [ ] **Step 6: Run focused verification**

Run:

```bash
pnpm --filter web test -- StudentWorkspace.test.tsx StudentSummaryRail.test.tsx
pnpm --filter web lint
```

Expected: tests PASS; lint exits 0.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/app/(student)/student/recommend/page.tsx
git commit -m "feat(web): align student recommend desktop layout"
```

## Task 9: Full Verification And Browser QA

**Files:**
- No code changes expected unless verification finds a concrete defect.

- [ ] **Step 1: Run the full web test suite**

Run:

```bash
pnpm --filter web test
```

Expected: PASS.

- [ ] **Step 2: Run lint**

Run:

```bash
pnpm --filter web lint
```

Expected: exits 0 with no new errors.

- [ ] **Step 3: Run web build**

Run:

```bash
pnpm --filter web build
```

Expected: build succeeds.

- [ ] **Step 4: Start or reuse the web dev server**

Run:

```bash
pnpm dev:web
```

Expected: Next.js dev server starts. Use the displayed local URL, usually `http://localhost:3000`. If port 3000 is busy, use the port Next prints.

- [ ] **Step 5: Browser-check desktop and mobile widths**

Open each route at widths 1440, 1200, 768, and 390:

```text
/student/dashboard
/student/profile
/student/plans
/student/recommend
```

Expected:

- 1440 and 1200: three-column workspace appears where the viewport supports it.
- 768: content remains readable, no horizontal scroll.
- 390: mobile single-column flow and bottom navigation still work.
- No text overlaps cards, buttons, or adjacent sections.
- No nested card-in-card visual pattern appears.
- Stage links still route to `/student/profile/stage/1`, `/2`, and `/3`.

- [ ] **Step 6: Fix only concrete verification failures**

If a command or browser check fails, make the smallest scoped fix and rerun the failing verification command. Do not refactor unrelated pages.

- [ ] **Step 7: Commit verification fixes if any**

If Task 9 required code changes:

```bash
git add apps/web/src
git commit -m "fix(web): polish student workspace responsiveness"
```

If Task 9 required no code changes, do not create an empty commit.

## Self-Review

Spec coverage:

- Four approved pages are covered by Tasks 5-8.
- Shared desktop shell/navigation is covered by Task 4.
- Shared three-column workspace primitives are covered by Tasks 2-3.
- Mobile preservation is explicitly checked in Task 9.
- No backend/API/schema/OCR changes are planned.
- Stage form redesign is out of scope; stage links are verified in Task 9.

Plan hygiene:

- The plan contains no unfinished-marker instructions.
- Any unavailable backend capability is represented as an informational card, not fake data.

Type consistency:

- `StudentNavKey`, `StudentNavItem`, `STUDENT_NAV_ITEMS`, and `isStudentNavActive` are defined in Task 1 and reused consistently in Tasks 3-4.
- `StudentWorkspace`, `StudentWorkspacePanel`, and `StudentSummaryRail` are defined before page migration tasks consume them.
