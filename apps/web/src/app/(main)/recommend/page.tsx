'use client';

import { useState } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Select,
  Button,
  Row,
  Col,
  Divider,
  Table,
  Tag,
  Space,
  Progress,
  Statistic,
  message,
} from 'antd';
import { BulbOutlined, SaveOutlined, ExportOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { recommendService, RecommendPlanParams } from '@/services/recommend';
import { useUserStore } from '@/stores/userStore';
import { PROVINCES } from '@volunteer-helper/shared';

const { Option } = Select;

export default function RecommendPage() {
  const [form] = Form.useForm();
  const { examInfo, setExamInfo } = useUserStore();
  const [planResult, setPlanResult] = useState<any>(null);

  const generateMutation = useMutation({
    mutationFn: (params: RecommendPlanParams) =>
      recommendService.generatePlan(params),
    onSuccess: (data) => {
      setPlanResult(data);
      message.success('方案生成成功！');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message || '生成失败，请稍后重试';
      message.error(msg);
    },
  });

  const handleGenerate = (values: any) => {
    setExamInfo({
      score: values.score,
      rank: values.rank,
      province: values.province,
    });
    generateMutation.mutate({
      score: values.score,
      rank: values.rank,
      province: values.province,
      preferences: { provinces: values.preferredProvinces },
      strategy: {
        rushCount: values.rushCount || 20,
        stableCount: values.stableCount || 40,
        safeCount: values.safeCount || 36,
      },
    });
  };

  const handleSavePlan = async () => {
    if (!planResult?.plan) return;
    try {
      // TODO: Call plan service to save
      message.success('方案保存成功！');
    } catch {
      message.error('保存失败，请稍后重试');
    }
  };

  const handleExportPlan = () => {
    if (!planResult?.plan?.items) return;

    const headers = ['序号', '策略', '院校', '专业', '去年最低分', '去年最低位次', '录取概率'];
    const strategyMap: Record<string, string> = { rush: '冲', stable: '稳', safe: '保' };
    const rows = planResult.plan.items.map((item: any) => [
      item.order,
      strategyMap[item.strategy] || item.strategy,
      item.university?.name || '',
      item.major?.name || '',
      item.admission?.minScore || '',
      item.admission?.minRank || '',
      `${Math.round((item.prediction?.acceptRate || 0) * 100)}%`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `志愿方案_${new Date().toLocaleDateString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    message.success('导出成功！');
  };

  const columns = [
    { title: '序号', dataIndex: 'order', key: 'order', width: 60 },
    {
      title: '策略',
      dataIndex: 'strategy',
      key: 'strategy',
      width: 70,
      render: (strategy: string) => {
        const config: Record<string, { color: string; label: string }> = {
          rush: { color: '#EF4444', label: '冲' },
          stable: { color: '#2563EB', label: '稳' },
          safe: { color: '#10B981', label: '保' },
        };
        const c = config[strategy] || { color: '#94A3B8', label: strategy };
        return <Tag color={c.color}>{c.label}</Tag>;
      },
    },
    {
      title: '院校',
      key: 'university',
      render: (_: any, record: any) => (
        <div>
          <div className="font-medium" style={{ color: '#0F172A' }}>{record.university?.name}</div>
          <div className="text-xs" style={{ color: '#94A3B8' }}>
            {record.university?.province} · {record.university?.type}
          </div>
        </div>
      ),
    },
    {
      title: '专业',
      key: 'major',
      render: (_: any, record: any) => (
        <div>
          <div style={{ color: '#334155' }}>{record.major?.name}</div>
          <div className="text-xs" style={{ color: '#94A3B8' }}>{record.major?.category}</div>
        </div>
      ),
    },
    {
      title: '去年分数/位次',
      key: 'admission',
      width: 120,
      render: (_: any, record: any) => (
        <div>
          <span className="font-medium" style={{ color: '#0F172A' }}>{record.admission?.minScore || '-'}</span>
          <span style={{ color: '#CBD5E1' }}> / </span>
          <span style={{ color: '#64748B' }}>{record.admission?.minRank || '-'}</span>
        </div>
      ),
    },
    {
      title: '录取概率',
      key: 'acceptRate',
      width: 130,
      render: (_: any, record: any) => {
        const rate = record.prediction?.acceptRate || 0;
        const percent = Math.round(rate * 100);
        return (
          <Progress
            percent={percent}
            size="small"
            strokeColor={percent < 40 ? '#EF4444' : percent < 70 ? '#2563EB' : '#10B981'}
            trailColor="#F1F5F9"
          />
        );
      },
    },
  ];

  return (
    <MainLayout>
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1" style={{ color: '#0F172A' }}>智能推荐</h2>
        <p className="text-sm" style={{ color: '#64748B' }}>输入分数和位次，AI 智能生成冲稳保方案</p>
      </div>

      <Row gutter={20}>
        <Col xs={24} lg={8}>
          <Card className="sticky top-20" styles={{ body: { padding: '24px' } }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: '#0F172A' }}>填写信息</h3>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleGenerate}
              initialValues={{
                score: examInfo.score,
                rank: examInfo.rank,
                province: examInfo.province || '四川',
                rushCount: 20,
                stableCount: 40,
                safeCount: 36,
              }}
            >
              <Form.Item name="score" label="高考分数" rules={[{ required: true, message: '请输入分数' }]}>
                <InputNumber min={0} max={750} className="w-full" placeholder="请输入高考分数" />
              </Form.Item>
              <Form.Item name="rank" label="省排名位次" rules={[{ required: true, message: '请输入位次' }]}>
                <InputNumber min={1} className="w-full" placeholder="请输入省排名位次" />
              </Form.Item>
              <Form.Item name="province" label="所在省份" rules={[{ required: true, message: '请选择省份' }]}>
                <Select placeholder="请选择省份">
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Divider style={{ margin: '16px 0', color: '#94A3B8', fontSize: 13 }}>策略设置</Divider>

              <Row gutter={12}>
                <Col span={8}>
                  <Form.Item name="rushCount" label={<Tag color="red">冲</Tag>}>
                    <InputNumber min={0} max={50} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="stableCount" label={<Tag color="blue">稳</Tag>}>
                    <InputNumber min={0} max={60} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="safeCount" label={<Tag color="green">保</Tag>}>
                    <InputNumber min={0} max={50} className="w-full" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="preferredProvinces" label="偏好省份">
                <Select mode="multiple" placeholder="选择偏好省份（可多选）" maxTagCount={3}>
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item className="mb-0">
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<BulbOutlined />}
                  loading={generateMutation.isPending}
                  block
                  size="large"
                  style={{ height: 44, fontWeight: 600 }}
                >
                  生成志愿方案
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {planResult ? (
            <>
              <Card className="mb-4">
                <Row gutter={24}>
                  <Col span={6}>
                    <Statistic title="总志愿数" value={planResult.statistics?.totalCount} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="冲" value={planResult.statistics?.rushCount} valueStyle={{ color: '#EF4444' }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="稳" value={planResult.statistics?.stableCount} valueStyle={{ color: '#2563EB' }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="保" value={planResult.statistics?.safeCount} valueStyle={{ color: '#10B981' }} />
                  </Col>
                </Row>
              </Card>

              <Card
                title={<span className="font-semibold" style={{ color: '#0F172A' }}>志愿方案</span>}
                extra={
                  <Space>
                    <Button icon={<SaveOutlined />} onClick={handleSavePlan}>保存方案</Button>
                    <Button icon={<ExportOutlined />} onClick={handleExportPlan}>导出</Button>
                  </Space>
                }
                styles={{ body: { padding: 0 } }}
              >
                <Table
                  columns={columns}
                  dataSource={planResult.plan?.items}
                  rowKey="order"
                  pagination={{ pageSize: 20 }}
                  size="small"
                />
              </Card>
            </>
          ) : (
            <Card className="text-center" styles={{ body: { padding: '64px 24px' } }}>
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
                style={{ background: '#F1F5F9' }}
              >
                <BulbOutlined style={{ fontSize: 32, color: '#CBD5E1' }} />
              </div>
              <h3 className="text-lg font-semibold mb-2" style={{ color: '#94A3B8' }}>
                填写信息后生成志愿方案
              </h3>
              <p className="text-sm" style={{ color: '#CBD5E1' }}>
                系统将根据您的分数和位次，智能推荐冲稳保志愿
              </p>
            </Card>
          )}
        </Col>
      </Row>
    </MainLayout>
  );
}
