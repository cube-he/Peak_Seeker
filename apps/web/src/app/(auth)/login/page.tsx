'use client';

import { Card, Form, Input, Button, message, Divider } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService, LoginParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';

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
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 50%, #F5F3FF 100%)',
      }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2 no-underline mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold"
              style={{ background: 'linear-gradient(135deg, #2563EB, #3B82F6)' }}
            >
              志
            </div>
            <span className="text-xl font-semibold" style={{ color: '#0F172A' }}>
              志愿填报助手
            </span>
          </Link>
        </div>

        <Card styles={{ body: { padding: '36px 32px' } }}>
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-1" style={{ color: '#0F172A' }}>
              欢迎回来
            </h2>
            <p className="text-sm" style={{ color: '#64748B' }}>
              登录您的账号，继续智能填报
            </p>
          </div>

          <Form layout="vertical" onFinish={handleLogin} size="large">
            <Form.Item
              name="username"
              rules={[{ required: true, message: '请输入用户名' }]}
            >
              <Input prefix={<UserOutlined style={{ color: '#94A3B8' }} />} placeholder="用户名" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: '#94A3B8' }} />} placeholder="密码" />
            </Form.Item>

            <Form.Item className="mb-4">
              <Button
                type="primary"
                htmlType="submit"
                loading={loginMutation.isPending}
                block
                style={{ height: 44, fontWeight: 600 }}
              >
                登录
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ color: '#94A3B8', fontSize: 13 }}>还没有账号？</Divider>

          <Link href="/register">
            <Button block style={{ height: 40 }}>立即注册</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
