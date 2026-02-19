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
  Typography,
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

const { Title, Text } = Typography;
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
    onError: () => {
      message.error('生成失败，请稍后重试');
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
      preferences: {
        provinces: values.preferredProvinces,
      },
      strategy: {
        rushCount: values.rushCount || 20,
        stableCount: values.stableCount || 40,
        safeCount: values.safeCount || 36,
      },
    });
  };

  const columns = [
    {
      title: '序号',
      dataIndex: 'order',
      key: 'order',
      width: 60,
    },
    {
      title: '策略',
      dataIndex: 'strategy',
      key: 'strategy',
      width: 80,
      render: (strategy: string) => {
        const colors: Record<string, string> = {
          rush: 'red',
          stable: 'blue',
          safe: 'green',
        };
        const labels: Record<string, string> = {
          rush: '冲',
          stable: '稳',
          safe: '保',
        };
        return <Tag color={colors[strategy]}>{labels[strategy]}</Tag>;
      },
    },
    {
      title: '院校',
      key: 'university',
      render: (_: any, record: any) => (
        <div>
          <div className="font-medium">{record.university?.name}</div>
          <Text type="secondary" className="text-xs">
            {record.university?.province} · {record.university?.type}
          </Text>
        </div>
      ),
    },
    {
      title: '专业',
      key: 'major',
      render: (_: any, record: any) => (
        <div>
          <div>{record.major?.name}</div>
          <Text type="secondary" className="text-xs">
            {record.major?.category}
          </Text>
        </div>
      ),
    },
    {
      title: '去年分数/位次',
      key: 'admission',
      width: 120,
      render: (_: any, record: any) => (
        <div>
          <div>{record.admission?.minScore || '-'}</div>
          <Text type="secondary">{record.admission?.minRank || '-'}</Text>
        </div>
      ),
    },
    {
      title: '录取概率',
      key: 'acceptRate',
      width: 120,
      render: (_: any, record: any) => {
        const rate = record.prediction?.acceptRate || 0;
        const percent = Math.round(rate * 100);
        return (
          <Progress
            percent={percent}
            size="small"
            status={percent < 40 ? 'exception' : percent < 70 ? 'normal' : 'success'}
          />
        );
      },
    },
  ];

  return (
    <MainLayout>
      <Row gutter={24}>
        <Col xs={24} lg={8}>
          <Card title="填写信息" className="sticky top-4">
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
              <Form.Item
                name="score"
                label="高考分数"
                rules={[{ required: true, message: '请输入分数' }]}
              >
                <InputNumber
                  min={0}
                  max={750}
                  className="w-full"
                  placeholder="请输入高考分数"
                />
              </Form.Item>

              <Form.Item
                name="rank"
                label="省排名位次"
                rules={[{ required: true, message: '请输入位次' }]}
              >
                <InputNumber
                  min={1}
                  className="w-full"
                  placeholder="请输入省排名位次"
                />
              </Form.Item>

              <Form.Item
                name="province"
                label="所在省份"
                rules={[{ required: true, message: '请选择省份' }]}
              >
                <Select placeholder="请选择省份">
                  {PROVINCES.map((p) => (
                    <Option key={p} value={p}>
                      {p}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Divider>策略设置</Divider>

              <Row gutter={16}>
                <Col span={8}>
                  <Form.Item name="rushCount" label="冲">
                    <InputNumber min={0} max={50} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="stableCount" label="稳">
                    <InputNumber min={0} max={60} className="w-full" />
                  </Form.Item>
                </Col>
                <Col span={8}>
                  <Form.Item name="safeCount" label="保">
                    <InputNumber min={0} max={50} className="w-full" />
                  </Form.Item>
                </Col>
              </Row>

              <Form.Item name="preferredProvinces" label="偏好省份">
                <Select mode="multiple" placeholder="选择偏好省份（可多选）">
                  {PROVINCES.map((p) => (
                    <Option key={p} value={p}>
                      {p}
                    </Option>
                  ))}
                </Select>
              </Form.Item>

              <Form.Item>
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<BulbOutlined />}
                  loading={generateMutation.isPending}
                  block
                  size="large"
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
                    <Statistic
                      title="总志愿数"
                      value={planResult.statistics?.totalCount}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="冲"
                      value={planResult.statistics?.rushCount}
                      valueStyle={{ color: '#ff4d4f' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="稳"
                      value={planResult.statistics?.stableCount}
                      valueStyle={{ color: '#1677ff' }}
                    />
                  </Col>
                  <Col span={6}>
                    <Statistic
                      title="保"
                      value={planResult.statistics?.safeCount}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Col>
                </Row>
              </Card>

              <Card
                title="志愿方案"
                extra={
                  <Space>
                    <Button icon={<SaveOutlined />}>保存方案</Button>
                    <Button icon={<ExportOutlined />}>导出</Button>
                  </Space>
                }
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
            <Card className="text-center py-16">
              <BulbOutlined style={{ fontSize: 64, color: '#d9d9d9' }} />
              <Title level={4} className="mt-4 text-gray-400">
                填写信息后生成志愿方案
              </Title>
              <Text type="secondary">
                系统将根据您的分数和位次，智能推荐冲稳保志愿
              </Text>
            </Card>
          )}
        </Col>
      </Row>
    </MainLayout>
  );
}
