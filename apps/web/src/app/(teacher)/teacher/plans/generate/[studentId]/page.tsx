'use client';

import { useState } from 'react';
import {
  Card,
  Steps,
  Button,
  Descriptions,
  Select,
  Alert,
  Progress,
  Result,
  Spin,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { planApi } from '@/services/plan-api';

const BATCH_OPTIONS = [
  { label: '本科一批', value: 'BATCH_1' },
  { label: '本科二批', value: 'BATCH_2' },
  { label: '本科提前批', value: 'EARLY' },
];

export default function GeneratePlanPage() {
  const params = useParams();
  const router = useRouter();
  const studentId = params.studentId as string;
  const [currentStep, setCurrentStep] = useState(0);
  const [batch, setBatch] = useState<string>('BATCH_1');
  const [rushRatio] = useState(25);
  const [stableRatio] = useState(42);
  const [safeRatio] = useState(33);
  const [generatedPlanId, setGeneratedPlanId] = useState<number | null>(null);

  const { data: studentData, isLoading: studentLoading } = useQuery({
    queryKey: ['student-detail', studentId],
    queryFn: () => studentApi.getById(studentId),
  });

  const student = studentData?.data;

  const generateMutation = useMutation({
    mutationFn: () =>
      planApi.generate(studentId, {
        batch,
        rushRatio,
        stableRatio,
        safeRatio,
      }),
    onSuccess: (data) => {
      setGeneratedPlanId(data?.data?.id);
      setCurrentStep(2);
      message.success('方案生成成功');
    },
    onError: () => {
      message.error('方案生成失败，请重试');
    },
  });

  if (studentLoading) {
    return (
      <div className="flex justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  const steps = [
    {
      title: '确认参数',
      content: (
        <div className="space-y-6">
          {/* Student Info Summary */}
          <Card title="学生信息" size="small">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="姓名">
                {student?.realName || student?.username || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="分数">
                {student?.score ?? '未填写'}
              </Descriptions.Item>
              <Descriptions.Item label="位次">
                {student?.rank ?? '未填写'}
              </Descriptions.Item>
              <Descriptions.Item label="科类">
                {student?.examType === 'SCIENCE' ? '理科' : student?.examType === 'LIBERAL_ARTS' ? '文科' : '未填写'}
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {(!student?.score || !student?.rank) && (
            <Alert
              type="warning"
              message="学生成绩信息不完整"
              description="请先完善学生的分数和位次信息再生成方案。"
              showIcon
            />
          )}

          {/* Algorithm Params */}
          <Card title="算法参数" size="small">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-secondary block mb-2">
                  冲/稳/保比例
                </label>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span className="text-rush">冲 {rushRatio}%</span>
                      <span className="text-stable">稳 {stableRatio}%</span>
                      <span className="text-safe">保 {safeRatio}%</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden flex bg-border">
                      <div className="bg-rush h-full" style={{ width: `${rushRatio}%` }} />
                      <div className="bg-stable h-full" style={{ width: `${stableRatio}%` }} />
                      <div className="bg-safe h-full" style={{ width: `${safeRatio}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      ),
    },
    {
      title: '选择批次',
      content: (
        <div className="space-y-4">
          <Card size="small">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-text-secondary block mb-2">录取批次</label>
                <Select
                  value={batch}
                  onChange={setBatch}
                  options={BATCH_OPTIONS}
                  className="w-full sm:w-[300px]"
                  size="large"
                />
              </div>
              <div>
                <label className="text-sm text-text-secondary block mb-2">数据来源</label>
                <Select
                  defaultValue="MOCK_EXAM"
                  options={[
                    { label: '二诊成绩（预案）', value: 'MOCK_EXAM' },
                    { label: '高考成绩（正式）', value: 'GAOKAO' },
                  ]}
                  className="w-full sm:w-[300px]"
                  size="large"
                />
              </div>
            </div>
          </Card>
        </div>
      ),
    },
    {
      title: '生成结果',
      content: generateMutation.isPending ? (
        <div className="text-center py-16">
          <Spin size="large" />
          <p className="text-text-muted mt-4">正在生成方案，请稍候...</p>
          <Progress percent={75} status="active" className="max-w-[300px] mx-auto mt-4" />
        </div>
      ) : generatedPlanId ? (
        <Result
          status="success"
          title="方案生成成功"
          subTitle="您可以查看方案详情并进行调整"
          extra={[
            <Button
              type="primary"
              key="view"
              onClick={() => router.push(`/teacher/plans/${generatedPlanId}`)}
              icon={<CheckCircleOutlined />}
            >
              查看方案
            </Button>,
            <Link key="list" href="/teacher/plans">
              <Button>返回方案列表</Button>
            </Link>,
          ]}
        />
      ) : (
        <Result
          status="info"
          title="准备生成"
          subTitle="点击下方按钮开始生成方案"
        />
      ),
    },
  ];

  return (
    <div className="max-w-[800px] mx-auto space-y-6">
      {/* Back */}
      <Link
        href="/teacher/plans"
        className="inline-flex items-center gap-2 text-sm text-text-tertiary hover:text-primary no-underline transition-colors"
      >
        <ArrowLeftOutlined /> 返回方案列表
      </Link>

      <h1 className="font-serif text-xl font-semibold text-text">
        生成方案 — {student?.realName || student?.username}
      </h1>

      {/* Steps */}
      <Steps current={currentStep} items={steps.map((s) => ({ title: s.title }))} className="mb-6" />

      {/* Step Content */}
      <div>{steps[currentStep].content}</div>

      {/* Navigation */}
      <div className="flex justify-between pt-4 border-t border-border-subtle">
        <Button
          disabled={currentStep === 0}
          onClick={() => setCurrentStep((s) => s - 1)}
        >
          上一步
        </Button>
        <div className="flex gap-2">
          {currentStep < 2 && (
            <Button
              type="primary"
              onClick={() => {
                if (currentStep === 1) {
                  generateMutation.mutate();
                }
                setCurrentStep((s) => Math.min(s + 1, 2));
              }}
              icon={currentStep === 1 ? <ThunderboltOutlined /> : undefined}
              disabled={!student?.score || !student?.rank}
            >
              {currentStep === 1 ? '开始生成' : '下一步'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
