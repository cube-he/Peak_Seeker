'use client';

import { useState, useEffect } from 'react';
import {
  Layout,
  Card,
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
  Typography,
  Result,
  Spin,
  Alert,
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

const { Content } = Layout;
const { Title, Text } = Typography;

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
      <Layout style={{ minHeight: '100vh', background: '#F8FAFC' }}>
        <Content style={{ padding: 24, maxWidth: 800, margin: '80px auto' }}>
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
        </Content>
      </Layout>
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
          <RobotOutlined />
          <span>{name}</span>
          {record.isDefault && <Tag color="blue">默认</Tag>}
          {!record.isActive && <Tag color="red">已禁用</Tag>}
        </Space>
      ),
    },
    {
      title: '提供商',
      dataIndex: 'provider',
      key: 'provider',
      render: (provider: string) => {
        const preset = AI_PROVIDERS.find(p => p.value === provider);
        return preset?.label || provider;
      },
    },
    {
      title: 'API 地址',
      dataIndex: 'apiBaseUrl',
      key: 'apiBaseUrl',
      ellipsis: true,
    },
    {
      title: '模型',
      dataIndex: 'modelName',
      key: 'modelName',
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
            >
              设为默认
            </Button>
          )}
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
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
    <Layout style={{ minHeight: '100vh', background: '#F8FAFC' }}>
      <Content style={{ padding: 24, maxWidth: 1000, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/data-import">
            <Button type="text" icon={<ArrowLeftOutlined />}>
              返回数据导入
            </Button>
          </Link>
        </div>

        <Title level={3} style={{ marginBottom: 8 }}>
          <KeyOutlined /> AI 配置管理
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 24 }}>
          管理用于 OCR 校验的 AI 服务配置，API Key 将加密存储
        </Text>

        <Alert
          message="安全提示"
          description="API Key 使用 AES-256-GCM 加密存储，仅在调用 AI 服务时解密使用。请确保服务器环境变量 ENCRYPTION_KEY 已正确配置。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Card
          title="AI 配置列表"
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => handleOpenModal()}
            >
              添加配置
            </Button>
          }
        >
          <Spin spinning={loading}>
            <Table
              dataSource={configs}
              columns={columns}
              rowKey="id"
              pagination={false}
              locale={{ emptyText: '暂无配置，点击上方按钮添加' }}
            />
          </Spin>
        </Card>

        {/* 新建/编辑弹窗 */}
        <Modal
          title={editingConfig ? '编辑 AI 配置' : '添加 AI 配置'}
          open={modalVisible}
          onOk={handleSave}
          onCancel={() => setModalVisible(false)}
          confirmLoading={loading}
          width={500}
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
              rules={[{ required: true, message: '请输入 API ���址' }]}
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
      </Content>
    </Layout>
  );
}
