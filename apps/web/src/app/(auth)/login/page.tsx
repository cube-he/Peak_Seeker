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
      heroSubtitle={'全球顶尖升学情报系统，为每一位追梦者构建精准的\u201C数字作战室\u201D。基于大数据深度洞察，重新定义名校申请策略。'}
      features={[
        { icon: '📊', title: '精准位次预测', description: '基于近十年千万级招录数据，采用非线性回归模型，预测误差率极低。' },
        { icon: '🏛️', title: '名校资源库', description: '权威覆盖全国 2,800+ 所高校，深度解析双一流及 985/211 核心学科数据。' },
      ]}
      socialProof="10,000+ 学子已获得理想 Offer"
    >
      <div>
        <h2 className="font-headline font-extrabold text-2xl text-on-surface mb-2">
          欢迎回来
        </h2>
        <p className="text-on-surface-variant text-sm mb-8">
          请登录您的学术情报账户以继续
        </p>

        <Form layout="vertical" onFinish={handleLogin} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined className="text-outline" />}
              placeholder="用户名"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-outline" />}
              placeholder="密码"
            />
          </Form.Item>

          <Form.Item className="mb-6">
            <Button
              type="primary"
              htmlType="submit"
              loading={loginMutation.isPending}
              block
              style={{ height: 48, fontWeight: 600, fontSize: 15 }}
            >
              一键登录 →
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center">
          <p className="text-on-surface-variant text-sm">
            还没有账户？{' '}
            <Link href="/register" className="text-primary font-semibold no-underline hover:underline">
              立即注册
            </Link>
          </p>
        </div>

        <div className="mt-8 pt-6 border-t border-surface-container-low text-center">
          <p className="text-xs text-outline">
            &copy; {new Date().getFullYear()} SUMMIT INTELLIGENCE FRAMEWORK. POWERED BY ARCHITECT AI.
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
