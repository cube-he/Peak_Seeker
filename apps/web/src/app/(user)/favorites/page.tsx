'use client';

import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Typography,
  Tag,
  Tabs,
  Empty,
  Popconfirm,
  message,
} from 'antd';
import {
  StarFilled,
  DeleteOutlined,
  BankOutlined,
  BookOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { favoriteService } from '@/services/favorite';
import { useAuthStore } from '@/stores/authStore';
import Link from 'next/link';

const { Title, Text } = Typography;

export default function FavoritesPage() {
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'university' | 'major'>('university');

  const { data: favorites, isLoading } = useQuery({
    queryKey: ['favorites', activeTab],
    queryFn: () => favoriteService.getList(activeTab),
    enabled: isLoggedIn,
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => favoriteService.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['favorites'] });
      message.success('已取消收藏');
    },
  });

  if (!isLoggedIn) {
    return (
      <MainLayout>
        <Card className="text-center py-16">
          <Empty description="请先登录后查看收藏" />
          <Link href="/login">
            <Button type="primary" className="mt-4">去登录</Button>
          </Link>
        </Card>
      </MainLayout>
    );
  }

  const universityColumns = [
    {
      title: '院校名称',
      key: 'name',
      render: (_: any, record: any) => (
        <div>
          <Link href={`/universities/${record.university?.id}`} className="font-medium text-primary">
            {record.university?.name}
          </Link>
          <div>
            <Text type="secondary" className="text-xs">
              {record.university?.province} · {record.university?.type}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '标签',
      key: 'tags',
      width: 200,
      render: (_: any, record: any) => (
        <Space size={4} wrap>
          {record.university?.is985 && <Tag color="red">985</Tag>}
          {record.university?.is211 && <Tag color="orange">211</Tag>}
          {record.university?.isDoubleFirstClass && <Tag color="blue">双一流</Tag>}
        </Space>
      ),
    },
    {
      title: '收藏时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      render: (text: string) => text || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: any) => (
        <Popconfirm
          title="确定取消收藏？"
          onConfirm={() => removeMutation.mutate(record.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const majorColumns = [
    {
      title: '专业名称',
      key: 'name',
      render: (_: any, record: any) => (
        <div>
          <span className="font-medium">{record.major?.name}</span>
          <div>
            <Text type="secondary" className="text-xs">
              {record.major?.category} · {record.major?.discipline}
            </Text>
          </div>
        </div>
      ),
    },
    {
      title: '层次',
      key: 'level',
      width: 80,
      render: (_: any, record: any) => (
        <Tag color={record.major?.level === '本科' ? 'blue' : 'green'}>
          {record.major?.level || '-'}
        </Tag>
      ),
    },
    {
      title: '收藏时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (text: string) => new Date(text).toLocaleString('zh-CN'),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      render: (text: string) => text || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: any) => (
        <Popconfirm
          title="确定取消收藏？"
          onConfirm={() => removeMutation.mutate(record.id)}
        >
          <Button type="text" danger icon={<DeleteOutlined />} />
        </Popconfirm>
      ),
    },
  ];

  const tabItems = [
    {
      key: 'university',
      label: (
        <span><BankOutlined className="mr-1" />收藏院校</span>
      ),
      children: (
        <Table
          columns={universityColumns}
          dataSource={favorites}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="暂无收藏的院校" /> }}
        />
      ),
    },
    {
      key: 'major',
      label: (
        <span><BookOutlined className="mr-1" />收藏专业</span>
      ),
      children: (
        <Table
          columns={majorColumns}
          dataSource={favorites}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: <Empty description="暂无收藏的专业" /> }}
        />
      ),
    },
  ];

  return (
    <MainLayout>
      <Card
        title={
          <Title level={4} className="mb-0">
            <StarFilled style={{ color: '#faad14' }} className="mr-2" />
            我的收藏
          </Title>
        }
      >
        <Tabs
          items={tabItems}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'university' | 'major')}
        />
      </Card>
    </MainLayout>
  );
}
