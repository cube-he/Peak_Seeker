'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { Alert, Button, Card, Cascader, Checkbox, Collapse, Form, Input, InputNumber, Modal, Radio, Select, Spin, message } from 'antd';
import {
  ArrowLeftOutlined,
  DownloadOutlined,
  FileTextOutlined,
  LockOutlined,
  SaveOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type BonusItem, type UpdateStudentDto } from '@/services/student-api';
import ProgressBar from '@/components/student/ProgressBar';
import BonusCalcCard from '@/components/policy/BonusCalcCard';
import { useProvinceOptions } from '@/components/student/picker/options/useProvinceOptions';
import { useCityOptions } from '@/components/student/picker/options/useCityOptions';
import { useUniversityOptions } from '@/components/student/picker/options/useUniversityOptions';
import { useMajorOptions } from '@/components/student/picker/options/useMajorOptions';
import { getRegionCascaderOptions, type CascaderOption } from '@/data/student-options';

type SelectOption = { label: string; value: string };

interface RankCheck {
  calculatedRank: number | null;
  currentRank: number | null;
  isMismatch: boolean;
  difference: number | null;
  requestedYear?: number | null;
  sourceYear?: number | null;
  isEstimated?: boolean;
  source: 'score-segment' | 'missing-input' | 'unavailable';
}

const BONUS_ITEM_OPTIONS: Array<SelectOption & { bonusValue: number }> = [
  { label: '自主就业退役士兵 +10', value: 'VETERAN_SELF_EMPLOYED', bonusValue: 10 },
  { label: '服役二等功/战区授荣退役军人 +20', value: 'VETERAN_MERIT_LEVEL_2_PLUS', bonusValue: 20 },
  { label: '归侨 +5', value: 'OVERSEAS_RETURNED', bonusValue: 5 },
  { label: '归侨子女/华侨子女 +5', value: 'OVERSEAS_CHILD', bonusValue: 5 },
  { label: '台湾省籍/台湾户籍 +5', value: 'TAIWAN_REGISTRY', bonusValue: 5 },
  { label: '烈士子女 +20', value: 'MARTYR_CHILD', bonusValue: 20 },
  { label: '三州十七县两区少数民族 +20', value: 'ETHNIC_AREA_MINORITY', bonusValue: 20 },
  { label: '三州十七县两区汉族 +10', value: 'ETHNIC_AREA_HAN', bonusValue: 10 },
  { label: '退役/现役军人优先录取', value: 'PRIORITY_RETIRED_OFFICER', bonusValue: 0 },
  { label: '残疾人民警察优先录取', value: 'PRIORITY_DISABLED_POLICE', bonusValue: 0 },
  { label: '5A 级青年志愿者优先录取', value: 'PRIORITY_5A_VOLUNTEER', bonusValue: 0 },
  { label: '公安英模/因公牺牲伤残民警子女优先录取', value: 'PRIORITY_POLICE_HERO_CHILD', bonusValue: 0 },
  { label: '见义勇为人员子女优先录取', value: 'PRIORITY_RIGHTEOUS_CHILD', bonusValue: 0 },
  { label: '军人子女优先录取', value: 'PRIORITY_MILITARY_CHILD', bonusValue: 0 },
  { label: '消防救援人员子女优先录取', value: 'PRIORITY_FIREFIGHTER_CHILD', bonusValue: 0 },
  { label: '司法行政人民警察子女优先录取', value: 'PRIORITY_JUDICIAL_POLICE_CHILD', bonusValue: 0 },
];

// 考试类型中文标签
const EXAM_TYPE_LABEL: Record<string, string> = {
  PHYSICS: '物理',
  HISTORY: '历史',
  COMPREHENSIVE_LIBERAL: '文科',
  COMPREHENSIVE_SCIENCE: '理科',
};

function toSelectValues(items?: BonusItem[] | string[]): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => (typeof item === 'string' ? item : item?.type))
    .filter((type): type is string => !!type);
}

function toBonusItems(types?: string[]): BonusItem[] {
  if (!Array.isArray(types)) return [];
  return types.map((type) => {
    const option = BONUS_ITEM_OPTIONS.find((item) => item.value === type);
    return {
      type,
      value: option?.bonusValue ?? 0,
      source: option?.label,
    };
  });
}

