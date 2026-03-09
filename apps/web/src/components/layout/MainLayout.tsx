'use client';

import { Layout, Menu, Button, Space, Dropdown, Avatar } from 'antd';
import {
  HomeOutlined,
  BankOutlined,
  BookOutlined,
  LineChartOutlined,
  BulbOutlined,
  FileTextOutlined,
  UserOutlined,
  LoginOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/authStore';

const { Header, Content, Footer } = Layout;

const menuItems = [
  { key: '/', icon: <HomeOutlined />, label: '首页' },
  { key: '/universities', icon: <BankOutlined />, label: '院校查询' },
  { key: '/majors', icon: <BookOutlined />, label: '专业查询' },
  { key: '/scores', icon: <LineChartOutlined />, label: '分数线' },
  { key: '/recommend', icon: <BulbOutlined />, label: '智能推荐' },
  { key: '/plan', icon: <FileTextOutlined />, label: '志愿方案' },
];

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const pathname = usePathname();
  const { isLoggedIn, user, logout } = useAuthStore();

  const userMenuItems = [
    { key: 'profile', label: <Link href="/profile">个人中心</Link> },
    { key: 'favorites', label: <Link href="/favorites">我的收藏</Link> },
    { key: 'plans', label: <Link href="/plan">我的方案</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];

  return (
    <Layout className="min-h-screen" style={{ background: '#F8FAFC' }}>
      <Header
        className="flex items-center justify-between px-6"
        style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          height: 64,
          lineHeight: '64px',
          boxShadow: 'none',
        }}
      >
        <div className="flex items-center">
          <Link href="/" className="flex items-center mr-8 no-underline">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center mr-2 text-white font-bold text-sm"
              style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
            >
              志
            </div>
            <span className="text-lg font-semibold" style={{ color: '#0F172A' }}>
              志愿填报助手
            </span>
          </Link>
          <Menu
            mode="horizontal"
            selectedKeys={[pathname]}
            items={menuItems.map((item) => ({
              ...item,
              label: <Link href={item.key}>{item.label}</Link>,
            }))}
            style={{ border: 'none', background: 'transparent', lineHeight: '62px' }}
          />
        </div>
        <Space size={8}>
          {isLoggedIn ? (
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space className="cursor-pointer px-3 py-1 rounded-lg hover:bg-gray-50 transition-colors">
                <Avatar
                  size={32}
                  icon={<UserOutlined />}
                  style={{ background: '#2563EB' }}
                />
                <span style={{ color: '#334155', fontWeight: 500 }}>{user?.username}</span>
              </Space>
            </Dropdown>
          ) : (
            <Space size={8}>
              <Link href="/login">
                <Button type="text" icon={<LoginOutlined />} style={{ color: '#64748B' }}>
                  登录
                </Button>
              </Link>
              <Link href="/register">
                <Button type="primary">注册</Button>
              </Link>
            </Space>
          )}
        </Space>
      </Header>

      <Content
        style={{
          padding: '24px',
          maxWidth: 1280,
          margin: '0 auto',
          width: '100%',
          background: 'transparent',
        }}
      >
        {children}
      </Content>

      <Footer
        style={{
          textAlign: 'center',
          color: '#94A3B8',
          background: 'transparent',
          borderTop: '1px solid #E2E8F0',
          fontSize: 13,
          padding: '16px 24px',
        }}
      >
        志愿填报助手 ©{new Date().getFullYear()} · 帮助考生科学填报志愿
      </Footer>
    </Layout>
  );
}
