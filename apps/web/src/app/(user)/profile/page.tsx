'use client';

import {
  Form,
  Input,
  Select,
  InputNumber,
  Button,
  Row,
  Col,
  Tabs,
  message,
  Empty,
  Spin,
} from 'antd';
import { SaveOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import MainLayout from '@/components/layout/MainLayout';
import { userService } from '@/services/user';
import { useAuthStore } from '@/stores/authStore';
import { PROVINCES } from '@volunteer-helper/shared';
import Link from 'next/link';

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
        <div className="bg-surface rounded-xl text-center py-16 shadow-card">
          <Empty description="请先登录" />
          <Link href="/login">
            <Button type="primary" className="mt-4">去登录</Button>
          </Link>
        </div>
      </MainLayout>
    );
  }

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex justify-center py-20"><Spin size="large" /></div>
      </MainLayout>
    );
  }

  // Derive initials for avatar
  const avatarInitial = user?.realName?.[0] || user?.username?.[0] || '?';

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
          <h3 className="font-serif text-base font-semibold text-text mb-4">基本资料</h3>
          <Row gutter={16}>
            <Col xs={24} sm={12}>
              <Form.Item name="realName" label="真实姓名">
                <Input placeholder="请输入真实姓名" className="bg-surface-dim" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="gender" label="性别">
                <Select placeholder="请选择" allowClear>
                  <Option value="男">男</Option>
                  <Option value="女">女</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <button
              type="submit"
              disabled={updateProfile.isPending}
              className="bg-accent text-white px-6 py-2.5 rounded font-medium shadow-glow-accent hover:opacity-90 transition-all duration-200 inline-flex items-center gap-1.5 border-0 cursor-pointer text-sm"
            >
              <SaveOutlined />
              {updateProfile.isPending ? '保存中...' : '保存'}
            </button>
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
          <h3 className="font-serif text-base font-semibold text-text mb-4">考试详情</h3>
          <Row gutter={16}>
            <Col xs={24} sm={8}>
              <Form.Item name="province" label="所在省份">
                <Select placeholder="选择省份">
                  {PROVINCES.map((p) => (
                    <Option key={p.code} value={p.name}>{p.name}</Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
              <Form.Item name="examYear" label="高考年份">
                <InputNumber min={2020} max={2030} className="w-full" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={8}>
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
            <Col xs={24} sm={12}>
              <Form.Item name="score" label="高考分数">
                <InputNumber min={0} max={750} className="w-full" placeholder="输入分数" />
              </Form.Item>
            </Col>
            <Col xs={24} sm={12}>
              <Form.Item name="rank" label="省排名位次">
                <InputNumber min={1} className="w-full" placeholder="输入位次" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item>
            <button
              type="submit"
              disabled={updateExamInfo.isPending}
              className="bg-accent text-white px-6 py-2.5 rounded font-medium shadow-glow-accent hover:opacity-90 transition-all duration-200 inline-flex items-center gap-1.5 border-0 cursor-pointer text-sm"
            >
              <SaveOutlined />
              {updateExamInfo.isPending ? '保存中...' : '保存'}
            </button>
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
          <h3 className="font-serif text-base font-semibold text-text mb-4">志愿偏好</h3>
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
            <Input.TextArea rows={3} placeholder="描述你的职业方向和兴趣（可选）" className="bg-surface-dim" />
          </Form.Item>
          <Form.Item>
            <button
              type="submit"
              disabled={updatePreferences.isPending}
              className="bg-accent text-white px-6 py-2.5 rounded font-medium shadow-glow-accent hover:opacity-90 transition-all duration-200 inline-flex items-center gap-1.5 border-0 cursor-pointer text-sm"
            >
              <SaveOutlined />
              {updatePreferences.isPending ? '保存中...' : '保存'}
            </button>
          </Form.Item>
        </Form>
      ),
    },
  ];

  return (
    <MainLayout>
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="font-serif text-[22px] sm:text-2xl font-semibold text-text m-0">
          个人中心
        </h1>
      </div>

      {/* User Summary Card */}
      <div className="bg-surface rounded-xl p-4 sm:p-6 mb-6 shadow-card">
        <div className="flex flex-col sm:flex-row items-center gap-5">
          {/* Avatar */}
          <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center text-white font-serif text-2xl shrink-0">
            {avatarInitial}
          </div>
          {/* User info */}
          <div className="min-w-0">
            <div className="font-serif text-xl font-semibold text-text mb-1">
              {user?.realName || user?.username}
            </div>
            <div className="flex items-center gap-4 flex-wrap text-sm text-text-tertiary">
              <span>用户名：{user?.username}</span>
              {user?.email && <span>邮箱：{user?.email}</span>}
              {user?.phone && <span>手机：{user?.phone}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Section */}
      <div className="bg-surface rounded-xl p-4 sm:p-6 shadow-card">
        <Tabs items={tabItems} />
      </div>
    </MainLayout>
  );
}
