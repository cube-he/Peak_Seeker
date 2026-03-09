'use client';

import {
  Card,
  Form,
  Input,
  Select,
  InputNumber,
  Button,
  Row,
  Col,
  Typography,
  Tabs,
  message,
  Empty,
} from 'antd';
import { SaveOutlined, UserOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { userService } from '@/services/user';
import { useAuthStore } from '@/stores/authStore';
import { PROVINCES } from '@volunteer-helper/shared';
import Link from 'next/link';

const { Title } = Typography;
const { Option } = Select;

export default function ProfilePage() {
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();
  const [profileForm] = Form.useForm();
  const [examForm] = Form.useForm();
  const [prefForm] = Form.useForm();

  const { data: user, isLoading } = useQuery({
    queryKey: ['user-me'],
    queryFn: () => userService.getMe(),
    enabled: isLoggedIn,
  });

  const updateProfile = useMutation({
    mutationFn: userService.updateProfile,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
      message.success('个人信息已更新');
    },
  });

  const updateExamInfo = useMutation({
    mutationFn: userService.updateExamInfo,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
      message.success('考试信息已更新');
    },
  });

  const updatePreferences = useMutation({
    mutationFn: userService.updatePreferences,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-me'] });
      message.success('偏好设置已更新');
    },
  });

  if (!isLoggedIn) {
    return (
      <MainLayout>
        <Card className="text-center py-16">
          <Empty description="请先登录" />
          <Link href="/login">
            <Button type="primary" className="mt-4">去登录</Button>
          </Link>
        </Card>
      </MainLayout>
    );
  }

  const tabItems = [
    {
      key: 'profile',
      label: '个人信息',
      children: (
        <Form
          form={profileForm}
          layout="vertical"
          onFinish={(values) => updateProfile.mutate(values)}
          initialValues={{
            realName: user?.realName,
            gender: user?.gender,
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="realName" label="真实姓名">
                <Input placeholder="请输入真实姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label="性别">
                <Select placeholder="请选择" allowClear>
                  <Option value="男">男</Option>
                  <Option value="女">女</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={updateProfile.isPending}
            >
              保存
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'exam',
      label: '考试信息',
      children: (
        <Form
          form={examForm}
          layout="vertical"
          onFinish={(values) => updateExamInfo.mutate(values)}
          initialValues={{
            province: user?.province,
            examYear: user?.examYear || 2025,
            score: user?.score,
            rank: user?.rank,
            batch: user?.batch,
          }}
        >
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="province" label="所在省份">
                <Select placeholder="选择省份">
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="examYear" label="高考年份">
                <InputNumber min={2020} max={2030} className="w-full" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="batch" label="批次">
                <Select placeholder="选择批次" allowClear>
                  <Option value="本科一批">本科一批</Option>
                  <Option value="本科二批">本科二批</Option>
                  <Option value="专科批">专科批</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="score" label="高考分数">
                <InputNumber min={0} max={750} className="w-full" placeholder="输入分数" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="rank" label="省排名位次">
                <InputNumber min={1} className="w-full" placeholder="输入位次" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={updateExamInfo.isPending}
            >
              保存
            </Button>
          </Form.Item>
        </Form>
      ),
    },
    {
      key: 'preferences',
      label: '偏好设置',
      children: (
        <Form
          form={prefForm}
          layout="vertical"
          onFinish={(values) => updatePreferences.mutate(values)}
          initialValues={{
            preferredProvinces: user?.preferredProvinces,
            preferredUniversityTypes: user?.preferredUniversityTypes,
            careerDirection: user?.careerDirection,
          }}
        >
          <Form.Item name="preferredProvinces" label="偏好省份">
            <Select mode="multiple" placeholder="选择偏好省份（可多选）">
              {PROVINCES.map((p) => (
                <Option key={p.code} value={p.name}>{p.name}</Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="preferredUniversityTypes" label="偏好院校类型">
            <Select mode="multiple" placeholder="选择偏好类型（可多选）">
              <Option value="综合">综合</Option>
              <Option value="理工">理工</Option>
              <Option value="师范">师范</Option>
              <Option value="医药">医药</Option>
              <Option value="财经">财经</Option>
              <Option value="政法">政法</Option>
              <Option value="语言">语言</Option>
              <Option value="农林">农林</Option>
              <Option value="艺术">艺术</Option>
              <Option value="民族">民族</Option>
              <Option value="体育">体育</Option>
              <Option value="军事">军事</Option>
            </Select>
          </Form.Item>
          <Form.Item name="careerDirection" label="职业方向">
            <Input.TextArea rows={3} placeholder="描述你的职业方向和兴趣（可选）" />
          </Form.Item>
          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={updatePreferences.isPending}
            >
              保存
            </Button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <MainLayout>
      <Card
        title={
          <Title level={4} className="mb-0">
            <UserOutlined className="mr-2" />
            个人中心
          </Title>
        }
        loading={isLoading}
      >
        <div className="mb-4">
          <span className="text-gray-500 mr-4">用户名：{user?.username}</span>
          {user?.email && <span className="text-gray-500 mr-4">邮箱：{user?.email}</span>}
          {user?.phone && <span className="text-gray-500">手机：{user?.phone}</span>}
        </div>
        <Tabs items={tabItems} />
      </Card>
    </MainLayout>
  );
}
