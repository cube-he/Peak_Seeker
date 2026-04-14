'use client';

import { useState } from 'react';
import {
  Table,
  Tabs,
  Input,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Select,
  message,
  Popconfirm,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin-api';
import type { ColumnsType } from 'antd/es/table';

interface User {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  role: string;
  status: string;
  createdAt: string;
}

const ROLE_COLORS: Record<string, string> = {
  ADMIN: 'red',
  TEACHER: 'blue',
  STUDENT: 'green',
};

const ROLE_LABELS: Record<string, string> = {
  ADMIN: '管理员',
  TEACHER: '教师',
  STUDENT: '学生',
};

export default function AdminUsersPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('TEACHER');
  const [search, setSearch] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', activeTab, search],
    queryFn: () => adminApi.getUsers({ role: activeTab, search }),
  });

  const users: User[] = data?.data || [];

  const createMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.createUser(values),
    onSuccess: () => {
      message.success('用户创建成功');
      setCreateModalOpen(false);
      createForm.resetFields();
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: () => message.error('创建失败'),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => adminApi.deleteUser(userId),
    onSuccess: () => {
      message.success('已删除');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
  });

  const columns: ColumnsType<User> = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
    },
    {
      title: '姓名',
      dataIndex: 'realName',
      key: 'realName',
      render: (name: string) => name || '-',
    },
    {
      title: '手机',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) => phone || '-',
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      width: 100,
      render: (role: string) => (
        <Tag color={ROLE_COLORS[role] || 'default'}>
          {ROLE_LABELS[role] || role}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 80,
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>
          {status === 'ACTIVE' ? '正常' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />}>
            编辑
          </Button>
          <Button type="text" size="small" icon={<KeyOutlined />}>
            权限
          </Button>
          <Popconfirm
            title="确定删除此用户？"
            onConfirm={() => deleteMutation.mutate(record.id)}
          >
            <Button type="text" size="small" icon={<DeleteOutlined />} danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-xl font-semibold text-text">用户管理</h1>
          <p className="text-sm text-text-muted mt-1">管理系统中的教师和学生账户</p>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => setCreateModalOpen(true)}
        >
          创建用户
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'TEACHER', label: '教师' },
          { key: 'STUDENT', label: '学生' },
        ]}
      />

      {/* Search */}
      <Input
        placeholder="搜索用户名或姓名"
        prefix={<SearchOutlined className="text-text-muted" />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-[300px]"
        allowClear
      />

      {/* Table */}
      <Table
        columns={columns}
        dataSource={users}
        loading={isLoading}
        rowKey="id"
        pagination={{ pageSize: 20, showTotal: (t) => `共 ${t} 名用户` }}
        scroll={{ x: 700 }}
      />

      {/* Create User Modal */}
      <Modal
        title="创建用户"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createMutation.isPending}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => createMutation.mutate(values)}
          initialValues={{ role: activeTab }}
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true }]}>
            <Input placeholder="登录用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true }]}>
            <Input.Password placeholder="初始密码" />
          </Form.Item>
          <Form.Item name="realName" label="姓名">
            <Input placeholder="真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '教师', value: 'TEACHER' },
                { label: '学生', value: 'STUDENT' },
                { label: '管理员', value: 'ADMIN' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
