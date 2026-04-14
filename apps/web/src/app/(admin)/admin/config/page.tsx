'use client';

import {
  Card,
  Form,
  Input,
  InputNumber,
  Switch,
  Button,
  Select,
  Alert,
  message,
  Spin,
} from 'antd';
import {
  SaveOutlined,
  WarningOutlined,
  SettingOutlined,
  ThunderboltOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
    <div className="max-w-[800px] mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-xl font-semibold text-text">系统配置</h1>
        <p className="text-sm text-text-muted mt-1">管理系统全局设置</p>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={config || {}}
        requiredMark="optional"
      >
        {/* Batch Config */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <SettingOutlined /> 批次配置
            </span>
          }
          className="mb-4"
        >
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
          <Form.Item name="maxVolunteers" label="最大志愿数（本科一批）">
            <InputNumber min={1} max={96} className="w-full" />
          </Form.Item>
        </Card>

        {/* Algorithm Params */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <ThunderboltOutlined /> 算法参数
            </span>
          }
          className="mb-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Form.Item name="defaultRushRatio" label="默认冲比例 (%)">
              <InputNumber min={0} max={100} className="w-full" />
            </Form.Item>
            <Form.Item name="defaultStableRatio" label="默认稳比例 (%)">
              <InputNumber min={0} max={100} className="w-full" />
            </Form.Item>
            <Form.Item name="defaultSafeRatio" label="默认保比例 (%)">
              <InputNumber min={0} max={100} className="w-full" />
            </Form.Item>
          </div>
          <Form.Item name="rankFluctuationYears" label="波动分析年数">
            <InputNumber min={1} max={10} className="w-full sm:w-[200px]" />
          </Form.Item>
        </Card>

        {/* Freeze Mode */}
        <Card
          title={
            <span className="flex items-center gap-2">
              <LockOutlined /> 冻结模式
            </span>
          }
          className="mb-4"
        >
          <Alert
            type="warning"
            message="冻结模式会禁用所有方案编辑功能"
            description="开启后，教师和学生将无法编辑或生成新方案。仅限查看已定版方案。通常在正式填报前开启。"
            showIcon
            icon={<WarningOutlined />}
            className="mb-4"
          />
          <Form.Item name="freezeMode" valuePropName="checked" label="启用冻结模式">
            <Switch checkedChildren="已冻结" unCheckedChildren="正常" />
          </Form.Item>
        </Card>

        {/* Save */}
        <div className="flex justify-end">
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={onSave}
            loading={saveMutation.isPending}
            size="large"
          >
            保存配置
          </Button>
        </div>
      </Form>
    </div>
  );
}
