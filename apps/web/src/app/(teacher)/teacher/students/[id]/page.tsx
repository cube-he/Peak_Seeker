'use client';

import { useState } from 'react';
import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Checkbox,
  Tabs,
  Button,
  Progress,
  Tag,
  message,
  Spin,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FileTextOutlined,
  UserOutlined,
  BookOutlined,
  HeartOutlined,
  ExperimentOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';

const SICHUAN_SUBJECTS = [
  { label: '语文', value: 'chinese' },
  { label: '数学', value: 'math' },
  { label: '英语', value: 'english' },
  { label: '物理', value: 'physics' },
  { label: '化学', value: 'chemistry' },
  { label: '生物', value: 'biology' },
  { label: '政治', value: 'politics' },
  { label: '历史', value: 'history' },
  { label: '地理', value: 'geography' },
];

const EXAM_TYPE_OPTIONS = [
  { label: '理科', value: 'SCIENCE' },
  { label: '文科', value: 'LIBERAL_ARTS' },
];

export default function StudentDetailPage() {
  const params = useParams();
  const studentId = params.id as string;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('core');
  const [form] = Form.useForm();

  const { data: studentData, isLoading } = useQuery({
    queryKey: ['student-detail', studentId],
    queryFn: () => studentApi.getById(studentId),
    enabled: !!studentId,
  });

  const student = studentData?.data;

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      studentApi.update(studentId, {
        ...values,
        dataVersion: student?.dataVersion,
      }),
    onSuccess: () => {
      message.success('保存成功');
      queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        message.error('数据已被其他人修改，请刷新后重试');
      } else {
        message.error('保存失败');
      }
    },
  });

  const onSave = () => {
    form.validateFields().then((values) => {
      saveMutation.mutate(values);
    });
  };

  // Calculate completeness based on which fields are filled
  const completeness = student?.completeness ?? 0;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  const tabItems = [
    {
      key: 'core',
      label: (
        <span className="flex items-center gap-1.5">
          <UserOutlined /> 核心信息
        </span>
      ),
      children: (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item name="realName" label="姓名" rules={[{ required: true }]}>
              <Input placeholder="学生姓名" />
            </Form.Item>
            <Form.Item name="phone" label="手机号">
              <Input placeholder="手机号" />
            </Form.Item>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Form.Item name="gender" label="性别">
              <Radio.Group>
                <Radio value="MALE">男</Radio>
                <Radio value="FEMALE">女</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="examType" label="科类">
              <Select options={EXAM_TYPE_OPTIONS} placeholder="选择科类" />
            </Form.Item>
          </div>
          <Divider orientation="left" plain>
            考试成绩
          </Divider>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Form.Item name="score" label="总分">
              <InputNumber min={0} max={750} placeholder="高考总分" className="w-full" />
            </Form.Item>
            <Form.Item name="rank" label="位次">
              <InputNumber min={1} placeholder="全省位次" className="w-full" />
            </Form.Item>
            <Form.Item name="examYear" label="年份">
              <Select
                placeholder="考试年份"
                options={[
                  { label: '2026', value: 2026 },
                  { label: '2025', value: 2025 },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="subjects" label="选考科目">
            <Checkbox.Group options={SICHUAN_SUBJECTS} />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'preferences',
      label: (
        <span className="flex items-center gap-1.5">
          <BookOutlined /> 偏好与排除
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item name="preferredProvinces" label="意向省份">
            <Select mode="multiple" placeholder="选择意向省份（不选则不限）" allowClear>
              <Select.Option value="四川">四川</Select.Option>
              <Select.Option value="北京">北京</Select.Option>
              <Select.Option value="上海">上海</Select.Option>
              <Select.Option value="广东">广东</Select.Option>
              <Select.Option value="浙江">浙江</Select.Option>
              <Select.Option value="江苏">江苏</Select.Option>
              <Select.Option value="湖北">湖北</Select.Option>
              <Select.Option value="重庆">重庆</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="preferredMajorCategories" label="意向专业大类">
            <Select mode="multiple" placeholder="选择意向专业大类" allowClear>
              <Select.Option value="工学">工学</Select.Option>
              <Select.Option value="理学">理学</Select.Option>
              <Select.Option value="医学">医学</Select.Option>
              <Select.Option value="经济学">经济学</Select.Option>
              <Select.Option value="管理学">管理学</Select.Option>
              <Select.Option value="法学">法学</Select.Option>
              <Select.Option value="文学">文学</Select.Option>
              <Select.Option value="教育学">教育学</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="excludedUniversities" label="排除院校">
            <Select mode="tags" placeholder="输入不考虑的院校名称" />
          </Form.Item>
          <Form.Item name="excludedMajors" label="排除专业">
            <Select mode="tags" placeholder="输入不考虑的专业名称" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'conditions',
      label: (
        <span className="flex items-center gap-1.5">
          <HeartOutlined /> 身体与经济
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item name="physicalConditions" label="身体状况限制">
            <Select mode="multiple" placeholder="如有体检受限专业请选择" allowClear>
              <Select.Option value="色觉异常">色觉异常</Select.Option>
              <Select.Option value="视力不达标">视力不达标</Select.Option>
              <Select.Option value="身高限制">身高限制</Select.Option>
              <Select.Option value="听力限制">听力限制</Select.Option>
              <Select.Option value="无">无限制</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="economicLevel" label="经济承受能力">
            <Radio.Group>
              <Radio value="LOW">经济敏感（优先公办低学费）</Radio>
              <Radio value="MEDIUM">适中（可考虑中外合作）</Radio>
              <Radio value="HIGH">不限</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="notes" label="其他备注">
            <Input.TextArea rows={3} placeholder="其他需要注意的信息" />
          </Form.Item>
        </div>
      ),
    },
    {
      key: 'interests',
      label: (
        <span className="flex items-center gap-1.5">
          <ExperimentOutlined /> 兴趣与性格
        </span>
      ),
      children: (
        <div className="space-y-4">
          <Form.Item name="interests" label="兴趣领域">
            <Select mode="tags" placeholder="输入学生兴趣领域" />
          </Form.Item>
          <Form.Item name="personalityType" label="性格类型">
            <Select placeholder="选择性格类型（选填）" allowClear>
              <Select.Option value="INTJ">INTJ - 建筑师</Select.Option>
              <Select.Option value="INTP">INTP - 逻辑学家</Select.Option>
              <Select.Option value="ENTJ">ENTJ - 指挥官</Select.Option>
              <Select.Option value="ENTP">ENTP - 辩论家</Select.Option>
              <Select.Option value="INFJ">INFJ - 提倡者</Select.Option>
              <Select.Option value="INFP">INFP - 调停者</Select.Option>
              <Select.Option value="ENFJ">ENFJ - 主人公</Select.Option>
              <Select.Option value="ENFP">ENFP - 竞选者</Select.Option>
              <Select.Option value="ISTJ">ISTJ - 物流师</Select.Option>
              <Select.Option value="ISFJ">ISFJ - 守卫者</Select.Option>
              <Select.Option value="ESTJ">ESTJ - 总经理</Select.Option>
              <Select.Option value="ESFJ">ESFJ - 执政官</Select.Option>
              <Select.Option value="ISTP">ISTP - 鉴赏家</Select.Option>
              <Select.Option value="ISFP">ISFP - 探险家</Select.Option>
              <Select.Option value="ESTP">ESTP - 企业家</Select.Option>
              <Select.Option value="ESFP">ESFP - 表演者</Select.Option>
            </Select>
          </Form.Item>
          <Form.Item name="careerDirection" label="职业方向意向">
            <Input.TextArea rows={2} placeholder="学生未来的职业方向想法（选填）" />
          </Form.Item>
        </div>
      ),
    },
  ];

  return (
    <div className="max-w-[900px] mx-auto space-y-6">
      {/* Back + Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/teacher/students"
            className="inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-primary no-underline transition-colors mb-2"
          >
            <ArrowLeftOutlined /> 返回学生列表
          </Link>
          <h1 className="font-serif text-xl font-semibold text-text">
            {student?.realName || student?.username || '学生详情'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Tag color={student?.status === 'FINALIZED' ? 'green' : 'blue'}>
            {student?.status || 'COLLECTING'}
          </Tag>
          <Link href={`/teacher/plans/generate/${studentId}`}>
            <Button icon={<FileTextOutlined />}>生成方案</Button>
          </Link>
        </div>
      </div>

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
      </Card>

      {/* Progressive Form */}
      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={student || {}}
          requiredMark="optional"
        >
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={tabItems}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle mt-6">
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
