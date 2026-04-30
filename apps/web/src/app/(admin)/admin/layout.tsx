'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown, Space } from 'antd';
import {
  AppstoreOutlined,
  TeamOutlined,
  DatabaseOutlined,
  SettingOutlined,
  RobotOutlined,
  QuestionCircleOutlined,
  LogoutOutlined,
  UserOutlined,
  BellOutlined,
  MenuOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';

const mainNavItems = [
  { href: '/admin/dashboard', icon: <AppstoreOutlined />, label: '总览' },
  { href: '/admin/users', icon: <TeamOutlined />, label: '用户管理' },
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

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const userMenuItems = [
    { key: 'profile', label: <Link href="/admin/config">系统设置</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="p-6 mb-2">
        <Link href="/admin/dashboard" className="no-underline flex items-center gap-2.5">
          <span className="w-[34px] h-[34px] bg-gradient-to-br from-primary to-primary-light rounded-lg flex items-center justify-center text-white font-serif font-bold text-[17px]">
            智
          </span>
          <div className="flex flex-col">
            <span className="font-serif text-[19px] font-semibold text-text leading-tight">
              智愿家
            </span>
            <span className="text-[9px] text-text-muted tracking-[1.5px] leading-tight hidden sm:block">
              管理后台
            </span>
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3">
        <div className="text-[10px] uppercase tracking-wider text-text-faint font-medium px-3 mb-2">
          管理
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
      </nav>

      {/* Bottom */}
      <div className="px-6 pb-6 space-y-1">
        <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors">
          <QuestionCircleOutlined /> 帮助
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors"
        >
          <LogoutOutlined /> 退出
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-[240px] flex-col fixed inset-y-0 left-0 bg-surface border-r border-border z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[85vw] max-w-[240px] bg-surface flex flex-col shadow-2xl">
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
      <div className="flex-1 min-w-0 lg:ml-[240px]">
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
              <button className="w-8 h-8 bg-surface-dim rounded-full flex items-center justify-center text-text-tertiary border-0 cursor-pointer hover:text-primary transition-colors">
                <BellOutlined className="text-base" />
              </button>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Space className="cursor-pointer">
                  <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-[13px] font-medium">
                    {user?.username?.charAt(0) || <UserOutlined />}
                  </span>
                  <span className="text-text font-medium text-sm hidden sm:inline">
                    {user?.username || '管理员'}
                  </span>
                </Space>
              </Dropdown>
            </div>
          </div>
        </header>

        <main className="p-4 sm:p-6 lg:p-8 bg-bg min-h-[calc(100vh-56px)]">
          {children}
        </main>
      </div>
    </div>
  );
}
