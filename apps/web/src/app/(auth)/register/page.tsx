'use client';

import { Card, Form, Input, Button, message, Typography, Divider, Select } from 'antd';
import { UserOutlined, LockOutlined, PhoneOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authService, RegisterParams } from '@/services/auth';
import { useAuthStore } from '@/stores/authStore';
import { PROVINCES } from '@volunteer-helper/shared';

const { Title, Text } = Typography;
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-8">
      <Card className="w-full max-w-md">
        <div className="text-center mb-6">
          <Title level={2}>注册</Title>
          <Text type="secondary">创建账号，开始智能填报</Text>
        </div>

        <Form layout="vertical" onFinish={handleRegister} size="large">
          <Form.Item
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input prefix={<UserOutlined />} placeholder="用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="密码" />
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
            <Input.Password prefix={<LockOutlined />} placeholder="确认密码" />
          </Form.Item>

          <Form.Item name="phone">
            <Input prefix={<PhoneOutlined />} placeholder="手机号（选填）" />
          </Form.Item>

          <Form.Item name="province">
            <Select placeholder="所在省份（选填）">
              {PROVINCES.map((p) => (
                <Option key={p} value={p}>
                  {p}
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={registerMutation.isPending}
              block
            >
              注册
            </Button>
          </Form.Item>
        </Form>

        <Divider>
          <Text type="secondary">已有账号？</Text>
        </Divider>

        <Link href="/login">
          <Button block>立即登录</Button>
        </Link>
      </Card>
    </div>
  );
}
