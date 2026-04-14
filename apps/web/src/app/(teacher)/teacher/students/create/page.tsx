'use client';

import { Form, Input, Button, Card, message, Radio } from 'antd';
import { ArrowLeftOutlined, UserAddOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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

  const onFinish = (values: CreateStudentForm) => {
    createMutation.mutate(values);
  };

  return (
    <div className="max-w-[600px] mx-auto space-y-6">
      {/* Back Link */}
      <Link
        href="/teacher/students"
        className="inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-primary no-underline transition-colors"
      >
        <ArrowLeftOutlined /> 返回学生列表
      </Link>

      <Card>
        <div className="mb-6">
          <h1 className="font-serif text-xl font-semibold text-text">创建学生</h1>
          <p className="text-sm text-text-muted mt-1">
            创建学生账号，后续可逐步完善学生信息
          </p>
        </div>

        <Form
          form={form}
          layout="vertical"
          onFinish={onFinish}
          requiredMark="optional"
        >
          <Form.Item
            name="username"
            label="登录用户名"
            rules={[
              { required: true, message: '请输入用户名' },
              { min: 3, message: '用户名至少3个字符' },
            ]}
          >
            <Input placeholder="学生登录时使用的用户名" />
          </Form.Item>

          <Form.Item
            name="password"
            label="初始密码"
            rules={[
              { required: true, message: '请设置初始密码' },
              { min: 6, message: '密码至少6个字符' },
            ]}
          >
            <Input.Password placeholder="设置初始密码，学生可后续修改" />
          </Form.Item>

          <Form.Item
            name="realName"
            label="真实姓名"
            rules={[{ required: true, message: '请输入学生真实姓名' }]}
          >
            <Input placeholder="学生真实姓名" />
          </Form.Item>

          <Form.Item name="phone" label="手机号">
            <Input placeholder="学生或家长手机号（选填）" />
          </Form.Item>

          <Form.Item name="gender" label="性别">
            <Radio.Group>
              <Radio value="MALE">男</Radio>
              <Radio value="FEMALE">女</Radio>
            </Radio.Group>
          </Form.Item>

          <div className="flex gap-3 pt-4">
            <Button
              type="primary"
              htmlType="submit"
              icon={<UserAddOutlined />}
              loading={createMutation.isPending}
              size="large"
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
