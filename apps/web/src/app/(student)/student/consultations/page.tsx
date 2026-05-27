'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select, Spin, message } from 'antd';
import { consultationApi, type Consultation } from '@/services/consultation-api';

const STATUS_LABEL: Record<string, string> = {
  requested: '待老师确认',
  scheduled: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '缺席',
};

const CHANNEL_LABEL: Record<string, string> = {
  phone: '电话',
  wechat: '微信',
  in_person: '线下',
  video: '视频',
};

export default function StudentConsultationsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const { data: list = [], isLoading } = useQuery({
    queryKey: ['student-consultations'],
    queryFn: () => consultationApi.listMine(),
  });

  const requestMutation = useMutation({
    mutationFn: (payload: any) => consultationApi.requestByParent(payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['student-consultations'] });
      message.success('申请已提交,等待老师确认');
      setOpen(false);
      form.resetFields();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '申请失败'),
  });

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-baseline justify-between">
        <h1 className="m-0 text-xl font-semibold">我的沟通预约</h1>
        <Button type="primary" onClick={() => setOpen(true)}>
          申请新预约
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg bg-bg/30 py-12 text-center"><Spin /></div>
      ) : list.length === 0 ? (
        <Card>
          <p className="m-0 text-center text-text-muted">
            暂无预约。点击右上角"申请新预约"。
          </p>
        </Card>
      ) : (
        <Card>
          <ul className="m-0 list-none space-y-2 p-0">
            {list.map((c: Consultation) => {
              const when = new Date(c.scheduledAt).toLocaleString('zh-CN');
              return (
                <li
                  key={c.id}
                  className="rounded-md border border-border-subtle bg-surface px-3 py-2"
                >
                  <p className="m-0 text-sm font-medium">
                    {when} · {CHANNEL_LABEL[c.channel] ?? c.channel}
                    {c.purpose ? ` · ${c.purpose}` : ''}
                  </p>
                  <p className="m-0 text-xs text-text-muted">
                    状态:{STATUS_LABEL[c.status] ?? c.status}
                    {c.durationEst ? ` · 预估 ${c.durationEst} 分` : ''}
                  </p>
                  {c.notes ? (
                    <p className="m-0 mt-1 text-xs text-text-muted">{c.notes}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Modal
        title="申请沟通预约"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() =>
          form.validateFields().then((values) => {
            requestMutation.mutate({
              scheduledAt: values.scheduledAt.toISOString(),
              durationEst: values.durationEst,
              channel: values.channel,
              purpose: values.purpose,
              notes: values.notes,
            });
          })
        }
        confirmLoading={requestMutation.isPending}
      >
        <Form form={form} layout="vertical" initialValues={{ channel: 'phone', durationEst: 30 }}>
          <Form.Item name="scheduledAt" label="期望时间" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="channel" label="沟通方式" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '电话', value: 'phone' },
                { label: '微信', value: 'wechat' },
                { label: '线下', value: 'in_person' },
                { label: '视频', value: 'video' },
              ]}
            />
          </Form.Item>
          <Form.Item name="durationEst" label="预估时长(分钟)">
            <InputNumber min={5} max={300} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="purpose" label="想聊什么">
            <Input placeholder="例:讨论选校 / 填报疑问 / 进度反馈" />
          </Form.Item>
          <Form.Item name="notes" label="备注">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
