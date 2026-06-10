'use client';

import { useMemo, useState } from 'react';
import {
  Avatar,
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import {
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnsType } from 'antd/es/table';
import { adminApi } from '@/services/admin-api';

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
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editForm] = Form.useForm();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', activeTab, search],
    queryFn: () => adminApi.getUsers({ role: activeTab, search }),
  });

  const users: User[] = data?.data || [];

  const counts = useMemo(
    () => ({
      total: users.length,
      active: users.filter((user) => user.status === 'ACTIVE').length,
      disabled: users.filter((user) => user.status !== 'ACTIVE').length,
    }),
    [users],
  );

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

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: number; values: Record<string, unknown> }) =>
      adminApi.updateUser(id, values),
    onSuccess: () => {
      message.success('已更新');
      setEditModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err: any) => message.error(err?.response?.data?.message || '更新失败'),
  });

  const resetPwMutation = useMutation({
    mutationFn: (id: number) => adminApi.resetPassword(id),
    onSuccess: () => message.success('密码已重置为 123456'),
    onError: () => message.error('重置失败'),
  });

  const openEdit = (record: User) => {
    setEditingUser(record);
    editForm.setFieldsValue({
      username: record.username,
      realName: record.realName,
      phone: record.phone,
    });
    setEditModalOpen(true);
  };

  const columns: ColumnsType<User> = [
    {
      title: '用户',
      key: 'user',
      render: (_, record) => {
        const name = record.realName || record.username;
        return (
          <div className="flex items-center gap-3">
            <Avatar size="small" icon={<UserOutlined />} className="bg-primary">
              {name.charAt(0)}
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-text">{name}</div>
              <div className="text-xs text-text-muted">{record.username}</div>
            </div>
          </div>
        );
      },
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
      render: (role: string) => <Tag color={ROLE_COLORS[role] || 'default'}>{ROLE_LABELS[role] || role}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 90,
      render: (status: string) => (
        <Tag color={status === 'ACTIVE' ? 'green' : 'default'}>
          {status === 'ACTIVE' ? '正常' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 130,
      render: (value: string) =>
        value
          ? new Date(value).toLocaleDateString('zh-CN', {
              month: 'short',
              day: 'numeric',
            })
          : '-',
    },
    {
      title: '操作',
      key: 'actions',
      width: 240,
      render: (_, record) => (
        <Space size="small">
          <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>
            编辑
          </Button>
          <Popconfirm
            title="重置密码为 123456？"
            onConfirm={() => resetPwMutation.mutate(record.id)}
          >
            <Button type="text" size="small" icon={<KeyOutlined />}>
              重置密码
            </Button>
          </Popconfirm>
          <Popconfirm title="确定删除此用户？" onConfirm={() => deleteMutation.mutate(record.id)}>
            <Button type="text" size="small" icon={<DeleteOutlined />} danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">User Directory</p>
          <h1 className="font-serif text-3xl font-semibold text-text">用户管理</h1>
          <p className="mt-2 text-sm text-text-muted">
            管理系统中的教师、学生和管理员账号。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} className="w-fit border-0" onClick={() => setCreateModalOpen(true)}>
          创建用户
        </Button>
      </header>

      <div className="grid grid-cols-3 gap-4">
        {[
          ['当前列表', counts.total],
          ['正常账号', counts.active],
          ['禁用账号', counts.disabled],
        ].map(([label, value]) => (
          <div key={label as string} className="rounded-2xl bg-surface px-5 py-4 shadow-card">
            <p className="text-[11px] font-medium uppercase tracking-[1.4px] text-text-muted">{label}</p>
            <p className="mt-2 font-serif text-2xl font-semibold text-text">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl bg-surface px-4 py-4 shadow-card">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            className="min-w-[260px]"
            items={[
              { key: 'TEACHER', label: '教师' },
              { key: 'STUDENT', label: '学生' },
              { key: 'ADMIN', label: '管理员' },
            ]}
          />
          <Input
            placeholder="搜索用户名、姓名或手机号"
            prefix={<SearchOutlined className="text-text-muted" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="xl:ml-auto xl:w-[320px]"
            allowClear
          />
        </div>
      </section>

      <Table
        columns={columns}
        dataSource={users}
        loading={isLoading}
        rowKey="id"
        pagination={{ pageSize: 20, showTotal: (total) => `共 ${total} 名用户` }}
        scroll={{ x: 850 }}
        className="rounded-2xl bg-surface shadow-card"
      />

      <div className="rounded-2xl border border-dashed border-border bg-surface px-5 py-4 text-sm text-text-muted">
        支持创建、编辑（用户名/姓名/手机）、重置密码（默认 123456）、删除与筛选；细粒度权限分配待接入。
      </div>

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
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="登录用户名" />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入初始密码' }]}>
            <Input.Password placeholder="初始密码" />
          </Form.Item>
          <Form.Item name="realName" label="姓名">
            <Input placeholder="真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号" />
          </Form.Item>
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
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

      <Modal
        title="编辑用户"
        open={editModalOpen}
        onCancel={() => setEditModalOpen(false)}
        onOk={() => editForm.submit()}
        confirmLoading={updateMutation.isPending}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={(values) =>
            editingUser && updateMutation.mutate({ id: editingUser.id, values })
          }
        >
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="登录用户名" />
          </Form.Item>
          <Form.Item name="realName" label="姓名">
            <Input placeholder="真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
