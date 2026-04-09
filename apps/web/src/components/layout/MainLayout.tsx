'use client';

import { Dropdown, Space } from 'antd';
import {
  UserOutlined,
  BellOutlined,
  LoginOutlined,
  MenuOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';
import { useState } from 'react';
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
}

export default function MainLayout({ children, maxWidth, noPadding }: MainLayoutProps) {
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
    <div className="min-h-screen bg-bg flex flex-col">
      {/* Navbar */}
      <header className="sticky top-0 z-50 h-16 backdrop-blur-xl bg-[rgba(250,249,245,0.92)] shadow-nav">
        <nav className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 h-full flex items-center justify-between">
          {/* Brand */}
          <Link href="/" className="no-underline flex items-center gap-2.5">
            <span className="w-[34px] h-[34px] bg-gradient-to-br from-primary to-primary-light rounded-lg flex items-center justify-center text-white font-serif font-bold text-[17px]">
              智
            </span>
            <div className="flex flex-col">
              <span className="font-serif text-[19px] font-semibold text-text leading-tight">
                智愿家
              </span>
              <span className="hidden sm:block text-[9px] text-text-muted tracking-[1.5px] leading-tight">
                智慧 · 志愿 · 专家
              </span>
            </div>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-8">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`text-sm no-underline transition-colors duration-200 ${
                  isActive(item.href)
                    ? 'text-primary font-medium'
                    : 'text-text-tertiary hover:text-primary'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            {isLoggedIn ? (
              <>
                <button className="w-8 h-8 bg-surface-dim rounded-full flex items-center justify-center text-text-tertiary border-0 cursor-pointer transition-colors duration-200 hover:text-primary">
                  <BellOutlined className="text-base" />
                </button>
                <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                  <Space className="cursor-pointer">
                    <span className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-white text-[13px] font-sans font-medium">
                      {user?.username?.charAt(0) || <UserOutlined />}
                    </span>
                  </Space>
                </Dropdown>
              </>
            ) : (
              <Space size={8}>
                <Link href="/login" className="text-sm text-text-tertiary hover:text-primary no-underline transition-colors duration-200">
                  <LoginOutlined className="mr-1" />
                  登录
                </Link>
                <Link href="/register">
                  <button className="bg-gradient-to-br from-primary to-primary-light text-white text-[13px] font-medium px-5 py-2 rounded border-0 cursor-pointer hover:opacity-90 transition-opacity duration-200">
                    注册
                  </button>
                </Link>
              </Space>
            )}

            {/* Mobile Menu Toggle */}
            <button
              className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full bg-surface-dim text-text-tertiary border-0 cursor-pointer transition-colors duration-200 hover:text-primary"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <MenuOutlined className="text-base" />
            </button>
          </div>
        </nav>

        {/* Mobile Nav Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-surface border-t border-border">
            <div className="flex flex-col py-2 px-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`py-3 px-4 rounded-lg text-sm no-underline transition-colors duration-200 ${
                    isActive(item.href)
                      ? 'text-primary font-medium bg-primary/5'
                      : 'text-text-tertiary hover:text-primary hover:bg-surface-dim'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Content */}
      <main
        className={`flex-1 min-w-0 pb-16 lg:pb-0 ${noPadding ? '' : 'max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 py-8 w-full'}`}
        style={noPadding ? { maxWidth: maxWidth || undefined, margin: '0 auto', width: '100%' } : { maxWidth: maxWidth || '1200px' }}
      >
        {children}
      </main>

      {/* Footer */}
      <FooterSection />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav />
    </div>
  );
}
