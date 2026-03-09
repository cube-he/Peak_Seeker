'use client';

import { useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Modal,
  Form,
  Input,
  Select,
  InputNumber,
  Empty,
  Popconfirm,
  message,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  StarOutlined,
  StarFilled,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { planService, CreatePlanDto } from '@/services/plan';
import { useAuthStore } from '@/stores/authStore';
import { PROVINCES } from '@volunteer-helper/shared';
import Link from 'next/link';

const { Option } = Select;

export default function PlanPage() {
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: plans, isLoading } = useQuery({
    queryKey: ['plans'],
    queryFn: () => planService.getList(),
    enabled: isLoggedIn,
  });

  const createMutation = useMutation({
    mutationFn: (data: CreatePlanDto) => planService.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      setCreateModalOpen(false);
      form.resetFields();
      message.success('方案创建成功');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => planService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
      message.success('已删除');
    },
  });

  const favoriteMutation = useMutation({
    mutationFn: (id: number) => planService.toggleFavorite(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plans'] });
    },
  });

  const statusConfig: Record<string, { color: string; label: string }> = {
    DRAFT: { color: 'default', label: '草稿' },
    SUBMITTED: { color: 'processing', label: '已提交' },
    ARCHIVED: { color: 'warning', label: '已归档' },
  };

  const columns = [
    {
      title: '方案名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <span className="font-medium" style={{ color: '#0F172A' }}>{text}</span>
      ),
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 70 },
    { title: '省份', dataIndex: 'province', key: 'province', width: 70 },
    {
      title: '志愿数',
      key: 'itemCount',
      width: 80,
      render: (_: any, record: any) => (
        <span style={{ color: '#2563EB', fontWeight: 500 }}>{record.items?.length || 0}</span>
      ),
    },
    { title: '策略', dataIndex: 'strategy', key: 'strategy', width: 80, render: (text: string) => text || '-' },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => {
        const c = statusConfig[status] || { color: 'default', label: status };
        return <Tag color={c.color}>{c.label}</Tag>;
      },
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      key: 'updatedAt',
      width: 160,
      render: (text: string) => (
        <span style={{ color: '#64748B', fontSize: 13 }}>
          {new Date(text).toLocaleString('zh-CN')}
        </span>
      ),
    },
    {
      title: '',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="text"
            size="small"
            icon={record.isFavorite ? <StarFilled style={{ color: '#F59E0B' }} /> : <StarOutlined style={{ color: '#CBD5E1' }} />}
            onClick={() => favoriteMutation.mutate(record.id)}
          />
          <Popconfirm
            title="确定删除该方案？"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button type="text" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  if (!isLoggedIn) {
    return (
      <MainLayout>
        <Card className="text-center" styles={{ body: { padding: '64px 24px' } }}>
          <Empty description={<span style={{ color: '#64748B' }}>请先登录后查看志愿方案</span>} />
          <Link href="/login">
            <Button type="primary" className="mt-4" style={{ height: 40 }}>去登录</Button>
          </Link>
        </Card>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1" style={{ color: '#0F172A' }}>我的志愿方案</h2>
        <p className="text-sm" style={{ color: '#64748B' }}>管理和查看您的志愿填报方案</p>
      </div>

      <Card
        extra={
          <Space>
            <Link href="/recommend">
              <Button type="primary" icon={<PlusOutlined />}>智能生成</Button>
            </Link>
            <Button onClick={() => setCreateModalOpen(true)}>手动创建</Button>
          </Space>
        }
        styles={{ body: { padding: 0 } }}
      >
        <Table
          columns={columns}
          dataSource={plans}
          rowKey="id"
          loading={isLoading}
          pagination={{ pageSize: 10, style: { padding: '12px 24px' } }}
          locale={{
            emptyText: (
              <Empty
                className="py-8"
                description={<span style={{ color: '#94A3B8' }}>暂无方案，去智能推荐页面生成一个吧</span>}
              />
            ),
          }}
        />
      </Card>

      <Modal
        title={<span className="font-semibold">创建志愿方案</span>}
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createMutation.isPending}
        okText="创建"
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(values) => {
            createMutation.mutate({ ...values, items: [] });
          }}
          initialValues={{ year: 2025, province: '四川' }}
          className="mt-4"
        >
          <Form.Item name="name" label="方案名称" rules={[{ required: true }]}>
            <Input placeholder="例如：第一志愿方案" />
          </Form.Item>
          <Form.Item name="year" label="年份" rules={[{ required: true }]}>
            <InputNumber min={2020} max={2030} className="w-full" />
          </Form.Item>
          <Form.Item name="province" label="省份">
            <Select>
              {PROVINCES.map((p) => (
                <Option key={p.code} value={p.name}>{p.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={3} placeholder="方案备注（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </MainLayout>
  );
}
