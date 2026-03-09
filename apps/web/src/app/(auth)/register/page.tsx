'use client';

import { Card, Form, Input, Button, message, Divider, Select } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService, RegisterParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';
import { PROVINCES } from '@volunteer-helper/shared';

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
    <div
      className="min-h-screen flex items-center justify-center px-4 py-8"
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
              创建账号
            </h2>
            <p className="text-sm" style={{ color: '#64748B' }}>
              注册后开始智能填报之旅
            </p>
          </div>

          <Form layout="vertical" onFinish={handleRegister} size="large">
            <Form.Item
              name="username"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少3个字符' },
              ]}
            >
              <Input prefix={<UserOutlined style={{ color: '#94A3B8' }} />} placeholder="用户名" />
            </Form.Item>

            <Form.Item
              name="password"
              rules={[
                { required: true, message: '请输入密码' },
                { min: 6, message: '密码至少6个字符' },
              ]}
            >
              <Input.Password prefix={<LockOutlined style={{ color: '#94A3B8' }} />} placeholder="密码" />
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
              <Input.Password prefix={<LockOutlined style={{ color: '#94A3B8' }} />} placeholder="确认密码" />
            </Form.Item>

            <Form.Item name="phone">
              <Input prefix={<PhoneOutlined style={{ color: '#94A3B8' }} />} placeholder="手机号（选填）" />
            </Form.Item>

            <Form.Item name="province">
              <Select placeholder="所在省份（选填）" allowClear>
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
                style={{ height: 44, fontWeight: 600 }}
              >
                注册
              </Button>
            </Form.Item>
          </Form>

          <Divider style={{ color: '#94A3B8', fontSize: 13 }}>已有账号？</Divider>

          <Link href="/login">
            <Button block style={{ height: 40 }}>立即登录</Button>
          </Link>
        </Card>
      </div>
    </div>
  );
}
