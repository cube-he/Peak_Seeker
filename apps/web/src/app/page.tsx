'use client';

import { Layout, Button, Typography, Card, Row, Col, Space } from 'antd';
import {
  SearchOutlined,
  BulbOutlined,
  FileTextOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';

const { Content } = Layout;
const { Title, Paragraph } = Typography;

const features = [
  {
    icon: <SearchOutlined style={{ fontSize: 48, color: '#1677ff' }} />,
    title: '院校专业查询',
    description: '全面的院校和专业数据，支持多维度筛选和对比',
    link: '/universities',
  },
  {
    icon: <BulbOutlined style={{ fontSize: 48, color: '#52c41a' }} />,
    title: '智能推荐',
    description: '基于分数和位次，智能推荐适合的院校和专业',
    link: '/recommend',
  },
  {
    icon: <FileTextOutlined style={{ fontSize: 48, color: '#faad14' }} />,
    title: '志愿方案',
    description: '一键生成冲稳保志愿方案，科学填报不滑档',
    link: '/plan',
  },
  {
    icon: <RobotOutlined style={{ fontSize: 48, color: '#722ed1' }} />,
    title: 'AI 助手',
    description: '智能对话助手，解答志愿填报疑问',
    link: '/ai-chat',
  },
];

export default function HomePage() {
  return (
    <MainLayout>
      <Content>
        {/* Hero Section */}
        <div className="text-center py-16 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg mb-8">
          <Title level={1}>志愿填报助手</Title>
          <Paragraph className="text-lg text-gray-600 max-w-2xl mx-auto">
            基于 AI 技术的高考志愿填报智能助手，帮助考生科学分析、精准定位、合理填报
          </Paragraph>
          <Space size="large" className="mt-6">
            <Link href="/recommend">
              <Button type="primary" size="large">
                开始智能推荐
              </Button>
            </Link>
            <Link href="/universities">
              <Button size="large">查询院校</Button>
            </Link>
          </Space>
        </div>

        {/* Features Section */}
        <Row gutter={[24, 24]}>
          {features.map((feature, index) => (
            <Col xs={24} sm={12} lg={6} key={index}>
              <Link href={feature.link}>
                <Card
                  hoverable
                  className="text-center h-full"
                  styles={{ body: { padding: '32px 24px' } }}
                >
                  <div className="mb-4">{feature.icon}</div>
                  <Title level={4}>{feature.title}</Title>
                  <Paragraph className="text-gray-500 mb-0">
                    {feature.description}
                  </Paragraph>
                </Card>
              </Link>
            </Col>
          ))}
        </Row>

        {/* Stats Section */}
        <Card className="mt-8">
          <Row gutter={24} className="text-center">
            <Col xs={12} sm={6}>
              <Title level={2} className="text-primary mb-1">
                3000+
              </Title>
              <Paragraph className="text-gray-500">院校数据</Paragraph>
            </Col>
            <Col xs={12} sm={6}>
              <Title level={2} className="text-primary mb-1">
                800+
              </Title>
              <Paragraph className="text-gray-500">专业信息</Paragraph>
            </Col>
            <Col xs={12} sm={6}>
              <Title level={2} className="text-primary mb-1">
                5年
              </Title>
              <Paragraph className="text-gray-500">历史数据</Paragraph>
            </Col>
            <Col xs={12} sm={6}>
              <Title level={2} className="text-primary mb-1">
                96
              </Title>
              <Paragraph className="text-gray-500">志愿位置</Paragraph>
            </Col>
          </Row>
        </Card>
      </Content>
    </MainLayout>
  );
}
