'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown } from 'antd';
import {
  AppstoreOutlined,
  BellOutlined,
  CloseOutlined,
  DatabaseOutlined,
  LogoutOutlined,
  MenuOutlined,
  QuestionCircleOutlined,
  RobotOutlined,
  SettingOutlined,
  TeamOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';
import BrandLogo from '@/components/layout/BrandLogo';

const mainNavItems = [
  { href: '/admin/dashboard', icon: <AppstoreOutlined />, label: '总览' },
  { href: '/admin/users', icon: <TeamOutlined />, label: '用户管理' },
  { href: '/admin/students', icon: <UserSwitchOutlined />, label: '学生归属' },
  { href: '/admin/data/import', icon: <DatabaseOutlined />, label: '数据导入' },
  { href: '/admin/config', icon: <SettingOutlined />, label: '系统配置' },
  { href: '/admin/algorithm-config', icon: <SettingOutlined />, label: '算法配置' },
  { href: '/admin/ai-config', icon: <RobotOutlined />, label: 'AI 配置' },
];

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const userMenuItems = [
    { key: 'profile', label: <Link href="/admin/config">系统设置</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];

  const sidebarContent = (
    <>
      <div className="mb-2 p-6">
        <BrandLogo href="/admin/dashboard" />
        <p className="ml-12 mt-1 text-[9px] uppercase tracking-[1.5px] text-text-muted">
          Admin Console
        </p>
      </div>

      <nav className="flex-1 px-3">
        <div className="mb-2 px-3 text-[10px] font-medium uppercase tracking-wider text-text-faint">
          管理
        </div>
        {mainNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setSidebarOpen(false)}
            className={`
              mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm no-underline transition-colors duration-200
              ${
                isActive(item.href)
                  ? 'bg-primary-fixed font-medium text-primary'
                  : 'text-text-tertiary hover:bg-surface-dim'
              }
            `}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="space-y-1 px-6 pb-6">
        <button className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-secondary">
          <QuestionCircleOutlined /> 帮助
        </button>
        <button
          onClick={logout}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-secondary"
        >
          <LogoutOutlined /> 退出
        </button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-bg">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] flex-col border-r border-border bg-surface lg:flex">
        {sidebarContent}
      </aside>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[85vw] max-w-[240px] flex-col bg-surface shadow-2xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-4 top-4 cursor-pointer rounded-lg border-0 bg-transparent p-2 hover:bg-surface-dim"
            >
              <CloseOutlined />
            </button>
            {sidebarContent}
          </aside>
        </div>
      ) : null}

      <div className="min-w-0 flex-1 lg:ml-[240px]">
        <header className="sticky top-0 z-40 h-14 bg-[rgba(250,249,245,0.92)] shadow-nav backdrop-blur-xl">
          <div className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">
            <button
              className="cursor-pointer rounded-lg border-0 bg-transparent p-2 hover:bg-surface-dim lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <MenuOutlined className="text-lg" />
            </button>
            <div className="flex-1" />
            <div className="flex items-center gap-3">
              <button className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-dim text-text-tertiary transition-colors hover:text-primary">
                <BellOutlined className="text-base" />
              </button>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" trigger={['click']}>
                <button
                  type="button"
                  aria-label="用户菜单"
                  aria-haspopup="menu"
                  className="flex cursor-pointer items-center gap-2 border-0 bg-transparent p-0"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-medium text-white">
                    {user?.username?.charAt(0) || <UserOutlined />}
                  </span>
                  <span className="hidden text-sm font-medium text-text sm:inline">
                    {user?.username || '管理员'}
                  </span>
                </button>
              </Dropdown>
            </div>
          </div>
        </header>

        <main className="min-h-[calc(100vh-56px)] bg-bg p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
