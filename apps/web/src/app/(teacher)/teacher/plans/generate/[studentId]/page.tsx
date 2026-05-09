'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Button, Card, Descriptions, Progress, Result, Select, Spin, Steps, message } from 'antd';
import { ArrowLeftOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
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
  const score = student?.score ?? student?.totalScore;
  const rank = student?.rank ?? student?.provincialRank;

  const generateMutation = useMutation({
    mutationFn: () => planApi.generate(studentId, { batch, rushRatio, stableRatio, safeRatio }),
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
    { title: '确认参数' },
    { title: '选择批次' },
    { title: '生成结果' },
  ];

  return (
    <div className="mx-auto max-w-[860px] space-y-5">
      <Link
        href="/teacher/plans"
        className="inline-flex items-center gap-2 text-sm text-text-tertiary no-underline transition-colors hover:text-primary"
      >
        <ArrowLeftOutlined /> 返回方案列表
      </Link>

      <section className="rounded-2xl bg-[#1e3a5f] px-6 py-6 text-white shadow-card">
        <p className="text-[11px] uppercase tracking-[2px] text-accent-light">Generate Plan</p>
        <h1 className="mt-2 font-serif text-3xl font-semibold">
          生成方案 · {student?.realName || student?.username || student?.user?.realName || '学生'}
        </h1>
        <p className="mt-2 text-sm text-white/70">根据学生档案与批次参数生成志愿方案。</p>
      </section>

      <Card className="rounded-2xl shadow-card">
        <Steps current={currentStep} items={steps} />
      </Card>

      {currentStep === 0 ? (
        <div className="space-y-4">
          <Card title="学生信息" className="rounded-2xl shadow-card">
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="姓名">{student?.realName || student?.username || '-'}</Descriptions.Item>
              <Descriptions.Item label="分数">{score ?? '未填写'}</Descriptions.Item>
              <Descriptions.Item label="位次">{rank ?? '未填写'}</Descriptions.Item>
              <Descriptions.Item label="科类">{student?.examType || '未填写'}</Descriptions.Item>
            </Descriptions>
          </Card>

          {(!score || !rank) ? (
            <Alert
              type="warning"
              message="学生成绩信息不完整"
              description="请先完善学生的分数和位次信息再生成方案。"
              showIcon
            />
          ) : null}

          <Card title="算法参数" className="rounded-2xl shadow-card">
            <div className="max-w-[520px]">
              <div className="mb-2 flex justify-between text-xs text-text-muted">
                <span className="text-rush">冲 {rushRatio}%</span>
                <span className="text-stable">稳 {stableRatio}%</span>
                <span className="text-safe">保 {safeRatio}%</span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-full bg-border">
                <div className="h-full bg-rush" style={{ width: `${rushRatio}%` }} />
                <div className="h-full bg-stable" style={{ width: `${stableRatio}%` }} />
                <div className="h-full bg-safe" style={{ width: `${safeRatio}%` }} />
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {currentStep === 1 ? (
        <Card title="批次与来源" className="rounded-2xl shadow-card">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm text-text-secondary">录取批次</label>
              <Select value={batch} onChange={setBatch} options={BATCH_OPTIONS} className="w-full" size="large" />
            </div>
            <div>
              <label className="mb-2 block text-sm text-text-secondary">数据来源</label>
              <Select
                defaultValue="MOCK_EXAM"
                options={[
                  { label: '模拟成绩（预案）', value: 'MOCK_EXAM' },
                  { label: '高考成绩（正式）', value: 'GAOKAO' },
                ]}
                className="w-full"
                size="large"
              />
            </div>
          </div>
        </Card>
      ) : null}

      {currentStep === 2 ? (
        generateMutation.isPending ? (
          <Card className="rounded-2xl py-10 text-center shadow-card">
            <Spin size="large" />
            <p className="mt-4 text-text-muted">正在生成方案，请稍候...</p>
            <Progress percent={75} status="active" className="mx-auto mt-4 max-w-[300px]" />
          </Card>
        ) : generatedPlanId ? (
          <Result
            status="success"
            title="方案生成成功"
            subTitle="可以查看方案详情并继续调整。"
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
          <Result status="info" title="准备生成" subTitle="点击下方按钮开始生成方案。" />
        )
      ) : null}

      <div className="flex justify-between border-t border-border-subtle pt-4">
        <Button disabled={currentStep === 0} onClick={() => setCurrentStep((step) => step - 1)}>
          上一步
        </Button>
        {currentStep < 2 ? (
          <Button
            type="primary"
            onClick={() => {
              if (currentStep === 1) {
                generateMutation.mutate();
              }
              setCurrentStep((step) => Math.min(step + 1, 2));
            }}
            icon={currentStep === 1 ? <ThunderboltOutlined /> : undefined}
            disabled={!score || !rank}
            className="border-0"
          >
            {currentStep === 1 ? '开始生成' : '下一步'}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
