'use client';

import { Dropdown, Avatar, Space, Button } from 'antd';
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

const navItems = [
  { href: '/', label: '首页' },
  { href: '/universities', label: '院校库' },
  { href: '/majors', label: '专业库' },
  { href: '/scores', label: '查分系统' },
  { href: '/recommend', label: 'AI 智能推荐' },
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
    <div className="min-h-screen bg-surface flex flex-col">
      {/* Header */}
      <header className="bg-surface/90 backdrop-blur-xl fixed top-0 z-50 w-full">
        <nav className="flex justify-between items-center w-full px-6 lg:px-8 h-20 max-w-[1920px] mx-auto">
          {/* Brand */}
          <Link href="/" className="no-underline flex items-center">
            <span className="text-xl font-extrabold tracking-tighter text-primary font-headline">
              巅峰智选 Summit Intelligence
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden lg:flex gap-8 items-center">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`font-headline font-semibold text-sm tracking-tight no-underline transition-colors duration-300 ${
                  isActive(item.href)
                    ? 'text-primary border-b-2 border-primary pb-1'
                    : 'text-slate-600 hover:text-primary'
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
                <button className="p-2 hover:bg-surface-container-low rounded-lg transition-all duration-300 border-0 bg-transparent cursor-pointer">
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
                      {user?.username}
                    </span>
                  </Space>
                </Dropdown>
              </>
            ) : (
              <Space size={8}>
                <Link href="/login">
                  <Button
                    type="text"
                    icon={<LoginOutlined />}
                    className="text-on-surface-variant"
                  >
                    登录
                  </Button>
                </Link>
                <Link href="/register">
                  <Button type="primary">注册</Button>
                </Link>
              </Space>
            )}

            {/* Mobile Menu Toggle */}
            <button
              className="lg:hidden p-2 hover:bg-surface-container-low rounded-lg transition-all border-0 bg-transparent cursor-pointer"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <MenuOutlined className="text-on-surface text-lg" />
            </button>
          </div>
        </nav>

        {/* Tonal separator */}
        <div className="h-px w-full bg-surface-container-low" />

        {/* Mobile Nav Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-surface-container-lowest border-t border-surface-container-low">
            <div className="flex flex-col py-2 px-4">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`py-3 px-4 rounded-lg font-headline font-semibold text-sm no-underline transition-colors ${
                    isActive(item.href)
                      ? 'text-primary bg-primary-fixed/30'
                      : 'text-on-surface-variant hover:text-primary hover:bg-surface-container-low'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </header>

      {/* Spacer for fixed header */}
      <div className="h-20" />

      {/* Content */}
      <main
        className={`flex-1 ${noPadding ? '' : 'px-6 lg:px-8 py-8'}`}
        style={{ maxWidth: maxWidth || '1920px', margin: '0 auto', width: '100%' }}
      >
        {children}
      </main>

      {/* Footer */}
      <FooterSection />
    </div>
  );
}
