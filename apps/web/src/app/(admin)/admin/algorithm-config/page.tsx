'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Form, InputNumber, message, Spin } from 'antd';
import { SaveOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { algorithmConfigApi, type RushSafeStableThresholds } from '@/services/algorithm-config';

export default function AlgorithmConfigPage() {
  const queryClient = useQueryClient();
  const [form] = Form.useForm();
  const [preview, setPreview] = useState<RushSafeStableThresholds | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['algorithm-config', 'rush-safe-stable'],
    queryFn: () => algorithmConfigApi.getRushSafeStableThresholds(),
  });

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
    mutationFn: (value: RushSafeStableThresholds) => algorithmConfigApi.setRushSafeStableThresholds(value),
    onSuccess: () => {
      message.success('保存成功');
      queryClient.invalidateQueries({ queryKey: ['algorithm-config'] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message ?? '保存失败');
    },
  });

  const onValuesChange = (_: unknown, all: any) => {
    const value: RushSafeStableThresholds = {
      rush: { min: all.rushMin, max: all.rushMax },
      safe: { min: all.rushMax, max: all.safeMax },
      stable: { min: all.safeMax, max: all.stableMax },
    };
    setPreview(value);
  };

  const onFinish = () => {
    if (!preview) return;
    mutation.mutate(preview);
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
        <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">Algorithm Rules</p>
        <h1 className="font-serif text-3xl font-semibold text-text">冲稳保阈值配置</h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">
          ratio = 院校历史最低位次 / 学生位次。区间连续：稳档下限自动等于冲档上限，保档下限自动等于稳档上限。
        </p>
      </header>

      <section className="rounded-2xl bg-[#0f1419] px-6 py-5 text-white shadow-card">
        <div className="flex items-center gap-4">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 text-xl text-accent-light">
            <ThunderboltOutlined />
          </span>
          <div>
            <p className="font-serif text-lg font-semibold">推荐分档规则</p>
            <p className="mt-1 text-sm text-slate-400">
              调整后会影响院校推荐结果中的冲、稳、保标签。
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Card className="rounded-2xl shadow-card">
          <Form form={form} layout="vertical" onValuesChange={onValuesChange} onFinish={onFinish}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Form.Item
                label="冲档下限 rush.min"
                name="rushMin"
                rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
              >
                <InputNumber step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="冲/稳分界 rush.max"
                name="rushMax"
                rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
              >
                <InputNumber step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="稳/保分界 safe.max"
                name="safeMax"
                rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
              >
                <InputNumber step={0.01} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item
                label="保档上限 stable.max"
                name="stableMax"
                rules={[{ required: true }, { type: 'number', min: 0, max: 5 }]}
              >
                <InputNumber step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            </div>

            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={mutation.isPending} className="border-0">
              保存阈值
            </Button>
          </Form>
        </Card>

        <Card title="实时预览" className="rounded-2xl shadow-card">
          {preview ? (
            <div className="space-y-3">
              {[
                ['冲', preview.rush.min, preview.rush.max, 'bg-[#fee2e2] text-rush'],
                ['稳', preview.safe.min, preview.safe.max, 'bg-accent-fixed text-accent'],
                ['保', preview.stable.min, preview.stable.max, 'bg-safe-fixed text-safe'],
              ].map(([label, min, max, tone]) => (
                <div key={label as string} className={`rounded-xl px-4 py-3 ${tone}`}>
                  <p className="font-serif text-lg font-semibold">{label}</p>
                  <p className="mt-1 text-sm">
                    [{(min as number).toFixed(2)}, {(max as number).toFixed(2)}]
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-text-muted">暂无预览</p>
          )}
        </Card>
      </div>
    </div>
  );
}
