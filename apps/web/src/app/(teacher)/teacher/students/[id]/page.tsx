'use client';

import {
  Card,
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Checkbox,
  Collapse,
  Button,
  Tag,
  Spin,
  Alert,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  FileTextOutlined,
  DownloadOutlined,
  LockOutlined,
} from '@ant-design/icons';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentApi, type UpdateStudentDto } from '@/services/student-api';
import ProgressBar from '@/components/student/ProgressBar';
import HealthCheckboxGroup from '@/components/student/HealthCheckboxGroup';

/**
 * 老师端学生详情页 (M6.1+M6.3)
 *
 * 替换原 4 Tab 表单为 Collapse 8 分组单页 form。
 * 顶部新增：
 * - 双进度条（自填 / 录入 / 总进度） + recommend gate 提示
 * - 导出登记表按钮（xlsx 流式下载）
 *
 * ① 老师独占字段在分组 title 加 LockOutlined 图标。
 */
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

  const student: Record<string, any> | undefined =
    (studentData as any)?.data ?? studentData;

  const saveMutation = useMutation({
    mutationFn: (values: Record<string, unknown>) =>
      studentApi.update(studentId, {
        ...values,
        dataVersion: student?.dataVersion,
      } as UpdateStudentDto),
    onSuccess: () => {
      void message.success('保存成功');
      queryClient.invalidateQueries({
        queryKey: ['student-detail', studentId],
      });
    },
    onError: (error: any) => {
      if (error?.response?.status === 409) {
        void message.error('数据已被其他人修改，请刷新后重试');
      } else {
        void message.error(error?.response?.data?.message ?? '保存失败');
      }
    },
  });

  const onSave = () => {
    form.validateFields().then((values) => {
      saveMutation.mutate(values);
    });
  };

  const onExportIntake = async () => {
    try {
      const blob = await studentApi.exportIntake(studentId);
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      const name = student?.user?.realName ?? `student${studentId}`;
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `intake_${name}_${today}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      void message.success('登记表已下载');
    } catch (e: any) {
      void message.error(e?.message ?? '导出失败');
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

  return (
    <div className="mx-auto max-w-[1000px] space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <Link
            href="/teacher/students"
            className="mb-2 inline-flex items-center gap-2 text-sm text-text-tertiary no-underline transition-colors hover:text-primary"
          >
            <ArrowLeftOutlined /> 返回学生列表
          </Link>
          <h1 className="font-serif text-xl font-semibold text-text">
            {student.user?.realName || student.user?.username || '学生详情'}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Tag color={student.status === 'FINALIZED' ? 'green' : 'blue'}>
            {student.status || 'ACTIVE'}
          </Tag>
          <Button icon={<DownloadOutlined />} onClick={onExportIntake}>
            导出登记表
          </Button>
          <Link href={`/teacher/plans/generate/${studentId}`}>
            <Button
              icon={<FileTextOutlined />}
              type="primary"
              disabled={progress && !progress.isRecommendable}
              title={
                progress && !progress.isRecommendable
                  ? '档案未达可推荐阈值，请先补完关键字段'
                  : ''
              }
            >
              生成方案
            </Button>
          </Link>
        </div>
      </div>

      {/* Progress 三条 + recommend gate */}
      {progress && (
        <Card size="small">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <ProgressBar
              label="学生自填进度"
              percent={progress.studentSelfCompleteness}
            />
            <ProgressBar
              label="老师录入进度"
              percent={progress.teacherDataCompleteness}
            />
          </div>
          <div className="mt-3">
            <ProgressBar
              label="档案总进度"
              percent={progress.overallCompleteness}
            />
          </div>
          {!progress.isRecommendable &&
            progress.missingFieldsForRecommend?.length > 0 && (
              <p className="mt-2 text-xs text-text-faint">
                档案未达可推荐阈值，缺：
                <span className="ml-1 text-text-secondary">
                  {progress.missingFieldsForRecommend.slice(0, 8).join('、')}
                  {progress.missingFieldsForRecommend.length > 8 ? ' 等' : ''}
                </span>
              </p>
            )}
        </Card>
      )}

      {/* Form */}
      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            ...student,
            ...student.user, // user 上的 realName/phone/gender/ethnicity 平铺
          }}
          requiredMark="optional"
        >
          <Collapse
            defaultActiveKey={['basic', 'household', 'exam']}
            items={[
              {
                key: 'basic',
                label: '基本信息（②）',
                children: <BasicFields />,
              },
              {
                key: 'household',
                label: (
                  <span className="flex items-center gap-1">
                    <LockOutlined /> 户籍 + 高考所在地（① 老师独占）
                  </span>
                ),
                children: <HouseholdFields />,
              },
              {
                key: 'exam',
                label: '考试成绩（②，分数学生可填；位次自动计算）',
                children: <ExamFields />,
              },
              {
                key: 'bonus',
                label: (
                  <span className="flex items-center gap-1">
                    <LockOutlined /> 加分政策（① 老师独占）
                  </span>
                ),
                children: <BonusFields />,
              },
              {
                key: 'physical',
                label: '身体条件（②）',
                children: <PhysicalFields />,
              },
              {
                key: 'planning',
                label: '升学规划（②）',
                children: <PlanningFields />,
              },
              {
                key: 'preference',
                label: '偏好 / 排除 / 接受度（②）',
                children: <PreferenceFields />,
              },
              {
                key: 'misc',
                label: '兴趣 + 经济（②）',
                children: <MiscFields />,
              },
            ]}
          />

          <div className="mt-6 flex justify-end gap-3 border-t border-border-subtle pt-4">
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

      {progress && !progress.isRecommendable && (
        <Alert
          type="info"
          showIcon
          message="档案未达「可推荐」阈值"
          description="老师补完总分/位次/加分等关键字段，且学生 Stage 1 完成后，「生成方案」按钮才会启用。"
        />
      )}
    </div>
  );
}

// ── 字段分组组件 ──────────────────────────────────

function BasicFields() {
  return (
    <>
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
        <Form.Item name="formFiller" label="填表人">
          <Radio.Group>
            <Radio value="STUDENT">学生本人</Radio>
            <Radio value="PARENT">家长</Radio>
            <Radio value="TOGETHER">共同</Radio>
          </Radio.Group>
        </Form.Item>
      </div>
    </>
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
              { value: 'PHYSICS', label: '物理类（首选物理）' },
              { value: 'HISTORY', label: '历史类（首选历史）' },
              { value: 'COMPREHENSIVE_LIBERAL', label: '文科综合（旧）' },
              { value: 'COMPREHENSIVE_SCIENCE', label: '理科综合（旧）' },
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
        <Form.Item name="firstChoice" label="首选科目">
          <Select
            placeholder="物理 / 历史"
            allowClear
            options={[
              { value: '物理', label: '物理' },
              { value: '历史', label: '历史' },
            ]}
          />
        </Form.Item>
        <Form.Item
          name="reChoices"
          label="再选科目（任选 2 门）"
          rules={[
            {
              validator: (_, v) => {
                if (!v || v.length === 0) return Promise.resolve();
                if (v.length === 2) return Promise.resolve();
                return Promise.reject(new Error('需要正好 2 门'));
              },
            },
          ]}
        >
          <Select
            mode="multiple"
            maxCount={2}
            placeholder="化学/生物/政治/地理 选 2 门"
            options={[
              { value: '化学', label: '化学' },
              { value: '生物', label: '生物' },
              { value: '政治', label: '政治' },
              { value: '地理', label: '地理' },
            ]}
          />
        </Form.Item>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Item name="totalScore" label="总分">
          <InputNumber min={0} max={750} className="w-full" />
        </Form.Item>
        <Form.Item
          name="provincialRank"
          label="全省位次"
          extra="由总分+科类+一分一段表自动计算（保存时刷新）"
        >
          <InputNumber min={1} className="w-full" disabled />
        </Form.Item>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Form.Item name="scoreChinese" label="语文">
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreMath" label="数学">
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreEnglish" label="英语">
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreFirstChoice" label="首选科目分">
          <InputNumber min={0} max={100} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreSub1" label="再选 1 分">
          <InputNumber min={0} max={100} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreSub2" label="再选 2 分">
          <InputNumber min={0} max={100} className="w-full" />
        </Form.Item>
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
      <Form.List name="bonusItems">
        {(items, { add, remove }) => (
          <div className="space-y-2">
            {items.map(({ key, name }) => (
              <div key={key} className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                <Form.Item
                  name={[name, 'type']}
                  label="加分类型"
                  className="sm:col-span-5"
                  rules={[{ required: true }]}
                >
                  <Input placeholder="如 少数民族 / 烈士子女" />
                </Form.Item>
                <Form.Item
                  name={[name, 'value']}
                  label="分值"
                  className="sm:col-span-3"
                  rules={[{ required: true }]}
                >
                  <InputNumber min={0} max={50} className="w-full" />
                </Form.Item>
                <Form.Item
                  name={[name, 'source']}
                  label="备注"
                  className="sm:col-span-3"
                >
                  <Input placeholder="可选" />
                </Form.Item>
                <div className="flex items-end sm:col-span-1">
                  <Button danger size="small" onClick={() => remove(name)}>
                    删
                  </Button>
                </div>
              </div>
            ))}
            <Button
              type="dashed"
              onClick={() => add({ type: '', value: 0, source: '' })}
              block
            >
              + 添加加分项
            </Button>
          </div>
        )}
      </Form.List>
    </>
  );
}

function PhysicalFields() {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Form.Item name="height" label="身高 (cm)">
          <InputNumber min={100} max={250} className="w-full" />
        </Form.Item>
        <Form.Item name="weight" label="体重 (kg)">
          <InputNumber min={20} max={200} className="w-full" />
        </Form.Item>
        <Form.Item name="visionLeft" label="左眼裸眼视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
        <Form.Item name="visionRight" label="右眼裸眼视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
        <Form.Item name="visionLeftCorrected" label="左眼矫正">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
        <Form.Item name="visionRightCorrected" label="右眼矫正">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
      </div>
      <Form.Item name="colorBlind" valuePropName="checked">
        <Checkbox>色盲</Checkbox>
      </Form.Item>
      <Form.Item name="colorWeak" valuePropName="checked">
        <Checkbox>色弱</Checkbox>
      </Form.Item>
      <Form.Item name="physicalLimits" label="体检受限项">
        <HealthCheckboxGroup />
      </Form.Item>
      <Form.Item name="medicalHistory" label="既往病史 / 特殊情况">
        <Input.TextArea rows={2} />
      </Form.Item>
    </>
  );
}

function PlanningFields() {
  return (
    <>
      <Form.Item name="priorityMode" label="院校 / 专业优先">
        <Radio.Group>
          <Radio value="UNIVERSITY_FIRST">院校优先</Radio>
          <Radio value="MAJOR_FIRST">专业优先</Radio>
          <Radio value="CITY_FIRST">城市优先</Radio>
          <Radio value="BALANCED">兼顾</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="careerPlan" label="升学规划">
        <Select
          allowClear
          options={[
            { value: 'POSTGRADUATE', label: '考研深造' },
            { value: 'EMPLOYMENT', label: '本科就业' },
            { value: 'ABROAD', label: '出国留学' },
            { value: 'PUBLIC_SERVANT', label: '公务员/事业编' },
            { value: 'UNDECIDED', label: '未定' },
          ]}
        />
      </Form.Item>
      <Form.Item name="careerDirection" label="职业方向">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="preferredBatches" label="意向批次">
        <Select
          mode="multiple"
          allowClear
          options={[
            { value: 'EARLY_BATCH', label: '提前批' },
            { value: 'FIRST_BATCH', label: '本科批' },
            { value: 'SECOND_BATCH', label: '专科批' },
            { value: 'SPECIAL_BATCH', label: '专项计划' },
          ]}
        />
      </Form.Item>
      <Form.Item name="militaryInterest" valuePropName="checked">
        <Checkbox>对军校/军事专业感兴趣</Checkbox>
      </Form.Item>
      <Form.Item name="teacherInterest" valuePropName="checked">
        <Checkbox>对师范专业感兴趣</Checkbox>
      </Form.Item>
    </>
  );
}

function PreferenceFields() {
  return (
    <>
      <Form.Item name="stayPreference" label="在省内/外读书偏好">
        <Radio.Group>
          <Radio value="LOCAL_ONLY">仅省内</Radio>
          <Radio value="PREFER_LOCAL">偏好省内</Radio>
          <Radio value="NO_PREFERENCE">无所谓</Radio>
          <Radio value="PREFER_OUTSIDE">偏好省外</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="preferredProvinces" label="意向省份">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="preferredCities" label="意向城市">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="preferredMajors" label="意向专业">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="preferredUniversities" label="意向院校">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="preferredMajorCategories" label="意向专业大类">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="preferredTags" label="偏好标签">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="excludedProvinces" label="不接受的省份">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="excludedCities" label="不接受的城市">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="excludedUniversities" label="不接受的院校">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="excludedMajors" label="不接受的专业">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="remoteAreaAcceptance" label="偏远地区接受度">
        <Radio.Group>
          <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
          <Radio value="BACKUP_ONLY">仅保底可接受</Radio>
          <Radio value="FAMOUS_OK">名校可接受</Radio>
          <Radio value="GOOD_MAJOR_OK">好专业可接受</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="coldMajorAcceptance" label="冷门专业接受度">
        <Radio.Group>
          <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
          <Radio value="FAMOUS_OK">名校可接受</Radio>
          <Radio value="DEVELOPED_AREA_OK">发达地区可接受</Radio>
          <Radio value="GOOD_PROSPECT_OK">前景好可接受</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="acceptLevel" label="其他专业接受度（旧）">
        <Radio.Group>
          <Radio value="STRICT">严格</Radio>
          <Radio value="MODERATE">中等</Radio>
          <Radio value="RELAXED">宽松</Radio>
          <Radio value="UNDECIDED">未定</Radio>
        </Radio.Group>
      </Form.Item>
    </>
  );
}

function MiscFields() {
  return (
    <>
      <Form.Item name="tuitionBudget" label="学费预算">
        <Radio.Group>
          <Radio value="LOW">经济敏感</Radio>
          <Radio value="MEDIUM">适中</Radio>
          <Radio value="HIGH">不限</Radio>
          <Radio value="UNLIMITED">无上限</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="acceptSinoForeign" valuePropName="checked">
        <Checkbox>接受中外合作办学</Checkbox>
      </Form.Item>
      <Form.Item name="acceptPrivate" label="是否接受民办">
        <Radio.Group>
          <Radio value="STRICT">不接受</Radio>
          <Radio value="MODERATE">部分接受</Radio>
          <Radio value="RELAXED">接受</Radio>
          <Radio value="UNDECIDED">未定</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="acceptCooperation" label="是否接受合作办学">
        <Radio.Group>
          <Radio value="STRICT">不接受</Radio>
          <Radio value="MODERATE">部分接受</Radio>
          <Radio value="RELAXED">接受</Radio>
          <Radio value="UNDECIDED">未定</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="otherRequirements" label="其他要求">
        <Input.TextArea rows={2} />
      </Form.Item>
      <Form.Item name="interests" label="兴趣爱好">
        <Select mode="tags" allowClear />
      </Form.Item>
      <Form.Item name="personalityType" label="性格类型">
        <Input />
      </Form.Item>
      <Form.Item name="selfDescription" label="自我描述">
        <Input.TextArea rows={3} />
      </Form.Item>
    </>
  );
}
