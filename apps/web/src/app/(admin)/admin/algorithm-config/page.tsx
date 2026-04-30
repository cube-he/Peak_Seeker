'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, Form, InputNumber, Button, message, Space, Typography } from 'antd';
import { algorithmConfigApi, type RushSafeStableThresholds } from '@/services/algorithm-config';

const { Title, Paragraph } = Typography;

export default function AlgorithmConfigPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['algorithm-config', 'rush-safe-stable'],
    queryFn: () => algorithmConfigApi.getRushSafeStableThresholds(),
  });

  const [form] = Form.useForm();
  const [preview, setPreview] = useState<RushSafeStableThresholds | null>(null);

  useEffect(() => {
    if (data) {
      form.setFieldsValue({
        rushMin: data.rush.min,
        rushMax: data.rush.max,
        safeMax: data.safe.max,
        stableMax: data.stable.max,
      });
      setPreview(data);
    }
  }, [data, form]);

  const mutation = useMutation({
    mutationFn: (v: RushSafeStableThresholds) => algorithmConfigApi.setRushSafeStableThresholds(v),
    onSuccess: () => {
      message.success('保存成功');
      qc.invalidateQueries({ queryKey: ['algorithm-config'] });
    },
    onError: (e: any) => {
      message.error(e?.response?.data?.message ?? '保存失败');
    },
  });

  const onValuesChange = (_: any, all: any) => {
    const v: RushSafeStableThresholds = {
      rush:   { min: all.rushMin,  max: all.rushMax  },
      safe:   { min: all.rushMax,  max: all.safeMax  }, // safe.min = rush.max
      stable: { min: all.safeMax,  max: all.stableMax }, // stable.min = safe.max
    };
    setPreview(v);
  };

  const onFinish = () => {
    if (!preview) return;
    mutation.mutate(preview);
  };

  if (isLoading) return <Card loading />;

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <Title level={3}>冲稳保阈值配置</Title>
      <Paragraph type="secondary">
        ratio = 院校历史最低位次 / 学生位次。低于 rush.min 或高于 stable.max 的院校不显示徽标。
        约束：safe.min 自动等于 rush.max；stable.min 自动等于 safe.max（区间连续）。
      </Paragraph>

      <Card>
        <Form
          form={form}
          layout="vertical"
          onValuesChange={onValuesChange}
          onFinish={onFinish}
        >
          <Form.Item
            label="rush.min（冲的下限）"
            name="rushMin"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            label="rush.max（冲↔稳分界）"
            name="rushMax"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            label="safe.max（稳↔保分界）"
            name="safeMax"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>
          <Form.Item
            label="stable.max（保的上限）"
            name="stableMax"
            rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
          >
            <InputNumber step={0.01} style={{ width: 160 }} />
          </Form.Item>

          {preview && (
            <Card size="small" title="预览" style={{ marginBottom: 16, background: '#fafafa' }}>
              <Space direction="vertical" size={4}>
                <span>冲（橙）：[{preview.rush.min.toFixed(2)}, {preview.rush.max.toFixed(2)})</span>
                <span>稳（绿）：[{preview.safe.min.toFixed(2)}, {preview.safe.max.toFixed(2)}]</span>
                <span>保（蓝）：({preview.stable.min.toFixed(2)}, {preview.stable.max.toFixed(2)}]</span>
              </Space>
            </Card>
          )}

          <Button type="primary" htmlType="submit" loading={mutation.isPending}>
            保存
          </Button>
        </Form>
      </Card>
    </div>
  );
}
