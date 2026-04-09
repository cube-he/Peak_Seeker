'use client';

import { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Space,
  message,
  Popconfirm,
  Tag,
  Result,
  Spin,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ArrowLeftOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useAuthStore } from '@/stores/authStore';
import {
  getAiConfigs,
  createAiConfig,
  updateAiConfig,
  deleteAiConfig,
  type AiConfig,
} from '@/services/dataImport';

// 预设的 AI 提供商
const AI_PROVIDERS = [
  { value: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-chat' },
  { value: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', defaultModel: 'gpt-4o-mini' },
  { value: 'moonshot', label: 'Moonshot (Kimi)', baseUrl: 'https://api.moonshot.cn/v1', defaultModel: 'moonshot-v1-8k' },
  { value: 'aliyun', label: '阿里云百炼', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', defaultModel: 'qwen-vl-plus' },
  { value: 'custom', label: '自定义', baseUrl: '', defaultModel: '' },
];

export default function AiConfigPage() {
  const { user, isLoggedIn } = useAuthStore();
  const [loading, setLoading] = useState(false);
  const [configs, setConfigs] = useState<AiConfig[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AiConfig | null>(null);
  const [form] = Form.useForm();

  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';

  // 加载配置列表
  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await getAiConfigs();
      setConfigs(data.configs || []);
    } catch (e: any) {
      message.error(e?.message || '加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadConfigs();
    }
  }, [isAdmin]);

  // 权限检查
  if (!isLoggedIn || !isAdmin) {
    return (
      <div className="min-h-screen bg-bg">
        <div className="mx-auto max-w-[800px] px-6 pt-20">
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
      </div>
    );
  }

  // 打开新建/编辑弹窗
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

  // 提供商变更时自动填充 URL 和模型
  const handleProviderChange = (provider: string) => {
    const preset = AI_PROVIDERS.find(p => p.value === provider);
    if (preset) {
      form.setFieldsValue({
        apiBaseUrl: preset.baseUrl,
        modelName: preset.defaultModel,
      });
    }
  };

  // 保存配置
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);

      if (editingConfig) {
        // 更新
        await updateAiConfig(editingConfig.id, {
          name: values.name,
          apiKey: values.apiKey || undefined,
          apiBaseUrl: values.apiBaseUrl,
          modelName: values.modelName,
          isDefault: values.isDefault,
        });
        message.success('配置已更新');
      } else {
        // 新建
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
    } catch (e: any) {
      if (e?.errorFields) return; // 表单验证错误
      message.error(e?.message || '保存失败');
    } finally {
      setLoading(false);
    }
  };

  // 删除配置
  const handleDelete = async (id: string) => {
    try {
      setLoading(true);
      await deleteAiConfig(id);
      message.success('配置已删除');
      loadConfigs();
    } catch (e: any) {
      message.error(e?.message || '删除失败');
    } finally {
      setLoading(false);
    }
  };

  // 设为默认
  const handleSetDefault = async (config: AiConfig) => {
    try {
      setLoading(true);
      await updateAiConfig(config.id, { isDefault: true });
      message.success(`已将 "${config.name}" 设为默认配置`);
      loadConfigs();
    } catch (e: any) {
      message.error(e?.message || '设置失败');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: AiConfig) => (
        <Space>
          <RobotOutlined className="text-primary" />
          <span className="font-serif text-base font-semibold text-text">{name}</span>
          {record.isDefault && (
            <Tag className="!bg-primary-fixed !text-primary">默认</Tag>
          )}
          {!record.isActive && (
            <Tag className="!bg-rush-fixed !text-rush">已禁用</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: string) => {
        const preset = AI_PROVIDERS.find(p => p.value === provider);
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
      render: (model: string) => <span className="text-text-secondary">{model}</span>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: AiConfig) => (
        <Space size="small">
          {!record.isDefault && (
            <Button
              type="link"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => handleSetDefault(record)}
              className="!text-safe hover:!text-safe/80"
            >
              设为默认
            </Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
            className="!text-primary hover:!text-primary-light"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除此配置？"
            onConfirm={() => handleDelete(record.id)}
            okText="删除"
            cancelText="取消"
          >
            <Button type="link" size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-bg">
      <div className="mx-auto w-full max-w-[1000px] px-6 py-6">
        {/* Back link */}
        <div className="mb-6">
          <Link href="/data-import">
            <Button type="text" icon={<ArrowLeftOutlined />} className="!text-text-tertiary hover:!text-text-secondary">
              返回数据导入
            </Button>
          </Link>
        </div>

        {/* Page header */}
        <div className="mb-6">
          <h1 className="font-serif text-[28px] font-semibold text-text flex items-center gap-3 mb-2">
            <KeyOutlined className="text-primary" /> AI 配置管理
          </h1>
          <p className="text-text-tertiary text-sm">
            管理用于 OCR 校验的 AI 服务配置，API Key 将加密存储
          </p>
        </div>

        {/* Security notice */}
        <div className="mb-4 rounded-lg bg-primary-fixed border border-primary/10 px-4 py-3">
          <div className="flex items-start gap-3">
            <KeyOutlined className="text-primary mt-0.5" />
            <div>
              <p className="text-sm font-medium text-text mb-1">安全提示</p>
              <p className="text-xs text-text-tertiary">
                API Key 使用 AES-256-GCM 加密存储，仅在调用 AI 服务时解密使用。请确保服务器环境变量 ENCRYPTION_KEY 已正确配置。
              </p>
            </div>
          </div>
        </div>

        {/* Config list card */}
        <div className="bg-surface rounded-lg shadow-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-base font-semibold text-text">AI 配置列表</h2>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenModal()}
            >
              添加配置
            </Button>
          </div>

          <Spin spinning={loading}>
            <Table
              dataSource={configs}
              columns={columns}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: '暂无配置，点击上方按钮添加' }}
            />
          </Spin>
        </div>

        {/* 新建/编辑弹窗 */}
        <Modal
          title={
            <span className="font-serif font-semibold">
              {editingConfig ? '编辑 AI 配置' : '添加 AI 配置'}
            </span>
          }
          open={modalVisible}
          onOk={handleSave}
          onCancel={() => setModalVisible(false)}
          confirmLoading={loading}
          width={500}
          okText="保存"
          cancelText="取消"
        >
          <Form form={form} layout="vertical">
            <Form.Item
              name="name"
              label="配置名称"
              rules={[{ required: true, message: '请输入配置名称' }]}
            >
              <Input placeholder="例如：DeepSeek 主账号" />
            </Form.Item>

            <Form.Item
              name="provider"
              label="AI 提供商"
              rules={[{ required: true, message: '请选择提供商' }]}
            >
              <Select
                options={AI_PROVIDERS}
                onChange={handleProviderChange}
                disabled={!!editingConfig}
              />
            </Form.Item>

            <Form.Item
              name="apiKey"
              label={editingConfig ? 'API Key（留空则不修改）' : 'API Key'}
              rules={editingConfig ? [] : [{ required: true, message: '请输入 API Key' }]}
            >
              <Input.Password placeholder="sk-xxx..." />
            </Form.Item>

            <Form.Item
              name="apiBaseUrl"
              label="API Base URL"
              rules={[{ required: true, message: '请输入 API 地址' }]}
            >
              <Input placeholder="https://api.deepseek.com/v1" />
            </Form.Item>

            <Form.Item
              name="modelName"
              label="默认模型"
              rules={[{ required: true, message: '请输入模型名称' }]}
            >
              <Input placeholder="deepseek-chat" />
            </Form.Item>

            <Form.Item
              name="isDefault"
              label="设为默认"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
}
