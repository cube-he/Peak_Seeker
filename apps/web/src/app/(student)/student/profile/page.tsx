'use client';

import { useState } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Tabs,
  Button,
  Progress,
  message,
  Spin,
} from 'antd';
import {
  SaveOutlined,
  UserOutlined,
  BookOutlined,
  HeartOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import HealthCheckboxGroup from '@/components/student/HealthCheckboxGroup';
import CountyCascader from '@/components/student/CountyCascader';

const EXAM_TYPE_OPTIONS = [
  { label: '理科', value: 'SCIENCE' },
  { label: '文科', value: 'LIBERAL_ARTS' },
];

export default function StudentProfilePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('core');
  const [form] = Form.useForm();

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['student-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });

  const profile = profileData?.data;
  const completeness = profile?.completeness ?? 0;

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      studentApi.updateMyProfile(values),
    onSuccess: () => {
      message.success('保存成功');
      queryClient.invalidateQueries({ queryKey: ['student-profile'] });
    },
    onError: () => {
      message.error('保存失败');
    },
  });

  const onSave = () => {
    form.validateFields().then((values) => {
      saveMutation.mutate(values);
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spin size="large" />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'core',
      label: (
        <span className="flex items-center gap-1.5">
          <UserOutlined /> 基本信息
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item name="realName" label="姓名">
            <Input placeholder="你的真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号">
            <Input placeholder="手机号" />
          </Form.Item>
          <Form.Item name="gender" label="性别">
            <Radio.Group>
              <Radio value="MALE">男</Radio>
              <Radio value="FEMALE">女</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="examType" label="科类">
            <Select options={EXAM_TYPE_OPTIONS} placeholder="选择科类" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-4">
            <Form.Item name="score" label="高考分数">
              <InputNumber min={0} max={750} placeholder="总分" className="w-full" />
            </Form.Item>
            <Form.Item name="rank" label="全省位次">
              <InputNumber min={1} placeholder="位次" className="w-full" />
            </Form.Item>
          </div>
        </div>
      ),
    },
    {
      key: 'preferences',
      label: (
        <span className="flex items-center gap-1.5">
          <BookOutlined /> 我的偏好
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item name="preferredProvinces" label="意向省份">
            <Select mode="multiple" placeholder="选择意向省份" allowClear>
              <Select.Option value="四川">四川</Select.Option>
              <Select.Option value="北京">北京</Select.Option>
              <Select.Option value="上海">上海</Select.Option>
              <Select.Option value="广东">广东</Select.Option>
              <Select.Option value="浙江">浙江</Select.Option>
              <Select.Option value="江苏">江苏</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="preferredMajorCategories" label="意向专业大类">
            <Select mode="multiple" placeholder="选择意向专业" allowClear>
              <Select.Option value="工学">工学</Select.Option>
              <Select.Option value="理学">理学</Select.Option>
              <Select.Option value="医学">医学</Select.Option>
              <Select.Option value="经济学">经济学</Select.Option>
              <Select.Option value="管理学">管理学</Select.Option>
              <Select.Option value="法学">法学</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="careerDirection" label="职业方向">
            <Input.TextArea rows={2} placeholder="未来想从事什么方向的工作？" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'conditions',
      label: (
        <span className="flex items-center gap-1.5">
          <HeartOutlined /> 其他条件
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item name="physicalLimits" label="体检受限项">
            <HealthCheckboxGroup />
          </Form.Item>
          <Form.Item name="county" label="区县">
            <CountyCascader />
          </Form.Item>
          <Form.Item name="economicLevel" label="经济承受能力">
            <Radio.Group>
              <Radio value="LOW">经济敏感</Radio>
              <Radio value="MEDIUM">适中</Radio>
              <Radio value="HIGH">不限</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="interests" label="兴趣爱好">
            <Select mode="tags" placeholder="输入你的兴趣爱好" />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-xl font-semibold text-text">个人信息</h1>

      {/* Completeness */}
      <Card size="small">
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-secondary">信息完善度</span>
          <Progress
            percent={completeness}
            strokeColor={completeness >= 80 ? '#276749' : completeness >= 50 ? '#b8860b' : '#c53030'}
            className="flex-1"
          />
        </div>
        <p className="text-xs text-text-faint mt-1">
          完善信息有助于老师为你生成更精准的方案
        </p>
      </Card>

      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={profile || {}}
          requiredMark="optional"
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
          />

          <div className="flex justify-end pt-4 border-t border-border-subtle mt-4">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={onSave}
              loading={saveMutation.isPending}
              size="large"
            >
              保存
            </Button>
          </div>
        </Form>
      </Card>
    </div>
  );
}
