'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown, Space } from 'antd';
import {
  AppstoreOutlined,
  FileTextOutlined,
  CheckSquareOutlined,
  TeamOutlined,
  CommentOutlined,
  SettingOutlined,
  QuestionCircleOutlined,
  LogoutOutlined,
  UserOutlined,
  BellOutlined,
  MenuOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';

const mainNavItems = [
  { href: '/plan', icon: <AppstoreOutlined />, label: '控制面板' },
  { href: '/plan', icon: <FileTextOutlined />, label: '我的方案', exact: true },
  { href: '/plan', icon: <CheckSquareOutlined />, label: '申请状态' },
  { href: '/plan', icon: <TeamOutlined />, label: '模拟面试' },
  { href: '/plan', icon: <CommentOutlined />, label: '顾问对话' },
];

const bottomNavItems = [
  { href: '/profile', icon: <SettingOutlined />, label: '设置中心' },
];

interface SideNavLayoutProps {
  children: React.ReactNode;
  pageTitle?: string;
  pageSubtitle?: string;
}

export default function SideNavLayout({ children, pageTitle, pageSubtitle }: SideNavLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const userMenuItems = [
    { key: 'profile', label: <Link href="/profile">个人中心</Link> },
    { key: 'favorites', label: <Link href="/favorites">我的收藏</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];

  const sidebarContent = (
    <>
      {/* Brand */}
      <div className="p-6 mb-2">
        <Link href="/" className="no-underline flex items-center gap-2.5">
          <span className="w-[34px] h-[34px] bg-gradient-to-br from-primary to-primary-light rounded-lg flex items-center justify-center text-white font-serif font-bold text-[17px]">
            智
          </span>
          <span className="font-serif text-[19px] font-semibold text-text">
            智愿家
          </span>
        </Link>
        <p className="text-xs text-text-muted mt-1.5 ml-[46px]">智慧 · 志愿 · 专家</p>
      </div>

      {/* Main Nav Items */}
      <nav className="flex-1 px-3">
        {mainNavItems.map((item, i) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={i}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 no-underline text-sm transition-colors duration-200
                ${active
                  ? 'bg-primary-fixed text-primary font-medium'
                  : 'text-text-tertiary hover:bg-surface-dim'
                }
              `}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        {/* Divider between nav groups */}
        <div className="border-t border-border-subtle my-2" />

        {bottomNavItems.map((item, i) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={i}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 no-underline text-sm transition-colors duration-200
                ${active
                  ? 'bg-primary-fixed text-primary font-medium'
                  : 'text-text-tertiary hover:bg-surface-dim'
                }
              `}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Member Card */}
      <div className="p-4 mx-3 mb-3">
        <div className="bg-elite-fixed border border-accent/20 rounded-xl p-4">
          <p className="text-xs text-text-muted mb-1">会员权益</p>
          <p className="text-sm font-medium text-accent mb-3">升级到铂金会员</p>
          <button className="w-full py-2 rounded-lg bg-gradient-to-br from-accent to-accent-light text-white text-xs font-semibold border-0 cursor-pointer hover:opacity-90 transition-opacity">
            解锁数据引擎
          </button>
        </div>
      </div>

      {/* Bottom Links */}
      <div className="px-6 pb-6 space-y-1">
        <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-text-muted hover:text-text-secondary border-0 bg-transparent cursor-pointer transition-colors">
          <QuestionCircleOutlined /> 帮助支持
        </button>
        <button
          onClick={logout}
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
      <aside className="hidden lg:flex w-[280px] flex-col fixed inset-y-0 left-0 bg-surface border-r border-border z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-surface flex flex-col shadow-2xl">
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
      <div className="flex-1 lg:ml-[280px]">
        {/* Top Bar */}
        <header className="sticky top-0 z-40 h-16 bg-[rgba(250,249,245,0.92)] backdrop-blur-xl shadow-nav">
          <div className="flex items-center justify-between px-6 lg:px-8 h-full">
            <div className="flex items-center gap-4">
              <button
                className="lg:hidden p-2 hover:bg-surface-dim rounded-lg border-0 bg-transparent cursor-pointer"
                onClick={() => setSidebarOpen(true)}
              >
                <MenuOutlined className="text-lg" />
              </button>
              <div>
                {pageTitle && (
                  <h1 className="font-serif text-lg font-semibold text-text">{pageTitle}</h1>
                )}
                {pageSubtitle && (
                  <p className="text-sm text-text-muted">{pageSubtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="w-8 h-8 bg-surface-dim rounded-full flex items-center justify-center text-text-tertiary border-0 cursor-pointer transition-colors duration-200 hover:text-primary">
                <BellOutlined className="text-base" />
              </button>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Space className="cursor-pointer">
                  <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-[13px] font-sans font-medium">
                    {user?.username?.charAt(0) || <UserOutlined />}
                  </span>
                  <span className="text-text font-medium text-sm hidden sm:inline">
                    {user?.username || 'Guest'}
                  </span>
                </Space>
              </Dropdown>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="p-8 bg-bg">
          {children}
        </main>
      </div>
    </div>
  );
}
