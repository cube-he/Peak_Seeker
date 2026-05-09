'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dropdown, Space } from 'antd';
import {
  AppstoreOutlined,
  FileTextOutlined,
  StarOutlined,
  BankOutlined,
  UserOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { useAuthStore } from '@/stores/authStore';
import BrandLogo from '@/components/layout/BrandLogo';

const bottomTabs = [
  { href: '/student/dashboard', icon: AppstoreOutlined, label: '首页' },
  { href: '/student/plans', icon: FileTextOutlined, label: '方案' },
  { href: '/student/recommend', icon: StarOutlined, label: '推荐', highlight: true },
  { href: '/universities', icon: BankOutlined, label: '院校' },
  { href: '/student/profile', icon: UserOutlined, label: '我的' },
];

interface StudentLayoutProps {
  children: React.ReactNode;
}

export default function StudentLayout({ children }: StudentLayoutProps) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  const userMenuItems = [
    { key: 'profile', label: <Link href="/student/profile">个人信息</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];

  return (
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 h-14 backdrop-blur-xl bg-[rgba(250,249,245,0.92)] shadow-nav">
        <div className="flex items-center justify-between px-4 h-full max-w-[600px] mx-auto lg:max-w-none lg:px-8">
          <BrandLogo href="/student/dashboard" size="sm" showSubtitle={false} />

          <div className="flex items-center gap-3">
            <button className="w-8 h-8 bg-surface-dim rounded-full flex items-center justify-center text-text-tertiary border-0 cursor-pointer hover:text-primary transition-colors">
              <BellOutlined className="text-base" />
            </button>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space className="cursor-pointer">
                <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-[13px] font-medium">
                  {user?.realName?.charAt(0) || user?.username?.charAt(0) || <UserOutlined />}
                </span>
              </Space>
            </Dropdown>
          </div>
        </div>
      </header>

      {/* Content — mobile-first with max width constraint */}
      <main className="flex-1 px-4 py-4 pb-20 lg:pb-4 max-w-[600px] mx-auto w-full lg:max-w-[1200px] lg:px-8 lg:py-6">
        {children}
      </main>

      {/* Bottom Navigation (mobile & tablet) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[rgba(250,249,245,0.95)] backdrop-blur-xl border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around h-14 px-2">
          {bottomTabs.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
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
        </div>
      </nav>
    </div>
  );
}
