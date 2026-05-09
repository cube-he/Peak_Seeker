'use client';

import { Button, Checkbox, Form, Input, message } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
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
      message.success('登录成功');
      const role = data.user?.role;
      const dashboards: Record<string, string> = {
        ADMIN: '/admin/dashboard',
        TEACHER: '/teacher/dashboard',
        STUDENT: '/',
      };
      router.push(dashboards[role] || '/');
    },
    onError: (error: any) => {
      const msg = error.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : msg || '登录失败');
    },
  });

  const handleLogin = (values: LoginParams) => {
    loginMutation.mutate(values);
  };

  return (
    <AuthLayout
      heroTitle="从迷茫到从容，三步抵达你的志愿。"
      heroSubtitle="智愿家汇集 2022-2025 年四川在川招生录取数据，AI 帮你科学规划冲稳保。但最终决定权，永远在你手里。"
      features={[
        { title: '保留你的规划进度', description: '收藏院校、推荐方案和位次查询记录都会跟随账号保存。' },
        { title: '继续使用真实数据', description: '院校、专业和录取记录按同一数据口径持续更新。' },
      ]}
      socialProof="SIGN IN · 智愿家"
    >
      <div>
        <div className="mb-8 flex justify-end text-[13px] text-text-tertiary">
          还没账号？
          <Link href="/register" className="ml-1 font-medium text-primary no-underline hover:text-primary-light">
            免费注册 →
          </Link>
        </div>

        <div className="mb-7">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">SIGN IN · 登录</div>
          <h1 className="m-0 font-serif text-[30px] font-semibold leading-tight text-text">
            欢迎回来
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-tertiary">
            你的志愿规划进度、收藏院校与方案历史都已为你保留。
          </p>
        </div>

        <div className="mb-6 flex gap-6 border-b border-border">
          <span className="border-b-2 border-primary pb-2 text-sm font-medium text-primary">账号密码</span>
          <span className="pb-2 text-sm text-text-muted">短信登录待接入</span>
        </div>

        <Form layout="vertical" onFinish={handleLogin} size="large" requiredMark={false}>
          <Form.Item
            label={<span className="text-xs font-medium text-text-secondary">用户名</span>}
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined className="text-text-muted" />}
              placeholder="请输入用户名"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item
            label={<span className="text-xs font-medium text-text-secondary">密码</span>}
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-text-muted" />}
              placeholder="请输入密码"
              className="bg-surface-dim"
            />
          </Form.Item>

          <div className="mb-5 flex items-center justify-between gap-3 text-[13px]">
            <Checkbox className="text-text-tertiary">30 天内自动登录</Checkbox>
            <span className="text-right text-text-muted">忘记密码请联系管理员</span>
          </div>

          <Button
            type="primary"
            htmlType="submit"
            loading={loginMutation.isPending}
            block
            className="h-12 rounded-lg bg-gradient-to-br from-primary to-primary-light text-[15px] font-semibold text-white shadow-glow-primary transition-all duration-200 hover:-translate-y-px hover:shadow-glow-primary-lg"
          >
            登录智愿家
          </Button>
        </Form>

        <div className="mt-8 text-center text-xs leading-relaxed text-text-muted">
          继续即代表同意智愿家的
          <span className="text-text-tertiary">《用户协议》</span>
          与
          <span className="text-text-tertiary">《隐私政策》</span>
          <br />
          <span className="mt-1 inline-block text-text-faint">你的成绩与个人信息仅用于推荐计算。</span>
        </div>
      </div>
    </AuthLayout>
  );
}
