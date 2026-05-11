'use client';

import { Dropdown, Space } from 'antd';
import { BellOutlined, LoginOutlined, MenuOutlined, SearchOutlined, UserOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuthStore } from '@/stores/authStore';
import BrandLogo from './BrandLogo';
import FooterSection from './FooterSection';
import MobileBottomNav from './MobileBottomNav';

const navItems = [
  { href: '/', label: '首页' },
  { href: '/universities', label: '院校库' },
  { href: '/majors', label: '专业库' },
  { href: '/scores', label: '查分系统' },
  { href: '/recommend', label: 'AI 推荐' },
  { href: '/plan', label: '我的方案' },
];

interface MainLayoutProps {
  children: React.ReactNode;
  maxWidth?: string;
  noPadding?: boolean;
  hideMobileBottomNav?: boolean;
}

export default function MainLayout({ children, maxWidth, noPadding, hideMobileBottomNav }: MainLayoutProps) {
  const pathname = usePathname();
  const { isLoggedIn, user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const userMenuItems = [
    { key: 'profile', label: <Link href="/profile">个人中心</Link> },
    { key: 'favorites', label: <Link href="/favorites">我的收藏</Link> },
    { key: 'plans', label: <Link href="/plan">我的方案</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="sticky top-0 z-50 h-16 bg-[rgba(250,249,245,0.92)] shadow-nav backdrop-blur-xl">
        <nav className="flex h-full items-center justify-between px-4 sm:px-6 lg:px-8">
          <BrandLogo />

          <div className="hidden items-center gap-7 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm no-underline transition-colors duration-200 ${
                  isActive(item.href) ? 'font-medium text-primary' : 'text-text-tertiary hover:text-primary'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              className="hidden h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-dim text-text-tertiary transition-colors duration-200 hover:text-primary sm:inline-flex"
              aria-label="搜索"
            >
              <SearchOutlined className="text-sm" />
            </button>

            {isLoggedIn ? (
              <>
                <button className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-dim text-text-tertiary transition-colors duration-200 hover:text-primary">
                  <BellOutlined className="text-base" />
                </button>
                <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                  <Space className="cursor-pointer">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-[13px] font-medium text-white">
                      {user?.username?.charAt(0) || <UserOutlined />}
                    </span>
                  </Space>
                </Dropdown>
              </>
            ) : (
              <Space size={8}>
                <Link href="/login" className="text-sm text-text-tertiary no-underline transition-colors duration-200 hover:text-primary">
                  <LoginOutlined className="mr-1" />
                  登录
                </Link>
                <Link href="/register" className="btn-willnest btn-primary-willnest px-4 py-2 text-[13px]">
                  注册
                </Link>
              </Space>
            )}

            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-dim text-text-tertiary transition-colors duration-200 hover:text-primary lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="打开导航"
            >
              <MenuOutlined className="text-base" />
            </button>
          </div>
        </nav>

        {mobileMenuOpen && (
          <div className="border-t border-border bg-surface lg:hidden">
            <div className="flex flex-col px-4 py-2">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-4 py-3 text-sm no-underline transition-colors duration-200 ${
                    isActive(item.href) ? 'bg-primary/5 font-medium text-primary' : 'text-text-tertiary hover:bg-surface-dim hover:text-primary'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      <main
        className={`min-w-0 flex-1 pb-16 lg:pb-0 ${noPadding ? '' : 'mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8'}`}
        style={noPadding ? { maxWidth: maxWidth || undefined, margin: '0 auto', width: '100%' } : { maxWidth: maxWidth || '1200px' }}
      >
        {children}
      </main>

      <FooterSection />

      {!hideMobileBottomNav && <MobileBottomNav />}
    </div>
  );
}
