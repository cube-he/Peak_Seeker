'use client';

import { Layout, Button, Card, Row, Col, Space } from 'antd';
import {
  SearchOutlined,
  BulbOutlined,
  FileTextOutlined,
  BarChartOutlined,
  ArrowRightOutlined,
  BankOutlined,
  BookOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';

const { Content } = Layout;

const features = [
  {
    icon: <BankOutlined style={{ fontSize: 28 }} />,
    title: '院校查询',
    description: '2200+ 院校数据，多维度筛选对比',
    link: '/universities',
    color: '#2563EB',
    bg: '#EFF6FF',
  },
  {
    icon: <BookOutlined style={{ fontSize: 28 }} />,
    title: '专业查询',
    description: '1400+ 专业信息，就业前景一目了然',
    link: '/majors',
    color: '#059669',
    bg: '#ECFDF5',
  },
  {
    icon: <BulbOutlined style={{ fontSize: 28 }} />,
    title: '智能推荐',
    description: '基于分数位次，AI 智能匹配冲稳保',
    link: '/recommend',
    color: '#D97706',
    bg: '#FFFBEB',
  },
  {
    icon: <FileTextOutlined style={{ fontSize: 28 }} />,
    title: '志愿方案',
    description: '一键生成 96 个志愿，科学不滑档',
    link: '/plan',
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
];

const stats = [
  { value: '2200+', label: '院校数据', color: '#2563EB' },
  { value: '1400+', label: '专业信息', color: '#059669' },
  { value: '3年', label: '录取数据', color: '#D97706' },
  { value: '96', label: '志愿位置', color: '#7C3AED' },
];

export default function HomePage() {
  return (
    <MainLayout>
      <Content>
        {/* Hero Section */}
        <div
          className="text-center rounded-2xl mb-8 relative overflow-hidden"
          style={{
            padding: '64px 24px',
            background: 'linear-gradient(135deg, #EFF6FF 0%, #E0E7FF 50%, #F5F3FF 100%)',
          }}
        >
          <div
            className="absolute inset-0 opacity-30"
            style={{
              backgroundImage: 'radial-gradient(circle at 20% 50%, #93C5FD 0%, transparent 50%), radial-gradient(circle at 80% 50%, #C4B5FD 0%, transparent 50%)',
            }}
          />
          <div className="relative z-10">
            <div
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-medium mb-6"
              style={{ background: 'rgba(37, 99, 235, 0.1)', color: '#2563EB' }}
            >
              <BarChartOutlined /> 2025 高考志愿填报
            </div>
            <h1
              className="text-4xl font-bold mb-4"
              style={{ color: '#0F172A', letterSpacing: '-0.02em' }}
            >
              志愿填报助手
            </h1>
            <p
              className="text-lg mb-8 max-w-xl mx-auto"
              style={{ color: '#475569', lineHeight: 1.7 }}
            >
              基于 AI 技术的高考志愿填报智能助手
              <br />
              科学分析、精准定位、合理填报
            </p>
            <Space size={16}>
              <Link href="/recommend">
                <Button
                  type="primary"
                  size="large"
                  icon={<BulbOutlined />}
                  style={{ height: 48, paddingInline: 32, fontSize: 16, fontWeight: 600 }}
                >
                  开始智能推荐
                </Button>
              </Link>
              <Link href="/universities">
                <Button
                  size="large"
                  icon={<SearchOutlined />}
                  style={{ height: 48, paddingInline: 32, fontSize: 16 }}
                >
                  查询院校
                </Button>
              </Link>
            </Space>
          </div>
        </div>

        {/* Features Section */}
        <Row gutter={[20, 20]} className="mb-8">
          {features.map((feature, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Link href={feature.link}>
                <Card
                  hoverable
                  className="h-full cursor-pointer"
                  styles={{ body: { padding: '28px 24px' } }}
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
                    style={{ background: feature.bg, color: feature.color }}
                  >
                    {feature.icon}
                  </div>
                  <h3
                    className="text-base font-semibold mb-2"
                    style={{ color: '#0F172A' }}
                  >
                    {feature.title}
                  </h3>
                  <p className="text-sm mb-3" style={{ color: '#64748B', lineHeight: 1.6 }}>
                    {feature.description}
                  </p>
                  <span
                    className="text-sm font-medium inline-flex items-center gap-1"
                    style={{ color: feature.color }}
                  >
                    了解更多 <ArrowRightOutlined style={{ fontSize: 12 }} />
                  </span>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>

        {/* Stats Section */}
        <Card>
          <Row gutter={24}>
            {stats.map((stat, index) => (
              <Col xs={12} sm={6} key={index} className="text-center py-4">
                <div
                  className="text-3xl font-bold mb-1"
                  style={{ color: stat.color, letterSpacing: '-0.02em' }}
                >
                  {stat.value}
                </div>
                <div className="text-sm" style={{ color: '#64748B' }}>
                  {stat.label}
                </div>
              </Col>
            ))}
          </Row>
        </Card>
      </Content>
    </MainLayout>
  );
}
