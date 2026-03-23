'use client';

import { Form, Input, Button, message, Select } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService, RegisterParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';
import { PROVINCES } from '@volunteer-helper/shared';
import AuthLayout from '@/components/layout/AuthLayout';

const { Option } = Select;

export default function RegisterPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const registerMutation = useMutation({
    mutationFn: (params: RegisterParams) => authService.register(params),
    onSuccess: (data: any) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      message.success('注册成功！');
      router.push('/');
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '注册失败');
    },
  });

  const handleRegister = (values: RegisterParams) => {
    registerMutation.mutate(values);
  };

  return (
    <AuthLayout
      heroTitle="千万考生的信赖选择"
      heroSubtitle="依托学术级大数据算法，为每一位学子构建精准的升学路线图，让理想前程有据可依。"
      features={[
        { icon: '📈', title: '精准位次预测', description: '基于近十年千万级招录数据，采用非线性回归模型，预测误差率极低。' },
        { icon: '🏫', title: '名校资源库', description: '权威覆盖全国 2,800+ 所高校，深度解析双一流及 985/211 核心学科数据。' },
      ]}
      socialProof="50,000+ 学子已加入"
    >
      <div>
        <h2 className="font-headline font-extrabold text-2xl text-on-surface mb-2">
          创建您的账户
        </h2>
        <p className="text-on-surface-variant text-sm mb-8">
          开启您的精准升学规划之旅
        </p>

        {/* Progress Bar */}
        <div className="flex gap-2 mb-8">
          <div className="flex-1 h-1 rounded-full bg-primary" />
          <div className="flex-1 h-1 rounded-full bg-surface-container-high" />
          <div className="flex-1 h-1 rounded-full bg-surface-container-high" />
        </div>

        <Form layout="vertical" onFinish={handleRegister} size="large">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input
              prefix={<UserOutlined className="text-outline" />}
              placeholder="用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-outline" />}
              placeholder="设置密码"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            dependencies={['password']}
            rules={[
              { required: true, message: '请确认密码' },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue('password') === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error('两次密码不一致'));
                },
              }),
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-outline" />}
              placeholder="确认密码"
            />
          </Form.Item>

          <Form.Item name="phone">
            <Input
              prefix={<PhoneOutlined className="text-outline" />}
              placeholder="手机号码（选填）"
            />
          </Form.Item>

          <Form.Item name="province">
            <Select
              placeholder="选择高考省份"
              allowClear
              suffixIcon={<EnvironmentOutlined className="text-outline" />}
            >
              {PROVINCES.map((p) => (
                <Option key={p.code} value={p.name}>
                  {p.name}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item className="mb-4">
            <Button
              type="primary"
              htmlType="submit"
              loading={registerMutation.isPending}
              block
              style={{ height: 48, fontWeight: 600, fontSize: 15 }}
            >
              立即开启规划
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center">
          <p className="text-on-surface-variant text-sm">
            已有账户？{' '}
            <Link href="/login" className="text-primary font-semibold no-underline hover:underline">
              立即登录
            </Link>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-surface-container-low text-center">
          <p className="text-xs text-outline">
            &copy; {new Date().getFullYear()} SUMMIT INTELLIGENCE FRAMEWORK. ALL RIGHTS RESERVED.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
