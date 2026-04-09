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
      socialProof="125万+ 家庭的共同选择"
    >
      <div>
        <h2 className="font-serif text-[28px] font-semibold text-text">
          加入智愿家
        </h2>
        <p className="text-[15px] text-text-tertiary mt-2 mb-8">
          创建账号，开始你的升学规划
        </p>

        <Form layout="vertical" onFinish={handleRegister} size="large">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input
              prefix={<UserOutlined className="text-text-muted" />}
              placeholder="用户名"
              className="bg-surface-dim"
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
              prefix={<LockOutlined className="text-text-muted" />}
              placeholder="设置密码"
              className="bg-surface-dim"
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
              prefix={<LockOutlined className="text-text-muted" />}
              placeholder="确认密码"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item name="phone">
            <Input
              prefix={<PhoneOutlined className="text-text-muted" />}
              placeholder="手机号码（选填）"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item name="province">
            <Select
              placeholder="选择高考省份"
              allowClear
              suffixIcon={<EnvironmentOutlined className="text-text-muted" />}
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
              className="bg-gradient-to-br from-primary to-primary-light text-white h-12 rounded text-[15px] font-medium shadow-glow-primary hover:shadow-glow-primary-lg hover:-translate-y-px transition-all duration-200 w-full"
            >
              创建账号
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center">
          <p className="text-sm text-text-tertiary">
            已有账号？{' '}
            <Link href="/login" className="text-primary-light hover:text-primary font-medium no-underline hover:underline">
              去登录
            </Link>
          </p>
        </div>
      </div>
    </AuthLayout>
  );
}