function pickerSelectProps(options: SelectOption[]) {
  return {
    mode: 'multiple' as const,
    allowClear: true,
    showSearch: true,
    optionFilterProp: 'label',
    options,
    style: { width: '100%' },
  };
}

function formatRank(rank: number | null | undefined) {
  return rank == null ? '-' : rank.toLocaleString('zh-CN');
}

// ── SOP 服务节点 ──
type SopNodeStatus = 'done' | 'active' | 'pending' | 'skipped';

interface SopNode {
  key: string;
  label: string;
  status: SopNodeStatus;
  timestamp?: Date | null;
  detail?: string;
}

function deriveSopNodes(student: any): SopNode[] {
  const intakeStatus = student?.intakeStatus;
  const plans: any[] = student?.volunteerPlans ?? [];
  const latestPlan = plans.reduce(
    (acc: any, p: any) =>
      !acc || (p.versionNo ?? 0) > (acc.versionNo ?? 0) ? p : acc,
    null,
  );
  const planStatus = latestPlan?.status;
  const planVersionNo = latestPlan?.versionNo;

  const signedAt = student?.createdAt ? new Date(student.createdAt) : null;
  const intakeSubmittedAt = student?.intakeSubmittedAt
    ? new Date(student.intakeSubmittedAt)
    : null;
  const planCreatedAt = latestPlan?.createdAt ? new Date(latestPlan.createdAt) : null;
  const planFinalizedAt = latestPlan?.finalizedAt
    ? new Date(latestPlan.finalizedAt)
    : null;

  // 节点 1: 签约
  const sign: SopNode = signedAt
    ? { key: 'sign', label: '签约', status: 'done', timestamp: signedAt }
    : { key: 'sign', label: '签约', status: 'pending' };

  // 节点 2: 资料采集
  let intake: SopNode;
  if (intakeStatus === 'VERIFIED') {
    intake = { key: 'intake', label: '资料采集', status: 'done', timestamp: intakeSubmittedAt };
  } else if (intakeStatus === 'SUBMITTED' || intakeStatus === 'NEEDS_CHANGES') {
    intake = {
      key: 'intake',
      label: '资料采集',
      status: 'active',
      timestamp: intakeSubmittedAt,
      detail: intakeStatus === 'NEEDS_CHANGES' ? '需修改' : '待审',
    };
  } else {
    intake = { key: 'intake', label: '资料采集', status: 'pending' };
  }

  // 节点 3: 方案制作
  let drafting: SopNode;
  if (!latestPlan) {
    drafting = { key: 'drafting', label: '方案制作', status: 'pending' };
  } else if (planStatus === 'DRAFT') {
    drafting = {
      key: 'drafting',
      label: '方案制作',
      status: 'active',
      timestamp: planCreatedAt,
      detail: `v${planVersionNo} 草稿`,
    };
  } else {
    drafting = {
      key: 'drafting',
      label: '方案制作',
      status: 'done',
      timestamp: planCreatedAt,
      detail: `v${planVersionNo}`,
    };
  }

  // 节点 4: 主管审核
  let supReview: SopNode;
  if (!latestPlan || planStatus === 'DRAFT') {
    supReview = { key: 'supervisor-review', label: '主管审核', status: 'pending' };
  } else if (planStatus === 'PENDING_REVIEW' || planStatus === 'REVIEWING') {
    supReview = {
      key: 'supervisor-review',
      label: '主管审核',
      status: 'active',
      detail: planStatus === 'REVIEWING' ? '审核中' : '待审核',
    };
  } else if (planStatus === 'REJECTED') {
    supReview = {
      key: 'supervisor-review',
      label: '主管审核',
      status: 'active',
      detail: '已退回 待修改',
    };
  } else {
    supReview = { key: 'supervisor-review', label: '主管审核', status: 'done' };
  }

  // 节点 5: 家长确认
  let parentConfirm: SopNode;
  if (
    !latestPlan ||
    ['DRAFT', 'PENDING_REVIEW', 'REVIEWING', 'REJECTED'].includes(planStatus)
  ) {
    parentConfirm = { key: 'parent-confirm', label: '家长确认', status: 'pending' };
  } else if (planStatus === 'APPROVED') {
    parentConfirm = {
      key: 'parent-confirm',
      label: '家长确认',
      status: 'active',
      detail: '等家长确认',
    };
  } else {
    parentConfirm = { key: 'parent-confirm', label: '家长确认', status: 'done' };
  }

  // 节点 6: 终稿
  let finalize: SopNode;
  if (
    !latestPlan ||
    ['DRAFT', 'PENDING_REVIEW', 'REVIEWING', 'REJECTED', 'APPROVED'].includes(planStatus)
  ) {
    finalize = { key: 'finalize', label: '终稿', status: 'pending' };
  } else if (planStatus === 'PARENT_CONFIRMED') {
    finalize = { key: 'finalize', label: '终稿', status: 'active', detail: '待定稿' };
  } else if (planStatus === 'FINALIZED' || planStatus === 'PUBLISHED') {
    finalize = {
      key: 'finalize',
      label: '终稿',
      status: 'done',
      timestamp: planFinalizedAt,
    };
  } else {
    finalize = { key: 'finalize', label: '终稿', status: 'pending' };
  }

  // 节点 7: 已提交
  let submit: SopNode;
  if (planStatus === 'PUBLISHED') {
    submit = { key: 'submit', label: '已提交', status: 'done' };
  } else if (planStatus === 'FINALIZED') {
    submit = {
      key: 'submit',
      label: '已提交',
      status: 'active',
      detail: '待提交考试院',
    };
  } else {
    submit = { key: 'submit', label: '已提交', status: 'pending' };
  }

  return [sign, intake, drafting, supReview, parentConfirm, finalize, submit];
}

