'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Dropdown, Space } from 'antd';
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

const sideNavItems = [
  { href: '/plan', icon: <AppstoreOutlined />, label: '控制面板' },
  { href: '/plan', icon: <FileTextOutlined />, label: '我的方案', exact: true },
  { href: '/plan', icon: <CheckSquareOutlined />, label: '申请状态' },
  { href: '/plan', icon: <TeamOutlined />, label: '模拟面试' },
  { href: '/plan', icon: <CommentOutlined />, label: '顾问对话' },
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
        <Link href="/" className="no-underline">
          <h2 className="text-primary font-headline font-extrabold text-lg mb-1">录取指挥部</h2>
        </Link>
        <p className="text-on-surface-variant text-xs">精英计划 运行中</p>
      </div>

      {/* Nav Items */}
      <nav className="flex-1 px-3">
        {sideNavItems.map((item, i) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          return (
            <Link
              key={i}
              href={item.href}
              onClick={() => setSidebarOpen(false)}
              className={`
                flex items-center gap-3 px-4 py-3 rounded-xl mb-1 no-underline text-sm font-medium transition-all duration-300
                ${i === 1 && active
                  ? 'bg-gradient-to-r from-primary to-primary-container text-white shadow-glow-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'
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
        <div className="bg-tertiary-fixed rounded-2xl p-4">
          <p className="text-xs font-label text-on-tertiary-fixed-variant mb-1">会员权益</p>
          <p className="text-sm font-semibold text-on-tertiary-fixed mb-3">升级到铂金会员</p>
          <button className="w-full py-2 rounded-lg bg-tertiary text-on-tertiary text-xs font-semibold border-0 cursor-pointer hover:opacity-90 transition-opacity">
            解锁数据引擎
          </button>
        </div>
      </div>

      {/* Bottom Links */}
      <div className="px-6 pb-6 space-y-1">
        <button className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low border-0 bg-transparent cursor-pointer transition-colors">
          <QuestionCircleOutlined /> 帮助支持
        </button>
        <button
          onClick={logout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-on-surface-variant hover:bg-surface-container-low border-0 bg-transparent cursor-pointer transition-colors"
        >
          <LogoutOutlined /> 退出登录
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-surface flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-72 flex-col fixed inset-y-0 left-0 bg-surface-container-lowest border-r border-surface-container-low z-40">
        {sidebarContent}
      </aside>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/30" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-surface-container-lowest flex flex-col shadow-2xl">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-surface-container-low border-0 bg-transparent cursor-pointer"
            >
              <CloseOutlined />
            </button>
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 lg:ml-72">
        {/* Top Bar */}
        <header className="sticky top-0 z-30 bg-surface/90 backdrop-blur-xl">
          <div className="flex items-center justify-between px-6 lg:px-8 h-20">
            <div className="flex items-center gap-4">
              <button
                className="lg:hidden p-2 hover:bg-surface-container-low rounded-lg border-0 bg-transparent cursor-pointer"
                onClick={() => setSidebarOpen(true)}
              >
                <MenuOutlined className="text-lg" />
              </button>
              <div>
                {pageTitle && (
                  <h1 className="text-primary font-headline font-extrabold text-xl">{pageTitle}</h1>
                )}
                {pageSubtitle && (
                  <p className="text-on-surface-variant text-sm">{pageSubtitle}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button className="p-2 hover:bg-surface-container-low rounded-lg border-0 bg-transparent cursor-pointer">
                <BellOutlined className="text-on-surface-variant text-lg" />
              </button>
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Space className="cursor-pointer px-3 py-1.5 rounded-xl hover:bg-surface-container-low transition-all duration-300">
                  <Avatar
                    size={32}
                    icon={<UserOutlined />}
                    style={{ background: 'linear-gradient(135deg, #003fb1, #1a56db)' }}
                  />
                  <span className="text-on-surface font-medium text-sm hidden sm:inline">
                    {user?.username || 'Guest'}
                  </span>
                </Space>
              </Dropdown>
            </div>
          </div>
          <div className="h-px w-full bg-surface-container-low" />
        </header>

        {/* Page Content */}
        <main className="p-6 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
