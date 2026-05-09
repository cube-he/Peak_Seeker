'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Alert, Button, Card, Checkbox, Collapse, Form, Input, InputNumber, Radio, Select, Spin, Tag, message } from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LockOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type UpdateStudentDto } from '@/services/student-api';
import ProgressBar from '@/components/student/ProgressBar';
import BonusCalcCard from '@/components/policy/BonusCalcCard';

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const queryClient = useQueryClient();
  const [form] = Form.useForm();

  const { data: studentData, isLoading } = useQuery({
    queryKey: ['student-detail', studentId],
    queryFn: () => studentApi.getById(studentId),
    enabled: !!studentId,
  });

  const student: Record<string, any> | undefined = (studentData as any)?.data ?? studentData;

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      studentApi.update(studentId, {
        ...values,
        dataVersion: student?.dataVersion,
      } as UpdateStudentDto),
    onSuccess: () => {
      message.success('保存成功');
      queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        message.error('数据已被其他人修改，请刷新后重试');
      } else {
        message.error(error?.response?.data?.message ?? '保存失败');
      }
    },
  });

  const onExportIntake = async () => {
    try {
      const blob = await studentApi.exportIntake(studentId);
      const url = URL.createObjectURL(blob as Blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const name = student?.user?.realName ?? student?.realName ?? `student${studentId}`;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      anchor.download = `intake_${name}_${today}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      message.success('登记表已下载');
    } catch (error: any) {
      message.error(error?.message ?? '导出失败');
    }
  };

  if (isLoading || !student) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  const progress = student.progress;
  const studentName = student.user?.realName || student.realName || student.user?.username || student.username || '学生详情';

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      <header className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <Link href="/teacher/students" className="mb-2 inline-flex items-center gap-2 text-sm text-text-tertiary no-underline hover:text-primary">
            <ArrowLeftOutlined /> 返回学生列表
          </Link>
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[2px] text-accent">Student Archive</p>
          <h1 className="font-serif text-3xl font-semibold text-text">{studentName}</h1>
          <div className="mt-2 flex items-center gap-2">
            <Tag color={student.status === 'FINALIZED' ? 'green' : 'blue'}>{student.status || 'ACTIVE'}</Tag>
            <span className="text-sm text-text-muted">{student.highSchool || '学校待补充'}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button icon={<DownloadOutlined />} onClick={onExportIntake}>
            导出登记表
          </Button>
          <Link href={`/teacher/plans/generate/${studentId}`}>
            <Button
              icon={<FileTextOutlined />}
              type="primary"
              disabled={progress && !progress.isRecommendable}
              title={progress && !progress.isRecommendable ? '档案未达到可推荐阈值，请先补全关键字段' : ''}
              className="border-0"
            >
              生成方案
            </Button>
          </Link>
        </div>
      </header>

      {progress ? (
        <Card className="rounded-2xl shadow-card">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ProgressBar label="学生自填进度" percent={progress.studentSelfCompleteness} />
            <ProgressBar label="老师录入进度" percent={progress.teacherDataCompleteness} />
          </div>
          <div className="mt-3">
            <ProgressBar label="档案总进度" percent={progress.overallCompleteness} />
          </div>
          {!progress.isRecommendable && progress.missingFieldsForRecommend?.length > 0 ? (
            <p className="mt-3 text-xs text-text-faint">
              未达可推荐阈值，缺：
              <span className="ml-1 text-text-secondary">
                {progress.missingFieldsForRecommend.slice(0, 8).join('、')}
                {progress.missingFieldsForRecommend.length > 8 ? ' 等' : ''}
              </span>
            </p>
          ) : null}
        </Card>
      ) : null}

      <Card className="rounded-2xl shadow-card">
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            ...student,
            ...student.user,
          }}
          requiredMark="optional"
        >
          <Collapse
            defaultActiveKey={['basic', 'exam', 'preference']}
            items={[
              { key: 'basic', label: '基础信息', children: <BasicFields /> },
              {
                key: 'household',
                label: (
                  <span className="flex items-center gap-1">
                    <LockOutlined /> 户籍与高考所在地
                  </span>
                ),
                children: <HouseholdFields />,
              },
              { key: 'exam', label: '考试成绩', children: <ExamFields /> },
              {
                key: 'bonus',
                label: (
                  <span className="flex items-center gap-1">
                    <LockOutlined /> 加分政策
                  </span>
                ),
                children: (
                  <div className="space-y-4">
                    <BonusFields />
                    <BonusCalcCard studentProfileId={Number(studentId)} />
                  </div>
                ),
              },
              { key: 'health', label: '健康条件', children: <HealthFields /> },
              { key: 'preference', label: '偏好与规划', children: <PreferenceFields /> },
            ]}
          />

          <div className="mt-6 flex justify-end border-t border-border-subtle pt-4">
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={() => form.validateFields().then((values) => saveMutation.mutate(values))}
              loading={saveMutation.isPending}
              size="large"
              className="border-0"
            >
              保存
            </Button>
          </div>
        </Form>
      </Card>

      {progress && !progress.isRecommendable ? (
        <Alert
          type="info"
          showIcon
          message="档案未达到“可推荐”阈值"
          description="补完整分数、位次、加分、选科等关键字段后，生成方案按钮才会启用。"
        />
      ) : null}
    </div>
  );
}

function BasicFields() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Form.Item name="realName" label="姓名" rules={[{ required: true }]}>
        <Input placeholder="学生姓名" />
      </Form.Item>
      <Form.Item name="phone" label="手机号">
        <Input placeholder="手机号" />
      </Form.Item>
      <Form.Item name="parentPhone" label="家长手机号">
        <Input />
      </Form.Item>
      <Form.Item name="gender" label="性别">
        <Radio.Group>
          <Radio value="MALE">男</Radio>
          <Radio value="FEMALE">女</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="ethnicity" label="民族">
        <Input placeholder="如 汉族" />
      </Form.Item>
      <Form.Item name="politicalStatus" label="政治面貌">
        <Radio.Group>
          <Radio value="PARTY_MEMBER">党员</Radio>
          <Radio value="LEAGUE_MEMBER">团员</Radio>
          <Radio value="MASSES">群众</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="highSchool" label="高中">
        <Input />
      </Form.Item>
      <Form.Item name="classInfo" label="班级">
        <Input />
      </Form.Item>
    </div>
  );
}

function HouseholdFields() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <Form.Item name="province" label="户籍省">
        <Input placeholder="四川" />
      </Form.Item>
      <Form.Item name="city" label="户籍市">
        <Input />
      </Form.Item>
      <Form.Item name="county" label="户籍县/区">
        <Input />
      </Form.Item>
      <Form.Item name="isRural" valuePropName="checked">
        <Checkbox>农村户籍</Checkbox>
      </Form.Item>
      <Form.Item name="examLocationProvince" label="高考所在省">
        <Input placeholder="四川" />
      </Form.Item>
      <Form.Item name="examLocationCity" label="高考所在市">
        <Input />
      </Form.Item>
      <Form.Item name="examLocationCounty" label="高考所在县/区">
        <Input />
      </Form.Item>
    </div>
  );
}

function ExamFields() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Form.Item name="examType" label="科类">
          <Select
            placeholder="选择科类"
            options={[
              { value: 'PHYSICS', label: '物理类' },
              { value: 'HISTORY', label: '历史类' },
              { value: 'COMPREHENSIVE_LIBERAL', label: '文科综合' },
              { value: 'COMPREHENSIVE_SCIENCE', label: '理科综合' },
            ]}
          />
        </Form.Item>
        <Form.Item name="examYear" label="高考年份">
          <Select
            placeholder="年份"
            options={[
              { value: 2026, label: '2026' },
              { value: 2025, label: '2025' },
              { value: 2024, label: '2024' },
            ]}
          />
        </Form.Item>
        <Form.Item name="examSource" label="分数来源">
          <Select
            placeholder="来源"
            options={[
              { value: 'REAL_EXAM', label: '高考实考' },
              { value: 'MOCK_EXAM', label: '模考' },
              { value: 'ESTIMATED', label: '估分' },
            ]}
          />
        </Form.Item>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Item name="totalScore" label="总分">
          <InputNumber min={0} max={750} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="provincialRank" label="全省位次" extra="可由后端按一分一段自动计算，也可由老师校正。">
          <InputNumber min={1} style={{ width: '100%' }} />
        </Form.Item>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Form.Item name="scoreChinese" label="语文"><InputNumber min={0} max={150} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="scoreMath" label="数学"><InputNumber min={0} max={150} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="scoreEnglish" label="英语"><InputNumber min={0} max={150} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="scoreFirstChoice" label="首选科目分"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="scoreSub1" label="再选一"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="scoreSub2" label="再选二"><InputNumber min={0} max={100} style={{ width: '100%' }} /></Form.Item>
      </div>
    </>
  );
}

function BonusFields() {
  return (
    <>
      <Form.Item name="bonusPolicyStatus" label="加分政策状态">
        <Radio.Group>
          <Radio value="NONE">没有</Radio>
          <Radio value="HAS_BONUS">有</Radio>
          <Radio value="UNKNOWN">不清楚</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="bonusItems" label="加分细则">
        <Select mode="tags" placeholder="回车添加，例如 少数民族 +5" />
      </Form.Item>
    </>
  );
}

function HealthFields() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Item name="height" label="身高 (cm)"><InputNumber min={100} max={250} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="weight" label="体重 (kg)"><InputNumber min={20} max={200} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="visionLeft" label="左眼裸眼视力"><InputNumber min={1} max={5.3} step={0.1} style={{ width: '100%' }} /></Form.Item>
        <Form.Item name="visionRight" label="右眼裸眼视力"><InputNumber min={1} max={5.3} step={0.1} style={{ width: '100%' }} /></Form.Item>
      </div>
      <Form.Item name="colorBlind" valuePropName="checked"><Checkbox>色盲</Checkbox></Form.Item>
      <Form.Item name="colorWeak" valuePropName="checked"><Checkbox>色弱</Checkbox></Form.Item>
      <Form.Item name="physicalLimits" label="体检受限项"><Select mode="tags" allowClear /></Form.Item>
      <Form.Item name="medicalHistory" label="既往病史 / 特殊情况"><Input.TextArea rows={2} /></Form.Item>
    </>
  );
}

function PreferenceFields() {
  return (
    <>
      <Form.Item name="priorityMode" label="优先模式">
        <Radio.Group>
          <Radio value="UNIVERSITY_FIRST">院校优先</Radio>
          <Radio value="MAJOR_FIRST">专业优先</Radio>
          <Radio value="CITY_FIRST">城市优先</Radio>
          <Radio value="BALANCED">均衡</Radio>
        </Radio.Group>
      </Form.Item>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Item name="preferredProvinces" label="意向省份"><Select mode="tags" allowClear /></Form.Item>
        <Form.Item name="preferredCities" label="意向城市"><Select mode="tags" allowClear /></Form.Item>
        <Form.Item name="preferredMajors" label="意向专业"><Select mode="tags" allowClear /></Form.Item>
        <Form.Item name="preferredUniversities" label="意向院校"><Select mode="tags" allowClear /></Form.Item>
        <Form.Item name="excludedUniversities" label="排除院校"><Select mode="tags" allowClear /></Form.Item>
        <Form.Item name="excludedMajors" label="排除专业"><Select mode="tags" allowClear /></Form.Item>
      </div>
      <Form.Item name="careerDirection" label="职业方向"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="otherRequirements" label="其他要求"><Input.TextArea rows={2} /></Form.Item>
    </>
  );
}
