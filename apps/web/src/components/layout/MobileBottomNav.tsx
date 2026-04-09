'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HomeOutlined,
  BankOutlined,
  StarOutlined,
  FileTextOutlined,
  UserOutlined,
} from '@ant-design/icons';

const tabs = [
  { href: '/', label: '首页', icon: HomeOutlined },
  { href: '/universities', label: '院校', icon: BankOutlined },
  { href: '/recommend', label: 'AI推荐', icon: StarOutlined, highlight: true },
  { href: '/plan', label: '方案', icon: FileTextOutlined },
  { href: '/profile', label: '我的', icon: UserOutlined },
];

export default function MobileBottomNav() {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-[rgba(250,249,245,0.95)] backdrop-blur-xl border-t border-border safe-area-bottom">
      <div className="flex items-center justify-around h-14 px-2">
        {tabs.map((tab) => {
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
  );
}
