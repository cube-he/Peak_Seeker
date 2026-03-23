'use client';

import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
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
        <div className="rounded-xl bg-surface-container-lowest shadow-card text-center py-16">
          <Empty description="请先登录后查看收藏" />
          <Link href="/login">
            <Button type="primary" className="mt-4">去登录</Button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  const universityColumns = [
    {
      title: '院校名称',
      key: 'name',
      render: (_: any, record: any) => (
        <div>
          <Link href={`/universities/${record.university?.id}`} className="font-medium text-primary hover:text-primary-container">
            {record.university?.name}
          </Link>
          <div className="text-xs text-on-surface-variant mt-0.5">
            {record.university?.province} · {record.university?.type}
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
          {record.university?.is985 && (
            <span className="inline-block rounded-full bg-tertiary-fixed text-on-tertiary-fixed-variant text-xs font-medium px-3 py-0.5">985</span>
          )}
          {record.university?.is211 && (
            <span className="inline-block rounded-full bg-primary-fixed text-on-primary-fixed-variant text-xs font-medium px-3 py-0.5">211</span>
          )}
          {record.university?.isDoubleFirstClass && (
            <span className="inline-block rounded-full bg-secondary-fixed text-on-secondary-fixed-variant text-xs font-medium px-3 py-0.5">双一流</span>
          )}
        </Space>
      ),
    },
    {
      title: '收藏时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (text: string) => (
        <span className="text-on-surface-variant text-sm">{new Date(text).toLocaleString('zh-CN')}</span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      render: (text: string) => (
        <span className="text-on-surface-variant">{text || '-'}</span>
      ),
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
          <span className="font-medium text-on-surface">{record.major?.name}</span>
          <div className="text-xs text-on-surface-variant mt-0.5">
            {record.major?.category} · {record.major?.discipline}
          </div>
        </div>
      ),
    },
    {
      title: '层次',
      key: 'level',
      width: 80,
      render: (_: any, record: any) => (
        <span className={`inline-block rounded-full text-xs font-medium px-3 py-0.5 ${
          record.major?.level === '本科'
            ? 'bg-primary-fixed text-on-primary-fixed-variant'
            : 'bg-secondary-fixed text-on-secondary-fixed-variant'
        }`}>
          {record.major?.level || '-'}
        </span>
      ),
    },
    {
      title: '收藏时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (text: string) => (
        <span className="text-on-surface-variant text-sm">{new Date(text).toLocaleString('zh-CN')}</span>
      ),
    },
    {
      title: '备注',
      dataIndex: 'notes',
      key: 'notes',
      width: 150,
      render: (text: string) => (
        <span className="text-on-surface-variant">{text || '-'}</span>
      ),
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
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-bold text-on-surface m-0 flex items-center gap-2">
          <StarFilled className="text-tertiary" />
          我的收藏
        </h1>
      </div>

      {/* Tabs Card */}
      <Card>
        <Tabs
          items={tabItems}
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as 'university' | 'major')}
        />
      </Card>
    </MainLayout>
  );
}
