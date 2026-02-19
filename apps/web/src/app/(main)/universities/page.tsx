'use client';

import { useState } from 'react';
import {
  Card,
  Table,
  Input,
  Select,
  Space,
  Tag,
  Button,
  Row,
  Col,
  Typography,
} from 'antd';
import { SearchOutlined, StarOutlined, StarFilled } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import MainLayout from '@/components/layout/MainLayout';
import { universityService, UniversityQueryParams } from '@/services/university';

const { Title } = Typography;
const { Option } = Select;

export default function UniversitiesPage() {
  const [filters, setFilters] = useState<UniversityQueryParams>({
    page: 1,
    pageSize: 20,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['universities', filters],
    queryFn: () => universityService.getList(filters),
  });

  const { data: filterOptions } = useQuery({
    queryKey: ['university-filters'],
    queryFn: () => universityService.getFilters(),
  });

  const columns = [
    {
      title: '院校名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => (
        <Link href={`/universities/${record.id}`} className="text-primary">
          {text}
        </Link>
      ),
    },
    {
      title: '省份',
      dataIndex: 'province',
      key: 'province',
      width: 100,
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 100,
    },
    {
      title: '标签',
      key: 'tags',
      width: 200,
      render: (_: any, record: any) => (
        <Space size={4} wrap>
          {record.is985 && <Tag color="red">985</Tag>}
          {record.is211 && <Tag color="orange">211</Tag>}
          {record.isDoubleFirstClass && <Tag color="blue">双一流</Tag>}
        </Space>
      ),
    },
    {
      title: '最低分/位次',
      key: 'admission',
      width: 150,
      render: (_: any, record: any) => {
        const admission = record.latestAdmission;
        if (!admission) return '-';
        return (
          <span>
            {admission.minScore || '-'} / {admission.minRank || '-'}
          </span>
        );
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <Button type="text" icon={<StarOutlined />} />
      ),
    },
  ];

  return (
    <MainLayout>
      <Card className="mb-4">
        <Title level={4} className="mb-4">
          院校查询
        </Title>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} md={6}>
            <Input
              placeholder="搜索院校名称"
              prefix={<SearchOutlined />}
              value={filters.keyword}
              onChange={(e) =>
                setFilters({ ...filters, keyword: e.target.value, page: 1 })
              }
              allowClear
            />
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="省份"
              value={filters.province}
              onChange={(value) =>
                setFilters({ ...filters, province: value, page: 1 })
              }
              allowClear
              className="w-full"
            >
              {filterOptions?.provinces?.map((p: any) => (
                <Option key={p.value} value={p.value}>
                  {p.value} ({p.count})
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="院校类型"
              value={filters.type}
              onChange={(value) =>
                setFilters({ ...filters, type: value, page: 1 })
              }
              allowClear
              className="w-full"
            >
              {filterOptions?.types?.map((t: any) => (
                <Option key={t.value} value={t.value}>
                  {t.value}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={4}>
            <Select
              placeholder="院校层次"
              value={filters.level}
              onChange={(value) =>
                setFilters({ ...filters, level: value, page: 1 })
              }
              allowClear
              className="w-full"
            >
              {filterOptions?.levels?.map((l: any) => (
                <Option key={l.value} value={l.value}>
                  {l.value}
                </Option>
              ))}
            </Select>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Space>
              <Button
                type={filters.is985 ? 'primary' : 'default'}
                onClick={() =>
                  setFilters({
                    ...filters,
                    is985: filters.is985 ? undefined : true,
                    page: 1,
                  })
                }
              >
                985
              </Button>
              <Button
                type={filters.is211 ? 'primary' : 'default'}
                onClick={() =>
                  setFilters({
                    ...filters,
                    is211: filters.is211 ? undefined : true,
                    page: 1,
                  })
                }
              >
                211
              </Button>
              <Button
                type={filters.isDoubleFirstClass ? 'primary' : 'default'}
                onClick={() =>
                  setFilters({
                    ...filters,
                    isDoubleFirstClass: filters.isDoubleFirstClass
                      ? undefined
                      : true,
                    page: 1,
                  })
                }
              >
                双一流
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Card>
        <Table
          columns={columns}
          dataSource={data?.data}
          rowKey="id"
          loading={isLoading}
          pagination={{
            current: filters.page,
            pageSize: filters.pageSize,
            total: data?.pagination?.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 所院校`,
            onChange: (page, pageSize) =>
              setFilters({ ...filters, page, pageSize }),
          }}
        />
      </Card>
    </MainLayout>
  );
}