function RankCheckExtra({ rankCheck }: { rankCheck?: RankCheck }) {
  if (!rankCheck || rankCheck.source === 'missing-input') {
    return <span>可由后端按一分一段自动计算，也可由老师校正。</span>;
  }

  if (rankCheck.source === 'unavailable' || rankCheck.calculatedRank == null) {
    if (rankCheck.currentRank != null) {
      return <span className="text-amber-600">当前位次已保存；对应年份一分一段暂不可用，系统暂不能自动校验。</span>;
    }
    return <span className="text-amber-600">对应年份一分一段暂不可用，请先手动填写位次。</span>;
  }

  const sourceLabel =
    rankCheck.isEstimated && rankCheck.sourceYear
      ? `按 ${rankCheck.sourceYear} 一分一段估算`
      : '系统一分一段';
  const estimateNote =
    rankCheck.isEstimated && rankCheck.requestedYear && rankCheck.sourceYear
      ? `（${rankCheck.requestedYear} 数据未出，暂用于校验）`
      : '';

  if (rankCheck.isMismatch && rankCheck.currentRank != null) {
    return (
      <span className="font-medium text-red-600">
        {sourceLabel}：{formatRank(rankCheck.calculatedRank)} 位{estimateNote}；当前填写：{formatRank(rankCheck.currentRank)} 位；
        相差 {formatRank(Math.abs(rankCheck.difference ?? 0))} 位，请核对。
      </span>
    );
  }

  return (
    <span className="text-text-tertiary">
      {sourceLabel}：{formatRank(rankCheck.calculatedRank)} 位{estimateNote}，当前填写与系统计算一致。
    </span>
  );
}

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const studentId = params.id;
  const router = useRouter();
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

  const reviewIntakeMutation = useMutation({
    mutationFn: (data: { action: 'VERIFY' | 'REQUEST_CHANGE'; comment?: string }) =>
      studentApi.reviewIntake(studentId, data),
    onSuccess: () => {
      message.success('资料状态已更新');
      queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
    },
    onError: (error: any) => {
      message.error(error?.response?.data?.message ?? '资料审核失败');
    },
  });

  const onRequestIntakeChange = () => {
    let comment = '';
    Modal.confirm({
      title: '退回学生资料',
      content: (
        <Input.TextArea
          rows={4}
          placeholder="说明需要学生补充或修改的资料"
          onChange={(event) => { comment = event.target.value; }}
        />
      ),
      okText: '退回',
      cancelText: '取消',
      onOk: () => reviewIntakeMutation.mutate({ action: 'REQUEST_CHANGE', comment }),
    });
  };

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

  const plansSummary = useMemo(() => {
    const plans = student?.volunteerPlans;
    if (!Array.isArray(plans) || plans.length === 0) {
      return null;
    }
    const latest = plans.reduce(
      (acc: any, p: any) => (!acc || (p.versionNo ?? 0) > (acc.versionNo ?? 0) ? p : acc),
      null,
    );
    return {
      activePlanCount: plans.length,
      latestPlanStatus: latest?.status ?? null,
      latestPlanVersionNo: latest?.versionNo ?? null,
    };
  }, [student?.volunteerPlans]);

  const sopNodes = useMemo(() => deriveSopNodes(student), [student]);

  if (isLoading || !student) {
    return (
      <div className="flex items-center justify-center py-32">
        <Spin size="large" />
      </div>
    );
  }

  const progress = student.progress;

  return (
    <div className="mx-auto max-w-[1040px] space-y-5">
      {/* 顶部摘要条 */}
      <StudentSummaryBar
        student={student}
        plansSummary={plansSummary}
        onBack={() => router.back()}
        onSave={() => form.validateFields().then((values) => saveMutation.mutate(values))}
        saving={saveMutation.isPending}
      />

      {/* 原有操作栏：导出/退回/确认/生成方案 */}
      <div className="flex flex-wrap gap-3">
        <Button icon={<DownloadOutlined />} onClick={onExportIntake}>
          导出登记表
        </Button>
        {student.intakeStatus !== 'VERIFIED' ? (
          <>
            <Button onClick={onRequestIntakeChange} loading={reviewIntakeMutation.isPending}>
              退回资料
            </Button>
            <Button
              type="primary"
              onClick={() => reviewIntakeMutation.mutate({ action: 'VERIFY', comment: '资料已核验' })}
              loading={reviewIntakeMutation.isPending}
            >
              确认资料
            </Button>
          </>
        ) : null}
        <Link href={`/teacher/plans/generate/${studentId}`}>
          <Button
            icon={<FileTextOutlined />}
            type="primary"
            disabled={(progress && !progress.isRecommendable) || student.intakeStatus !== 'VERIFIED'}
            title={student.intakeStatus !== 'VERIFIED' ? '需先确认学生资料' : progress && !progress.isRecommendable ? '档案未达到可推荐阈值，请先补全关键字段' : ''}
            className="border-0"
          >
            生成方案
          </Button>
        </Link>
      </div>

      {/* 左主右副两栏 */}
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* 主区 */}
        <div className="space-y-4">
          {/* SOP 时间轴 */}
          <SopTimeline nodes={sopNodes} />

          {/* 进度条 */}
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

          {/* 原 6 个折叠区 Field Cards 保留在主区 */}
          <Card className="rounded-2xl shadow-card">
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                ...student,
                ...student.user,
                provincialRank: student.provincialRank ?? student.rankCheck?.calculatedRank ?? undefined,
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
                  { key: 'exam', label: '考试成绩', children: <ExamFields rankCheck={student.rankCheck} /> },
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
            </Form>
          </Card>

          {progress && !progress.isRecommendable ? (
            <Alert
              type="info"
              showIcon
              message={'档案未达到“可推荐”阈值'}
              description="补完整分数、位次、加分、选科等关键字段后，生成方案按钮才会启用。"
            />
          ) : null}
        </div>

        {/* 副区 */}
        <div className="space-y-4">
          {/* 联系块 + 关键数据 — Task 3 会填充 */}
          <div data-slot="side-panel-placeholder" />
        </div>
      </div>
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
  const form = Form.useFormInstance();
  const regionOptions = getRegionCascaderOptions();

  const copyHukouToExamLocation = () => {
    form.setFieldsValue({
      examLocationProvince: form.getFieldValue('province') ?? null,
      examLocationCity: form.getFieldValue('city') ?? null,
      examLocationCounty: form.getFieldValue('county') ?? null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-start">
        <RegionCascaderField
          label="户籍所在地"
          fieldKeys={['province', 'city', 'county']}
          options={regionOptions}
          placeholder="选择户籍省 / 市 / 县区"
        />
        <Form.Item name="isRural" valuePropName="checked" className="lg:pt-[30px]">
          <Checkbox>农村户籍</Checkbox>
        </Form.Item>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_160px] lg:items-start">
        <RegionCascaderField
          label="高考报名地"
          fieldKeys={['examLocationProvince', 'examLocationCity', 'examLocationCounty']}
          options={regionOptions}
          placeholder="选择报名省 / 市 / 县区"
        />
        <Button icon={<SwapOutlined />} onClick={copyHukouToExamLocation} className="lg:mt-[30px]">
          同户籍所在地
        </Button>
      </div>
    </div>
  );
}

