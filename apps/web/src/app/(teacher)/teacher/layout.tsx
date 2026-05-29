'use client';

/* 教师工作台设计稿样式 (willnest-teacher.css, 6969 行).
   在这里 import 而不是 globals.css —— 它含大量 element-level reset 和通用
   className, 全局 import 会污染登录页 / 学生侧 (实测登录卡片被吃掉).
   Next.js app router 会把 CSS 切到 /teacher/* 路由的 chunk, 离开教师路由
   切回时 CSS 不会"卸载", 但用户从登录页开始访问时这堆样式不会加载. */
import '@/styles/willnest-teacher.css';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown } from 'antd';
import {
  AppstoreOutlined,
  TeamOutlined,
  FileTextOutlined,
  BankOutlined,
  ReadOutlined,
  QuestionCircleOutlined,
  LogoutOutlined,
  UserOutlined,
  BellOutlined,
  MenuOutlined,
  CloseOutlined,
  MessageOutlined,
  BarChartOutlined,
  PieChartOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';
import BrandLogo from '@/components/layout/BrandLogo';

const mainNavItems = [
  { href: '/teacher/dashboard', icon: <AppstoreOutlined />, label: '看板' },
  { href: '/teacher/students', icon: <TeamOutlined />, label: '学生管理' },
  { href: '/teacher/plans', icon: <FileTextOutlined />, label: '方案管理' },
  { href: '/teacher/historical-cases', icon: <HistoryOutlined />, label: '历史案例' },
];

// 沟通相关入口 (Plan 12). 团队报表只对主管展示.
const commNavItems = [
  { href: '/teacher/clinic', icon: <MessageOutlined />, label: '坐诊面板' },
  { href: '/teacher/insights/me', icon: <BarChartOutlined />, label: '我的复盘' },
];
const supervisorOnlyCommNavItems = [
  { href: '/teacher/insights/team', icon: <PieChartOutlined />, label: '团队报表' },
];

const browseNavItems = [
  { href: '/universities', icon: <BankOutlined />, label: '院校库' },
  { href: '/majors', icon: <ReadOutlined />, label: '专业库' },
];

const bottomNavItems = [] as Array<(typeof mainNavItems)[number]>;

interface TeacherLayoutProps {
  children: React.ReactNode;
}

export default function TeacherLayout({ children }: TeacherLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isSupervisor = user?.teacherProfile?.isSupervisor === true;
  const visibleCommNavItems = isSupervisor
    ? [...commNavItems, ...supervisorOnlyCommNavItems]
    : commNavItems;

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  // 登出后硬跳到 /login, 让 layout / SSR 整体重挂载, 避免下个用户登录后
  // 看到上个用户残留的 nav (zustand hydrate 慢于 client navigation 的 race).
  const handleLogout = () => {
    logout();
    if (typeof window !== 'undefined') window.location.assign('/login');
  };

  const userMenuItems = [
    { key: 'profile', label: <Link href="/profile">个人中心</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: handleLogout },
  ];

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="p-6 mb-2">
        <BrandLogo href="/teacher/dashboard" />
        <p className="ml-12 mt-1 text-[9px] uppercase tracking-[1.5px] text-text-muted">
          Teacher Workspace
        </p>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 px-3">
        <div className="text-[10px] uppercase tracking-wider text-text-faint font-medium px-3 mb-2">
          工作台
        </div>
        {mainNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 no-underline text-sm transition-colors duration-200
              ${isActive(item.href)
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-tertiary hover:bg-surface-dim'
              }
            `}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="border-t border-border-subtle my-3" />

        <div className="text-[10px] uppercase tracking-wider text-text-faint font-medium px-3 mb-2">
          沟通
        </div>
        {visibleCommNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 no-underline text-sm transition-colors duration-200
              ${isActive(item.href)
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-tertiary hover:bg-surface-dim'
              }
            `}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="border-t border-border-subtle my-3" />

        <div className="text-[10px] uppercase tracking-wider text-text-faint font-medium px-3 mb-2">
          浏览
        </div>
        {browseNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 no-underline text-sm transition-colors duration-200
              ${isActive(item.href)
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-tertiary hover:bg-surface-dim'
              }
            `}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}

        <div className="border-t border-border-subtle my-3" />

        {bottomNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`
              flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 no-underline text-sm transition-colors duration-200
              ${isActive(item.href)
                ? 'bg-primary-fixed text-primary font-medium'
                : 'text-text-tertiary hover:bg-surface-dim'
              }
            `}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-6 pb-6 space-y-1">
        <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors">
          <QuestionCircleOutlined /> 帮助支持
        </button>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors"
        >
          <LogoutOutlined /> 退出登录
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[260px] flex-col fixed inset-y-0 left-0 bg-surface border-r border-border z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[85vw] max-w-[260px] bg-surface flex flex-col shadow-2xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface-dim border-0 bg-transparent cursor-pointer"
            >
              <CloseOutlined />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 min-w-0 lg:ml-[260px]">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 h-14 bg-[rgba(250,249,245,0.92)] backdrop-blur-xl shadow-nav">
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 h-full">
            <button
              className="lg:hidden p-2 hover:bg-surface-dim rounded-lg border-0 bg-transparent cursor-pointer"
              onClick={() => setSidebarOpen(true)}
            >
              <MenuOutlined className="text-lg" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <button className="w-8 h-8 bg-surface-dim rounded-full flex items-center justify-center text-text-tertiary border-0 cursor-pointer transition-colors duration-200 hover:text-primary">
                <BellOutlined className="text-base" />
              </button>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                <button
                  type="button"
                  aria-label="用户菜单"
                  aria-haspopup="menu"
                  className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
                >
                  <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-[13px] font-sans font-medium">
                    {user?.realName?.charAt(0) || user?.username?.charAt(0) || <UserOutlined />}
                  </span>
                  <span className="text-text font-medium text-sm hidden sm:inline">
                    {user?.realName || user?.username || '教师'}
                  </span>
                </button>
              </Dropdown>
            </div>
          </div>
        </header>

        {/* Page Content — wn-teacher-scope: willnest-teacher.css 所有规则已被
            scope 脚本加上 `.wn-teacher-scope` 前缀, 只在此 wrapper 内生效, 防止
            client navigation 后残留的 CSS 污染 /universities 等非教师页面 */}
        <main className="wn-teacher-scope p-4 sm:p-6 lg:p-8 bg-bg min-h-[calc(100vh-56px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
