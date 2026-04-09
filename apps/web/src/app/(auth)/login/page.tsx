'use client';

import { Form, Input, Button, message } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService, LoginParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';
import AuthLayout from '@/components/layout/AuthLayout';

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();

  const loginMutation = useMutation({
    mutationFn: (params: LoginParams) => authService.login(params),
    onSuccess: (data: any) => {
      setAuth({
        user: data.user,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
      });
      message.success('登录成功！');
      router.push('/');
    },
    onError: (error: any) => {
      message.error(error.response?.data?.message || '登录失败');
    },
  });

  const handleLogin = (values: LoginParams) => {
    loginMutation.mutate(values);
  };

  return (
    <AuthLayout
      heroTitle="AI 驱动，智选未来"
      heroSubtitle="基于大数据深度洞察，为每一位学子构建精准的升学规划路径，让理想前程有据可依。"
      features={[
        { icon: '📊', title: '精准位次预测', description: '基于近十年千万级招录数据，采用非线性回归模型，预测误差率极低。' },
        { icon: '🏛️', title: '名校资源库', description: '权威覆盖全国 2,800+ 所高校，深度解析双一流及 985/211 核心学科数据。' },
      ]}
      socialProof="125万+ 家庭的共同选择"
    >
      <div className="w-full max-w-md mx-auto px-4 sm:px-0">
        <h2 className="font-serif text-[22px] sm:text-[28px] font-semibold text-text">
          欢迎回来
        </h2>
        <p className="text-[15px] text-text-tertiary mt-2 mb-8">
          登录你的智愿家账号
        </p>

        <Form layout="vertical" onFinish={handleLogin} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined className="text-text-muted" />}
              placeholder="用户名"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-text-muted" />}
              placeholder="密码"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item className="mb-6">
            <Button
              type="primary"
              htmlType="submit"
              loading={loginMutation.isPending}
              block
              className="bg-gradient-to-br from-primary to-primary-light text-white h-12 rounded text-[15px] font-medium shadow-glow-primary hover:shadow-glow-primary-lg hover:-translate-y-px transition-all duration-200 w-full"
            >
              登录
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center">
          <p className="text-sm text-text-tertiary">
            还没有账号？{' '}
            <Link href="/register" className="text-primary-light hover:text-primary font-medium no-underline hover:underline">
              立即注册
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