function RegionCascaderField({
  label,
  fieldKeys,
  options,
  placeholder,
}: {
  label: string;
  fieldKeys: [string, string, string];
  options: CascaderOption[];
  placeholder: string;
}) {
  const form = Form.useFormInstance();
  const province = Form.useWatch(fieldKeys[0], form);
  const city = Form.useWatch(fieldKeys[1], form);
  const county = Form.useWatch(fieldKeys[2], form);
  const value = [province, city, county].filter(Boolean) as string[];

  const handleChange = (values?: (string | number)[]) => {
    const [nextProvince, nextCity, nextCounty] = values ?? [];
    form.setFieldsValue({
      [fieldKeys[0]]: nextProvince ? String(nextProvince) : null,
      [fieldKeys[1]]: nextCity ? String(nextCity) : null,
      [fieldKeys[2]]: nextCounty ? String(nextCounty) : null,
    });
  };

  return (
    <>
      <Form.Item name={fieldKeys[0]} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={fieldKeys[1]} hidden>
        <Input />
      </Form.Item>
      <Form.Item name={fieldKeys[2]} hidden>
        <Input />
      </Form.Item>
      <Form.Item label={label}>
        <Cascader
          aria-label={label}
          value={value.length > 0 ? value : undefined}
          onChange={handleChange}
          options={options}
          placeholder={placeholder}
          changeOnSelect
          showSearch={{
            filter: (input, path) => path.some((option) => String(option.label).includes(input)),
          }}
          style={{ width: '100%' }}
        />
      </Form.Item>
    </>
  );
}

