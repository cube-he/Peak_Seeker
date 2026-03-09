'use client';

import { useState } from 'react';
import {
  Card,
  Form,
  InputNumber,
  Select,
  Button,
  Table,
  Row,
  Col,
  Tag,
  Statistic,
  Space,
} from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { admissionService } from '@/services/admission';
import { useUserStore } from '@/stores/userStore';
import { PROVINCES } from '@volunteer-helper/shared';

const { Option } = Select;

export default function ScoresPage() {
  const [form] = Form.useForm();
  const { examInfo } = useUserStore();
  const [searchMode, setSearchMode] = useState<'score' | 'rank'>('score');
  const [results, setResults] = useState<any[]>([]);

  const searchByScore = useMutation({
    mutationFn: admissionService.getByScore,
    onSuccess: (data) => setResults(data),
  });

  const searchByRank = useMutation({
    mutationFn: admissionService.getByRank,
    onSuccess: (data) => setResults(data),
  });

  const { data: statistics } = useQuery({
    queryKey: ['admission-stats', examInfo.province],
    queryFn: () => admissionService.getStatistics(examInfo.province || '四川'),
    enabled: !!examInfo.province,
  });

  const handleSearch = (values: any) => {
    if (searchMode === 'score') {
      searchByScore.mutate({
        score: values.score,
        province: values.province,
        year: values.year,
        range: values.range || 20,
      });
    } else {
      searchByRank.mutate({
        rank: values.rank,
        province: values.province,
        year: values.year,
        range: values.range || 5000,
      });
    }
  };

  const columns = [
    {
      title: '院校',
      key: 'university',
      render: (_: any, record: any) => (
        <div>
          <Link href={`/universities/${record.universityId}`} className="font-medium" style={{ color: '#2563EB' }}>
            {record.university?.name}
          </Link>
          <div className="text-xs" style={{ color: '#94A3B8' }}>{record.university?.province}</div>
        </div>
      ),
    },
    {
      title: '专业',
      key: 'major',
      render: (_: any, record: any) => (
        <div>
          <Link href={`/majors/${record.majorId}`} style={{ color: '#334155' }}>
            {record.major?.name}
          </Link>
          <div className="text-xs" style={{ color: '#94A3B8' }}>{record.major?.category}</div>
        </div>
      ),
    },
    { title: '年份', dataIndex: 'year', key: 'year', width: 70 },
    {
      title: '最低分',
      dataIndex: 'majorMinScore',
      key: 'majorMinScore',
      width: 80,
      sorter: (a: any, b: any) => (a.majorMinScore || 0) - (b.majorMinScore || 0),
      render: (val: number) => val ? <span className="font-medium" style={{ color: '#0F172A' }}>{val}</span> : '-',
    },
    {
      title: '最低位次',
      dataIndex: 'majorMinRank',
      key: 'majorMinRank',
      width: 100,
      sorter: (a: any, b: any) => (a.majorMinRank || 0) - (b.majorMinRank || 0),
      render: (val: number) => val ? <span style={{ color: '#64748B' }}>{val.toLocaleString()}</span> : '-',
    },
    {
      title: '录取人数',
      dataIndex: 'majorAdmissionCount',
      key: 'majorAdmissionCount',
      width: 80,
      render: (val: number) => val || '-',
    },
    {
      title: '标签',
      key: 'tags',
      width: 150,
      render: (_: any, record: any) => (
        <Space size={4} wrap>
          {record.university?.is985 && <Tag color="red">985</Tag>}
          {record.university?.is211 && <Tag color="orange">211</Tag>}
          {record.university?.isDoubleFirstClass && <Tag color="blue">双一流</Tag>}
        </Space>
      ),
    },
  ];

  const isLoading = searchByScore.isPending || searchByRank.isPending;

  return (
    <MainLayout>
      <div className="mb-6">
        <h2 className="text-xl font-bold mb-1" style={{ color: '#0F172A' }}>分数线查询</h2>
        <p className="text-sm" style={{ color: '#64748B' }}>按分数或位次查询历年录取数据</p>
      </div>

      <Row gutter={20}>
        <Col xs={24} lg={8}>
          <Card className="sticky top-20" styles={{ body: { padding: '24px' } }}>
            <h3 className="text-base font-semibold mb-4" style={{ color: '#0F172A' }}>查询条件</h3>
            <Space className="mb-4" size={8}>
              <Button
                type={searchMode === 'score' ? 'primary' : 'default'}
                onClick={() => setSearchMode('score')}
                style={{ borderRadius: 6 }}
              >
                按分数查
              </Button>
              <Button
                type={searchMode === 'rank' ? 'primary' : 'default'}
                onClick={() => setSearchMode('rank')}
                style={{ borderRadius: 6 }}
              >
                按位次查
              </Button>
            </Space>

            <Form
              form={form}
              layout="vertical"
              onFinish={handleSearch}
              initialValues={{
                province: examInfo.province || '四川',
                score: examInfo.score,
                rank: examInfo.rank,
                year: 2024,
                range: searchMode === 'score' ? 20 : 5000,
              }}
            >
              <Form.Item name="province" label="省份" rules={[{ required: true }]}>
                <Select>
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>

              {searchMode === 'score' ? (
                <Form.Item name="score" label="分数" rules={[{ required: true, message: '请输入分数' }]}>
                  <InputNumber min={0} max={750} className="w-full" placeholder="输入分数" />
                </Form.Item>
              ) : (
                <Form.Item name="rank" label="位次" rules={[{ required: true, message: '请输入位次' }]}>
                  <InputNumber min={1} className="w-full" placeholder="输入位次" />
                </Form.Item>
              )}

              <Form.Item name="year" label="年份">
                <Select>
                  <Option value={2024}>2024</Option>
                  <Option value={2023}>2023</Option>
                  <Option value={2022}>2022</Option>
                </Select>
              </Form.Item>

              <Form.Item name="range" label="浮动范围">
                <InputNumber
                  min={1}
                  className="w-full"
                  placeholder={searchMode === 'score' ? '分数浮动范围' : '位次浮动范围'}
                />
              </Form.Item>

              <Form.Item className="mb-0">
                <Button
                  type="primary"
                  htmlType="submit"
                  icon={<SearchOutlined />}
                  loading={isLoading}
                  block
                  size="large"
                  style={{ height: 44, fontWeight: 600 }}
                >
                  查询
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </Col>

        <Col xs={24} lg={16}>
          {statistics && (
            <Card className="mb-4">
              <Row gutter={24}>
                <Col span={6}>
                  <Statistic title="数据总量" value={statistics._count} />
                </Col>
                <Col span={6}>
                  <Statistic title="最高分" value={statistics._max?.majorMinScore || '-'} valueStyle={{ color: '#EF4444' }} />
                </Col>
                <Col span={6}>
                  <Statistic title="平均分" value={statistics._avg?.majorMinScore ? Math.round(statistics._avg.majorMinScore) : '-'} valueStyle={{ color: '#2563EB' }} />
                </Col>
                <Col span={6}>
                  <Statistic title="最低分" value={statistics._min?.majorMinScore || '-'} valueStyle={{ color: '#10B981' }} />
                </Col>
              </Row>
            </Card>
          )}

          <Card
            title={<span className="font-semibold" style={{ color: '#0F172A' }}>查询结果 ({results.length} 条)</span>}
            styles={{ body: { padding: 0 } }}
          >
            <Table
              columns={columns}
              dataSource={results}
              rowKey="id"
              loading={isLoading}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              size="small"
            />
          </Card>
        </Col>
      </Row>
    </MainLayout>
  );
}
