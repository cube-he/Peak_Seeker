'use client';

import { Alert, Button, Card, Form, Input, InputNumber, message, Select, Spin, Switch } from 'antd';
import {
  LockOutlined,
  SaveOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/services/admin-api';

export default function AdminConfigPage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const { data: configData, isLoading } = useQuery({
    queryKey: ['admin-config'],
    queryFn: () => adminApi.getConfig(),
  });

  const config = configData?.data;

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) => adminApi.updateConfig(values),
    onSuccess: () => {
      message.success('配置已保存');
      queryClient.invalidateQueries({ queryKey: ['admin-config'] });
    },
    onError: () => message.error('保存失败'),
  });

  const onSave = () => {
    form.validateFields().then((values) => {
      saveMutation.mutate(values);
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <header>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">System Settings</p>
        <h1 className="font-serif text-3xl font-semibold text-text">系统配置</h1>
        <p className="mt-2 text-sm text-text-muted">管理招生年份、默认方案比例和冻结模式等全局设置。</p>
      </header>

      <Form form={form} layout="vertical" initialValues={config || {}} requiredMark="optional">
        <Card
          title={
            <span className="flex items-center gap-2">
              <SettingOutlined /> 批次配置
            </span>
          }
          className="mb-4 rounded-2xl shadow-card"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Form.Item name="currentYear" label="当前招生年份">
              <Select
                options={[
                  { label: '2026', value: 2026 },
                  { label: '2025', value: 2025 },
                ]}
              />
            </Form.Item>
            <Form.Item name="province" label="服务省份">
              <Input disabled defaultValue="四川" />
            </Form.Item>
            <Form.Item name="maxVolunteers" label="最大志愿数">
              <InputNumber min={1} max={96} style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <ThunderboltOutlined /> 算法参数
            </span>
          }
          className="mb-4 rounded-2xl shadow-card"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Form.Item name="defaultRushRatio" label="默认冲比例 (%)">
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="defaultStableRatio" label="默认稳比例 (%)">
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="defaultSafeRatio" label="默认保比例 (%)">
              <InputNumber min={0} max={100} style={{ width: '100%' }} />
            </Form.Item>
          </div>
          <Form.Item name="rankFluctuationYears" label="波动分析年份">
            <InputNumber min={1} max={10} style={{ width: 220 }} />
          </Form.Item>
        </Card>

        <Card
          title={
            <span className="flex items-center gap-2">
              <LockOutlined /> 冻结模式
            </span>
          }
          className="mb-4 rounded-2xl shadow-card"
        >
          <Alert
            type="warning"
            message="冻结模式会禁用所有方案编辑功能"
            description="开启后，教师和学生将无法编辑或生成新方案，仅限查看已定稿方案。通常在正式填报前开启。"
            showIcon
            icon={<WarningOutlined />}
            className="mb-4"
          />
          <Form.Item name="freezeMode" valuePropName="checked" label="启用冻结模式">
            <Switch checkedChildren="已冻结" unCheckedChildren="正常" />
          </Form.Item>
        </Card>

        <div className="flex justify-end">
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={onSave}
            loading={saveMutation.isPending}
            size="large"
            className="border-0"
          >
            保存配置
          </Button>
        </div>
      </Form>
    </div>
  );
}