function ExamFields({ rankCheck }: { rankCheck?: RankCheck }) {
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
        <Form.Item name="provincialRank" label="全省位次" extra={<RankCheckExtra rankCheck={rankCheck} />}>
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
      <Form.Item
        name="bonusItems"
        label="加分细则"
        getValueProps={(items) => ({ value: toSelectValues(items) })}
        normalize={(types) => toBonusItems(types)}
      >
        <Select
          mode="multiple"
          allowClear
          showSearch
          optionFilterProp="label"
          options={BONUS_ITEM_OPTIONS}
          placeholder="选择加分或优先录取项"
        />
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
  const { data: provinceOptions } = useProvinceOptions();
  const { data: cityOptions } = useCityOptions();
  const { data: universityOptions, isLoading: isUniversityLoading } = useUniversityOptions();
  const { data: majorOptions, isLoading: isMajorLoading } = useMajorOptions();

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
        <Form.Item name="preferredProvinces" label="意向省份">
          <Select {...pickerSelectProps(provinceOptions)} placeholder="选择省份" />
        </Form.Item>
        <Form.Item name="preferredCities" label="意向城市">
          <Select {...pickerSelectProps(cityOptions)} placeholder="选择城市" />
        </Form.Item>
        <Form.Item name="preferredMajors" label="意向专业">
          <Select {...pickerSelectProps(majorOptions)} loading={isMajorLoading} placeholder="搜索专业" />
        </Form.Item>
        <Form.Item name="preferredUniversities" label="意向院校">
          <Select {...pickerSelectProps(universityOptions)} loading={isUniversityLoading} placeholder="搜索院校" />
        </Form.Item>
        <Form.Item name="excludedUniversities" label="排除院校">
          <Select {...pickerSelectProps(universityOptions)} loading={isUniversityLoading} placeholder="搜索院校" />
        </Form.Item>
        <Form.Item name="excludedMajors" label="排除专业">
          <Select {...pickerSelectProps(majorOptions)} loading={isMajorLoading} placeholder="搜索专业" />
        </Form.Item>
      </div>
      <Form.Item name="careerDirection" label="职业方向"><Input.TextArea rows={2} /></Form.Item>
      <Form.Item name="otherRequirements" label="其他要求"><Input.TextArea rows={2} /></Form.Item>
    </>
  );
}

