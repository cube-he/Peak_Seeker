'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Result,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tag,
} from 'antd';
import {
  CheckCircleOutlined,
  DeleteOutlined,
  EditOutlined,
  KeyOutlined,
  PlusOutlined,
  RobotOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useAuthStore } from '@/stores/authStore';
import {
  createAiConfig,
  deleteAiConfig,
  getAiConfigs,
  type AiConfig,
  updateAiConfig,
} from '@/services/dataImport';

const AI_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { value: 'moonshot', label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
  { value: 'aliyun', label: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-vl-plus' },
  { value: 'custom', label: '自定义', baseUrl: '', defaultModel: '' },
];

export default function AiConfigManager() {
  const { user, isLoggedIn } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AiConfig | null>(null);
  const [form] = Form.useForm();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await getAiConfigs();
      setConfigs(data.configs || []);
    } catch (error: any) {
      message.error(error?.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadConfigs();
    }
  }, [isAdmin]);

  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="mx-auto max-w-[800px] px-4 pt-12">
        <Result
          status="403"
          title="无权限访问"
          subTitle="此页面仅限管理员使用"
          extra={
            <Link href="/">
              <Button type="primary">返回首页</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const handleOpenModal = (config?: AiConfig) => {
    setEditingConfig(config || null);
    if (config) {
      form.setFieldsValue({
        name: config.name,
        provider: config.provider,
        apiBaseUrl: config.apiBaseUrl,
        modelName: config.modelName,
        isDefault: config.isDefault,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({
        provider: 'deepseek',
        apiBaseUrl: 'https://api.deepseek.com/v1',
        modelName: 'deepseek-chat',
        isDefault: configs.length === 0,
      });
    }
    setModalVisible(true);
  };

  const handleProviderChange = (provider: string) => {
    const preset = AI_PROVIDERS.find((item) => item.value === provider);
    if (preset) {
      form.setFieldsValue({
        apiBaseUrl: preset.baseUrl,
        modelName: preset.defaultModel,
      });
    }
  };

  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (editingConfig) {
        await updateAiConfig(editingConfig.id, {
          name: values.name,
          apiKey: values.apiKey || undefined,
          apiBaseUrl: values.apiBaseUrl,
          modelName: values.modelName,
          isDefault: values.isDefault,
        });
        message.success('配置已更新');
      } else {
        await createAiConfig({
          name: values.name,
          provider: values.provider,
          apiKey: values.apiKey,
          apiBaseUrl: values.apiBaseUrl,
          modelName: values.modelName,
          isDefault: values.isDefault,
        });
        message.success('配置已创建');
      }

      setModalVisible(false);
      loadConfigs();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(error?.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      await deleteAiConfig(id);
      message.success('配置已删除');
      loadConfigs();
    } catch (error: any) {
      message.error(error?.message || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (config: AiConfig) => {
    try {
      setLoading(true);
      await updateAiConfig(config.id, { isDefault: true });
      message.success(`已将 "${config.name}" 设为默认配置`);
      loadConfigs();
    } catch (error: any) {
      message.error(error?.message || '设置失败');
    } finally {
      setLoading(false);
    }
  };

  const columns: ColumnsType<AiConfig> = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record) => (
        <Space>
          <RobotOutlined className="text-primary" />
          <span className="font-serif text-base font-semibold text-text">{name}</span>
          {record.isDefault ? <Tag className="!bg-primary-fixed !text-primary">默认</Tag> : null}
          {!record.isActive ? <Tag className="!bg-rush-fixed !text-rush">已禁用</Tag> : null}
        </Space>
      ),
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      width: 140,
      render: (provider: string) => {
        const preset = AI_PROVIDERS.find((item) => item.value === provider);
        return <span className="text-text-secondary">{preset?.label || provider}</span>;
      },
    },
    {
      title: 'API 地址',
      dataIndex: 'apiBaseUrl',
      key: 'apiBaseUrl',
      ellipsis: true,
      render: (url: string) => <span className="text-text-tertiary">{url}</span>,
    },
    {
      title: '模型',
      dataIndex: 'modelName',
      key: 'modelName',
      width: 180,
      render: (model: string) => <span className="text-text-secondary">{model}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 250,
      render: (_, record) => (
        <Space size="small">
          {!record.isDefault ? (
            <Button type="link" size="small" icon={<CheckCircleOutlined />} onClick={() => handleSetDefault(record)}>
              设为默认
            </Button>
          ) : null}
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleOpenModal(record)}>
            编辑
          </Button>
          <Popconfirm title="确定删除此配置？" onConfirm={() => handleDelete(record.id)} okText="删除" cancelText="取消">
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1100px] space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">AI Gateway</p>
          <h1 className="flex items-center gap-3 font-serif text-3xl font-semibold text-text">
            <KeyOutlined className="text-primary" /> AI 配置管理
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            管理用于 OCR 校验和推荐流程的 AI 服务配置，API Key 将由后端加密存储。
          </p>
        </div>
        <Button type="primary" icon={<PlusOutlined />} className="w-fit border-0" onClick={() => handleOpenModal()}>
          添加配置
        </Button>
      </header>

      <section className="rounded-2xl bg-[#0f1419] px-5 py-4 text-white shadow-card">
        <div className="flex items-start gap-3">
          <KeyOutlined className="mt-1 text-accent-light" />
          <div>
            <p className="font-medium">安全提示</p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              API Key 仅在调用 AI 服务时使用。请确认服务端环境变量 ENCRYPTION_KEY 已正确配置。
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-2xl bg-surface p-4 shadow-card sm:p-5">
        <Spin spinning={loading}>
          <Table
            dataSource={configs}
            columns={columns}
            rowKey="id"
            pagination={false}
            scroll={{ x: 900 }}
            locale={{ emptyText: '暂无配置，点击右上角添加' }}
          />
        </Spin>
      </div>

      <Modal
        title={<span className="font-serif font-semibold">{editingConfig ? '编辑 AI 配置' : '添加 AI 配置'}</span>}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        confirmLoading={loading}
        width={520}
        okText="保存"
        cancelText="取消"
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="配置名称" rules={[{ required: true, message: '请输入配置名称' }]}>
            <Input placeholder="例如 DeepSeek 主账号" />
          </Form.Item>
          <Form.Item name="provider" label="AI 提供商" rules={[{ required: true, message: '请选择提供商' }]}>
            <Select options={AI_PROVIDERS} onChange={handleProviderChange} disabled={!!editingConfig} />
          </Form.Item>
          <Form.Item
            name="apiKey"
            label={editingConfig ? 'API Key（留空则不修改）' : 'API Key'}
            rules={editingConfig ? [] : [{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="sk-xxx..." />
          </Form.Item>
          <Form.Item name="apiBaseUrl" label="API Base URL" rules={[{ required: true, message: '请输入 API 地址' }]}>
            <Input placeholder="https://api.deepseek.com/v1" />
          </Form.Item>
          <Form.Item name="modelName" label="默认模型" rules={[{ required: true, message: '请输入模型名称' }]}>
            <Input placeholder="deepseek-chat" />
          </Form.Item>
          <Form.Item name="isDefault" label="设为默认" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
