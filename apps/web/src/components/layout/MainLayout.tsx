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
    { key: 'plans', label: <Link href="/plans">我的方案</Link> },
    { type: 'divider' as const },
    { key: 'logout', label: '退出登录', onClick: logout },
  ];

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center justify-between px-6 bg-white shadow-sm">
        <div className="flex items-center">
          <Link href="/" className="text-xl font-bold text-primary mr-8">
            志愿填报助手
          </Link>
          <Menu
            mode="horizontal"
            selectedKeys={[pathname]}
            items={menuItems.map((item) => ({
              ...item,
              label: <Link href={item.key}>{item.label}</Link>,
            }))}
            className="border-none"
          />
        </div>
        <Space>
          {isLoggedIn ? (
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <Space className="cursor-pointer">
                <Avatar icon={<UserOutlined />} />
                <span>{user?.username}</span>
              </Space>
            </Dropdown>
          ) : (
            <>
              <Link href="/login">
                <Button type="text" icon={<LoginOutlined />}>
                  登录
                </Button>
              </Link>
              <Link href="/register">
                <Button type="primary">注册</Button>
              </Link>
            </>
          )}
        </Space>
      </Header>

      <Content className="p-6 bg-gray-50">{children}</Content>

      <Footer className="text-center text-gray-500">
        志愿填报助手 ©{new Date().getFullYear()} - 帮助考生科学填报志愿
      </Footer>
    </Layout>
  );
}