// ── 顶部摘要条:身份 + 关键摘要 + 操作 ──
function StudentSummaryBar({
  student,
  plansSummary,
  onBack,
  onSave,
  saving,
}: {
  student: any;
  plansSummary: { activePlanCount: number; latestPlanStatus: string | null; latestPlanVersionNo: number | null } | null;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const name = student?.user?.realName || student?.realName || student?.username || '学生';
  const examType = student?.examType ? EXAM_TYPE_LABEL[student.examType] ?? student.examType : '--';
  const totalScore = student?.totalScore ?? null;
  const provincialRank = student?.provincialRank ?? null;
  const signedAt = student?.createdAt ? new Date(student.createdAt) : null;
  const daysServed = signedAt
    ? Math.floor((Date.now() - signedAt.getTime()) / 86_400_000)
    : null;

  return (
    <header className="rounded-2xl bg-surface px-6 py-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label="返回" />
            <h1 className="m-0 text-xl font-semibold text-text">{name}</h1>
            <span className="text-sm text-text-muted">· {examType}</span>
            {totalScore != null ? (
              <span className="text-sm text-text-muted">· 总分 {totalScore}</span>
            ) : null}
            {provincialRank != null ? (
              <span className="text-sm text-text-muted">
                · 位次 {provincialRank.toLocaleString('zh-CN')}
              </span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-text-muted">
            {signedAt ? <span>签约 {signedAt.toLocaleDateString('zh-CN')}</span> : null}
            {daysServed != null ? <span>· 服务 {daysServed} 天</span> : null}
            {plansSummary?.latestPlanStatus ? (
              <span>
                · 当前方案 v{plansSummary.latestPlanVersionNo ?? '?'} · {plansSummary.latestPlanStatus}
              </span>
            ) : null}
          </p>
        </div>
        <div className="flex gap-2">
          <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={onSave}>
            保存
          </Button>
        </div>
      </div>
    </header>
  );
}

function SopTimeline({ nodes }: { nodes: SopNode[] }) {
  return (
    <Card title="服务进度" size="small">
      <ol className="m-0 list-none space-y-3 p-0">
        {nodes.map((node, i) => {
          const isLast = i === nodes.length - 1;
          return (
            <li key={node.key} className="relative pl-6">
              <span
                aria-hidden
                className={`absolute left-0 top-1 inline-flex h-4 w-4 items-center justify-center rounded-full ${
                  node.status === 'done'
                    ? 'bg-safe text-white'
                    : node.status === 'active'
                      ? 'bg-accent text-white'
                      : node.status === 'skipped'
                        ? 'bg-text-muted text-white'
                        : 'border-2 border-text-muted bg-surface'
                }`}
              >
                {node.status === 'done' ? '✓' : node.status === 'active' ? '●' : ''}
              </span>
              {!isLast ? (
                <span
                  aria-hidden
                  className="absolute left-[7px] top-5 h-full w-0.5 bg-border-subtle"
                />
              ) : null}
              <div>
                <p
                  className={`m-0 text-sm ${
                    node.status === 'active' ? 'font-medium text-text' : 'text-text'
                  }`}
                >
                  {node.label}
                  {node.detail ? (
                    <span className="ml-2 text-xs text-text-muted">{node.detail}</span>
                  ) : null}
                </p>
                {node.timestamp ? (
                  <p className="m-0 text-xs text-text-muted">
                    {node.timestamp.toLocaleDateString('zh-CN')}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
