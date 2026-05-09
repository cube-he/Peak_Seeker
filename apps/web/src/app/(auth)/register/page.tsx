'use client';

import { Button, Checkbox, Form, Input, message, Select } from 'antd';
import { EnvironmentOutlined, LockOutlined, PhoneOutlined, UserOutlined } from '@ant-design/icons';
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
      message.success('注册成功');
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
      message.error(Array.isArray(msg) ? msg[0] : msg || '注册失败');
    },
  });

  const handleRegister = (values: RegisterParams & { confirmPassword?: string; terms?: boolean }) => {
    const { confirmPassword, terms, ...params } = values;
    void confirmPassword;
    void terms;
    registerMutation.mutate(params);
  };

  return (
    <AuthLayout
      heroTitle="每一个志愿，都值得被认真对待。"
      heroSubtitle="免费注册，开启你的 2026 高考志愿决策。基于 4 年录取数据、AI 智能推荐与位次趋势分析。"
      features={[
        { title: '完全免费', description: '无广告，无诱导消费，无隐藏付费。' },
        { title: '数据可信', description: '围绕四川省教育考试院、阳光高考与高校招生数据口径整理。' },
        { title: '陪伴一整年', description: '从备考到录取，每个节点都能回到方案继续调整。' },
      ]}
      socialProof="CREATE ACCOUNT · 智愿家"
    >
      <div>
        <div className="mb-8 flex justify-between text-[13px] text-text-tertiary">
          <span>已有账号？</span>
          <Link href="/login" className="font-medium text-primary no-underline hover:text-primary-light">
            立即登录 →
          </Link>
        </div>

        <div className="mb-7">
          <div className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">SIGN UP · 注册</div>
          <h1 className="m-0 font-serif text-[30px] font-semibold leading-tight text-text">
            开通账号
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-text-tertiary">
            填写基本信息，1 分钟开始你的志愿规划。
          </p>
        </div>

        <Form
          layout="vertical"
          onFinish={handleRegister}
          size="large"
          requiredMark={false}
          initialValues={{ province: '四川省', terms: true }}
        >
          <Form.Item
            label={<span className="text-xs font-medium text-text-secondary">用户名</span>}
            name="username"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少 3 个字符' },
            ]}
          >
            <Input
              prefix={<UserOutlined className="text-text-muted" />}
              placeholder="用于登录的用户名"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item
            label={<span className="text-xs font-medium text-text-secondary">设置密码</span>}
            name="password"
            rules={[
              { required: true, message: '请输入密码' },
              { min: 6, message: '密码至少 6 个字符' },
              { pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, message: '需包含大写字母、小写字母和数字' },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined className="text-text-muted" />}
              placeholder="至少 6 位，含大小写字母和数字"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item
            label={<span className="text-xs font-medium text-text-secondary">确认密码</span>}
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
              placeholder="再次输入密码"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item
            label={<span className="text-xs font-medium text-text-secondary">手机号</span>}
            name="phone"
          >
            <Input
              prefix={<PhoneOutlined className="text-text-muted" />}
              placeholder="选填，用于后续提醒"
              className="bg-surface-dim"
            />
          </Form.Item>

          <Form.Item
            label={<span className="text-xs font-medium text-text-secondary">高考省份</span>}
            name="province"
          >
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

          <Form.Item
            name="terms"
            valuePropName="checked"
            rules={[
              {
                validator: (_, value) =>
                  value ? Promise.resolve() : Promise.reject(new Error('请先同意用户协议和隐私政策')),
              },
            ]}
            className="mb-4"
          >
            <Checkbox className="text-[12.5px] leading-relaxed text-text-tertiary">
              我已阅读并同意
              <span className="text-primary">《用户服务协议》</span>
              和
              <span className="text-primary">《隐私政策》</span>
              ，授权智愿家在我同意范围内使用信息生成个性化推荐。
            </Checkbox>
          </Form.Item>

          <Button
            type="primary"
            htmlType="submit"
            loading={registerMutation.isPending}
            block
            className="h-12 rounded-lg bg-gradient-to-br from-primary to-primary-light text-[15px] font-semibold text-white shadow-glow-primary transition-all duration-200 hover:-translate-y-px hover:shadow-glow-primary-lg"
          >
            免费创建账号 →
          </Button>
        </Form>
      </div>
    </AuthLayout>
  );
}
