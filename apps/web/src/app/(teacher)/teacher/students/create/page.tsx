'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Card, Form, Input, message, Radio } from 'antd';
import { ArrowLeftOutlined, UserAddOutlined } from '@ant-design/icons';
import { useMutation } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';

interface CreateStudentForm {
  username: string;
  password: string;
  realName: string;
  phone?: string;
  gender?: 'MALE' | 'FEMALE';
}

export default function CreateStudentPage() {
  const router = useRouter();
  const [form] = Form.useForm<CreateStudentForm>();

  const createMutation = useMutation({
    mutationFn: (values: CreateStudentForm) => studentApi.create(values),
    onSuccess: (data) => {
      message.success('学生创建成功');
      router.push(`/teacher/students/${data?.data?.id || ''}`);
    },
    onError: () => {
      message.error('创建失败，请重试');
    },
  });

  return (
    <div className="mx-auto max-w-[720px] space-y-5">
      <Link
        href="/teacher/students"
        className="inline-flex items-center gap-2 text-sm text-text-tertiary no-underline transition-colors hover:text-primary"
      >
        <ArrowLeftOutlined /> 返回学生列表
      </Link>

      <section className="rounded-2xl bg-[#1e3a5f] px-6 py-6 text-white shadow-card">
        <p className="text-[11px] uppercase tracking-[2px] text-accent-light">Create Student</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">创建学生</h1>
        <p className="mt-2 text-sm leading-6 text-white/70">
          先创建登录账号，后续可在学生详情中补全成绩、户籍、偏好和健康信息。
        </p>
      </section>

      <Card className="rounded-2xl shadow-card">
        <Form form={form} layout="vertical" onFinish={(values) => createMutation.mutate(values)} requiredMark="optional">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Form.Item
              name="username"
              label="登录用户名"
              rules={[
                { required: true, message: '请输入用户名' },
                { min: 3, message: '用户名至少 3 个字符' },
              ]}
            >
              <Input placeholder="学生登录时使用" />
            </Form.Item>

            <Form.Item
              name="password"
              label="初始密码"
              rules={[
                { required: true, message: '请设置初始密码' },
                { min: 6, message: '密码至少 6 个字符' },
              ]}
            >
              <Input.Password placeholder="学生可后续修改" />
            </Form.Item>

            <Form.Item name="realName" label="真实姓名" rules={[{ required: true, message: '请输入学生真实姓名' }]}>
              <Input placeholder="学生真实姓名" />
            </Form.Item>

            <Form.Item name="phone" label="手机号">
              <Input placeholder="学生或家长手机号（选填）" />
            </Form.Item>
          </div>

          <Form.Item name="gender" label="性别">
            <Radio.Group>
              <Radio value="MALE">男</Radio>
              <Radio value="FEMALE">女</Radio>
            </Radio.Group>
          </Form.Item>

          <div className="flex gap-3 border-t border-border-subtle pt-4">
            <Button
              type="primary"
              htmlType="submit"
              icon={<UserAddOutlined />}
              loading={createMutation.isPending}
              size="large"
              className="border-0"
            >
              创建学生
            </Button>
            <Link href="/teacher/students">
              <Button size="large">取消</Button>
            </Link>
          </div>
        </Form>
      </Card>
    </div>
  );
}
