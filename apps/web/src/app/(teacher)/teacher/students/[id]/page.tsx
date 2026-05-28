'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import PrerequisiteCheckModal from '@/components/plan/PrerequisiteCheckModal';
import { Alert, Button, Card, Cascader, Checkbox, Collapse, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Spin, Tabs, message } from 'antd';
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
import { planApi } from '@/services/plan-api';
import { consultationApi, type Consultation } from '@/services/consultation-api';
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

type DetailTab = 'profile' | 'comm' | 'plan' | 'external' | 'log';

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

// 字段 key → 中文 label 映射(与后端 student-change-log.config.ts 保持一致)
const CHANGE_LOG_FIELD_LABEL: Record<string, string> = {
  examType: '选科类型',
  examYear: '高考年份',
  totalScore: '模考总分',
  provincialRank: '预测位次',
  firstChoice: '首选科目',
  reChoices: '再选科目',
  subjectScores: '科目成绩',
  bonusPolicyStatus: '加分政策状态',
  bonusItems: '加分项目',
  province: '省份',
  city: '城市',
  county: '区县',
  isRural: '农村户口',
  examLocationProvince: '高考所在省',
  examLocationCity: '高考所在市',
  examLocationCounty: '高考所在县',
  preferredProvinces: '意向省份',
  preferredCities: '意向城市',
  preferredMajors: '意向专业',
  preferredMajorCategories: '意向专业类别',
  preferredUniversities: '意向院校',
  excludedCities: '排除城市',
  excludedMajors: '排除专业',
  stayPreference: '留省偏好',
  acceptLevel: '调剂接受度',
  colorBlind: '色盲',
  colorWeak: '色弱',
  height: '身高',
  weight: '体重',
  visionLeft: '左眼视力',
  visionRight: '右眼视力',
  careerPlan: '升学规划',
  priorityMode: '优先模式',
  tuitionBudget: '学费预算',
};

function formatFieldValue(value: string | null): string {
  if (value === null) return '空';
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.length === 0 ? '空' : parsed.slice(0, 3).join(', ') + (parsed.length > 3 ? '...' : '');
      }
      return JSON.stringify(parsed);
    } catch {
      return value;
    }
  }
  return value;
}

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
  const [showPrereqModal, setShowPrereqModal] = useState(false);

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

  // Tab state: 资料/沟通/方案/对外材料/变更日志
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as DetailTab) || 'profile';
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);

  const handleTabChange = (key: string) => {
    const next = key as DetailTab;
    setActiveTab(next);
    const sp = new URLSearchParams(window.location.search);
    sp.set('tab', next);
    router.replace(`?${sp.toString()}`, { scroll: false });
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
        <Button
          icon={<FileTextOutlined />}
          type="primary"
          disabled={(progress && !progress.isRecommendable) || student.intakeStatus !== 'VERIFIED'}
          title={student.intakeStatus !== 'VERIFIED' ? '需先确认学生资料' : progress && !progress.isRecommendable ? '档案未达到可推荐阈值，请先补全关键字段' : ''}
          className="border-0"
          onClick={() => setShowPrereqModal(true)}
        >
          生成方案
        </Button>
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
              {!progress.isRecommendable ? (
                <p className="mt-3 text-xs text-text-faint">
                  未达可推荐阈值。具体缺项见下方"还缺 X 项关键资料"chip 列表。
                </p>
              ) : null}
            </Card>
          ) : null}

          <Tabs
            activeKey={activeTab}
            onChange={handleTabChange}
            items={[
              {
                key: 'profile',
                label: (() => {
                  const checks = getFieldChecks(student);
                  const missingCount = checks.filter((c) => !c.passed).length;
                  return (
                    <span>
                      资料
                      {missingCount > 0 ? (
                        <span className="ml-1 inline-block rounded-full bg-rush px-1.5 text-[10px] font-medium text-white">
                          {missingCount}
                        </span>
                      ) : null}
                    </span>
                  );
                })(),
                children: (
                  <div className="space-y-4 pt-2">
                    <DataCompletenessHeader student={student} />
                    <Card className="rounded-2xl shadow-card">
                      <Form
                        form={form}
                        layout="vertical"
                        initialValues={{
                          ...student,
                          ...student.user,
                          provincialRank: student.provincialRank ?? student.rankCheck?.calculatedRank ?? undefined,
                        }}
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
                        message={'档案未达到"可推荐"阈值'}
                        description="补完整分数、位次、加分、选科等关键字段后，生成方案按钮才会启用。"
                      />
                    ) : null}
                  </div>
                ),
              },
              {
                key: 'comm',
                label: '沟通记录',
                children: <CommunicationTabContent studentId={studentId} />,
              },
              {
                key: 'plan',
                label: '方案',
                children: <PlanListTabContent student={student} />,
              },
              {
                key: 'external',
                label: '对外材料',
                children: (
                  <ExternalMaterialsTabContent student={student} />
                ),
              },
              {
                key: 'log',
                label: '变更日志',
                children: <ChangeLogTabContent studentId={studentId} />,
              },
            ]}
          />
        </div>

        {/* 副区 */}
        <div className="space-y-4">
          <ContactPanel student={student} />
          <KeyDataPanel student={student} />
        </div>
      </div>

      {showPrereqModal && student ? (
        <PrerequisiteCheckModal
          open={showPrereqModal}
          student={student}
          onCancel={() => setShowPrereqModal(false)}
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
                // 之前 h-full 只到 li 底端, 跨不过 space-y-3 (12px) gap, 视觉断开.
                // -bottom-3 让连线延伸到下一节点圆位置, 形成完整 timeline 线
                <span
                  aria-hidden
                  className="absolute left-[7px] top-5 -bottom-3 w-0.5 bg-border-subtle"
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

function ContactPanel({ student }: { student: any }) {
  const studentPhone = student?.user?.phone ?? null;
  const parentPhone = student?.parentPhone ?? null;

  const callPhone = (phone: string) => {
    window.location.href = `tel:${phone}`;
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(`${label}已复制`);
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <Card title="联系方式" size="small">
      <div className="space-y-3">
        <div>
          <p className="m-0 text-xs font-medium text-text-muted">学生</p>
          {studentPhone ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{studentPhone}</span>
              <div className="flex gap-1">
                <Button size="small" onClick={() => callPhone(studentPhone)}>拨号</Button>
                <Button size="small" onClick={() => copyToClipboard(studentPhone, '学生电话')}>复制</Button>
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-text-muted">--</p>
          )}
        </div>
        <div>
          <p className="m-0 text-xs font-medium text-text-muted">家长</p>
          {parentPhone ? (
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-sm">{parentPhone}</span>
              <div className="flex gap-1">
                <Button size="small" onClick={() => callPhone(parentPhone)}>拨号</Button>
                <Button size="small" onClick={() => copyToClipboard(parentPhone, '家长电话')}>复制</Button>
              </div>
            </div>
          ) : (
            <p className="m-0 text-sm text-text-muted">--</p>
          )}
        </div>
      </div>
    </Card>
  );
}

// MVP 实装 (Plan 10 版本对比按需后做): 列出该学生所有方案版本, 点击跳转到方案详情页
function PlanListTabContent({ student }: { student: any }) {
  const plans: any[] = student?.volunteerPlans ?? [];
  if (plans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-bg/30 p-12 text-center">
        <p className="m-0 text-text-muted">还没有方案</p>
        <p className="m-0 mt-2 text-xs text-text-muted">
          补全学生关键资料后, 用顶部"生成方案"按钮自动出方案
        </p>
      </div>
    );
  }
  return (
    <div className="pt-2">
      <ul className="m-0 list-none space-y-2 p-0">
        {plans.map((p) => (
          <li
            key={p.id}
            className="flex items-center justify-between rounded-md border border-border-subtle bg-surface px-3 py-2"
          >
            <div>
              <p className="m-0 text-sm font-medium text-text">
                v{p.versionNo}
                {p.versionNote ? ` · ${p.versionNote}` : ''}
                {p.isFinal ? (
                  <span className="ml-2 inline-block rounded bg-safe/15 px-1.5 text-[10px] font-medium text-safe">
                    终稿
                  </span>
                ) : null}
              </p>
              <p className="m-0 text-xs text-text-muted">
                {p.status} · 更新于 {new Date(p.updatedAt).toLocaleString('zh-CN')}
              </p>
            </div>
            <Link
              href={`/teacher/plans/${p.id}`}
              className="text-sm text-primary no-underline hover:underline"
            >
              查看 →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface FieldCheckInfo {
  key: string;
  label: string;
  passed: boolean;
}

function getFieldChecks(student: any): FieldCheckInfo[] {
  return [
    {
      key: 'subjects',
      label: '选科组合',
      passed:
        !!student?.examType &&
        !!student?.firstChoice &&
        Array.isArray(student?.reChoices) &&
        student.reChoices.length > 0,
    },
    {
      key: 'totalScore',
      label: '模考分',
      passed: typeof student?.totalScore === 'number' && student.totalScore > 0,
    },
    {
      key: 'rank',
      label: '预测位次',
      passed: typeof student?.provincialRank === 'number' && student.provincialRank > 0,
    },
    {
      key: 'cities',
      label: '意向城市',
      passed:
        (Array.isArray(student?.preferredCities) && student.preferredCities.length > 0) ||
        (Array.isArray(student?.excludedCities) && student.excludedCities.length > 0) ||
        !!student?.stayPreference,
    },
    {
      key: 'majors',
      label: '意向专业',
      passed:
        (Array.isArray(student?.preferredMajors) && student.preferredMajors.length > 0) ||
        (Array.isArray(student?.preferredMajorCategories) &&
          student.preferredMajorCategories.length > 0),
    },
    {
      key: 'bonusStatus',
      label: '加分政策',
      passed: !!student?.bonusPolicyStatus,
    },
    {
      key: 'health',
      label: '体检关键项',
      passed:
        typeof student?.colorBlind === 'boolean' && typeof student?.colorWeak === 'boolean',
    },
    {
      key: 'location',
      label: '生源地',
      passed: !!student?.province && !!student?.city,
    },
  ];
}

function DataCompletenessHeader({ student }: { student: any }) {
  const checks = getFieldChecks(student);
  const passedCount = checks.filter((c) => c.passed).length;
  const total = checks.length;
  const missing = checks.filter((c) => !c.passed);
  const percent = total > 0 ? Math.round((passedCount / total) * 100) : 0;
  const isRecommendable = passedCount === total;

  return (
    <div className="mb-4 rounded-lg border border-border-subtle bg-bg/30 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="m-0 text-sm">
          <span className="font-medium text-text">
            {isRecommendable ? (
              <span className="text-safe">关键资料就绪</span>
            ) : (
              <span className="text-rush">还缺 {missing.length} 项关键资料</span>
            )}
          </span>
          <span className="ml-2 text-text-muted">
            {passedCount}/{total} 字段 · 完整度 {percent}%
          </span>
        </p>
      </div>
      {missing.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {missing.map((m) => (
            <span
              key={m.key}
              className="inline-block rounded border border-rush bg-rush/10 px-2 py-0.5 text-[11px] font-medium text-rush"
            >
              {m.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ChangeLogTabContent({ studentId }: { studentId: string | number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['student-change-logs', studentId],
    queryFn: () => studentApi.getChangeLogs(studentId, { limit: 100 }),
    enabled: !!studentId,
  });

  if (isLoading) {
    return (
      <div className="rounded-lg bg-bg/30 py-12 text-center">
        <Spin />
      </div>
    );
  }

  const logs = data?.logs ?? [];
  if (logs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-bg/30 p-12 text-center">
        <p className="m-0 text-text-muted">暂无变更记录</p>
        <p className="m-0 mt-2 text-xs text-text-muted">
          学生 / 老师修改关键字段时会在这里显示
        </p>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <div className="mb-3 flex items-baseline justify-between">
        <p className="m-0 text-sm font-medium text-text">
          共 {data?.total ?? logs.length} 条变更
        </p>
        <p className="m-0 text-xs text-text-muted">按时间倒序</p>
      </div>
      <ol className="m-0 list-none space-y-2 p-0">
        {logs.map((log) => {
          const fieldLabel = CHANGE_LOG_FIELD_LABEL[log.fieldKey] ?? log.fieldKey;
          const actorLabel = log.actor === 'student' ? '学生 / 家长' : '老师';
          const actorName = log.changedBy?.realName ?? log.changedBy?.username ?? '未知';
          const when = new Date(log.createdAt).toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          });
          return (
            <li
              key={log.id}
              className="rounded-md border border-border-subtle bg-surface px-3 py-2"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="m-0 text-sm">
                  <span className="font-medium text-text">{fieldLabel}</span>
                  <span className="ml-2 text-xs text-text-muted">
                    {actorLabel}({actorName})
                  </span>
                </p>
                <span className="text-xs text-text-muted">{when}</span>
              </div>
              <p className="m-0 mt-1 text-xs text-text-muted">
                <span className="text-rush">{formatFieldValue(log.oldValue)}</span>
                {' -> '}
                <span className="text-safe">{formatFieldValue(log.newValue)}</span>
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function KeyDataPanel({ student }: { student: any }) {
  // 第一组:分数·位次
  const examType = student?.examType
    ? EXAM_TYPE_LABEL[student.examType] ?? student.examType
    : '--';
  const firstChoice = student?.firstChoice ?? '--';
  const reChoices = Array.isArray(student?.reChoices) ? student.reChoices.join('/') : '--';
  // examType 跟 firstChoice 语义经常重叠 (examType=PHYSICS, firstChoice='物理'),
  // 重叠时只显示一份避免"物理·物理·化学/生物"那种冗余
  const subjectStr = student?.examType
    ? examType === firstChoice
      ? `${examType}·${reChoices}`
      : `${examType}·${firstChoice}·${reChoices}`
    : '--';
  const totalScore = student?.totalScore ?? null;
  const provincialRank = student?.provincialRank ?? null;

  // 第二组:资格条件
  const bonusList = Array.isArray(student?.bonusItems) ? student.bonusItems : [];
  const bonusValue = bonusList.reduce(
    (sum: number, b: any) => sum + (b?.value ?? 0),
    0,
  );
  const bonusLabel = bonusList.length === 0 ? '无' : `+${bonusValue} (${bonusList.length} 项)`;
  const ethnicity = student?.user?.ethnicity ?? '--';
  const sourceLoc =
    [student?.province, student?.city, student?.county].filter(Boolean).join('·') || '--';

  // 第三组:意向
  const prefCities = Array.isArray(student?.preferredCities) ? student.preferredCities : [];
  const prefMajors = Array.isArray(student?.preferredMajors) ? student.preferredMajors : [];
  const prefCitiesStr =
    prefCities.length === 0
      ? '未填'
      : prefCities.slice(0, 3).join('/') + (prefCities.length > 3 ? '...' : '');
  const prefMajorsStr =
    prefMajors.length === 0
      ? '未填'
      : prefMajors.slice(0, 3).join('/') + (prefMajors.length > 3 ? '...' : '');

  return (
    <Card title="关键数据" size="small">
      <div className="space-y-4 text-sm">
        <div>
          <p className="m-0 mb-1 text-xs font-medium text-text-muted">分数·位次</p>
          <p className="m-0 leading-relaxed">
            <span>选科 {subjectStr}</span>
            <br />
            <span>最近模考 {totalScore ?? '--'}</span>
            <br />
            <span>预测位次 {provincialRank != null ? provincialRank.toLocaleString('zh-CN') : '--'}</span>
          </p>
        </div>
        <div className="border-t border-border-subtle pt-3">
          <p className="m-0 mb-1 text-xs font-medium text-text-muted">资格条件</p>
          <p className="m-0 leading-relaxed">
            <span>加分 {bonusLabel}</span>
            <br />
            <span>民族 {ethnicity}</span>
            <br />
            <span>生源地 {sourceLoc}</span>
          </p>
        </div>
        <div className="border-t border-border-subtle pt-3">
          <p className="m-0 mb-1 text-xs font-medium text-text-muted">意向</p>
          <p className="m-0 leading-relaxed">
            <span>意向城市 {prefCitiesStr}</span>
            <br />
            <span>目标专业 {prefMajorsStr}</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

function ExternalMaterialsTabContent({
  student,
}: {
  student: any;
}) {
  const [exporting, setExporting] = useState<string | null>(null);

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const plans: any[] = student?.volunteerPlans ?? [];

  return (
    <div className="space-y-4 pt-2">
      <Card title="对外材料" size="small">
        <div className="space-y-3">
          <div className="rounded-md border border-border-subtle p-3">
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <div>
                <p className="m-0 font-medium text-text">方案 Excel</p>
                <p className="m-0 text-xs text-text-muted">
                  按版本独立导出 (A3 横版 24 列 · 冲稳保彩色分组 · 可在 Excel 内继续微调)
                </p>
              </div>
              <span className="text-xs text-text-muted">{plans.length} 个方案</span>
            </div>
            {plans.length === 0 ? (
              <p className="m-0 text-xs text-text-muted">暂无方案</p>
            ) : (
              <ul className="m-0 list-none space-y-1 p-0">
                {plans.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between border-t border-border-subtle pt-1"
                  >
                    <span className="text-sm text-text">
                      v{p.versionNo}{p.versionNote ? ` (${p.versionNote})` : ''} · {p.status}
                      {p.isFinal ? ' · 终稿' : ''}
                    </span>
                    <Button
                      size="small"
                      type="text"
                      onClick={async () => {
                        const key = `plan-${p.id}`;
                        setExporting(key);
                        try {
                          const blob = await planApi.exportExcel(p.id);
                          const name = student?.user?.realName ?? 'student';
                          downloadBlob(blob, `${name}-v${p.versionNo}-方案.xlsx`);
                          message.success('方案 Excel 已导出');
                        } catch (e: any) {
                          message.error(`导出失败:${e?.message ?? '未知错误'}`);
                        } finally {
                          setExporting(null);
                        }
                      }}
                      loading={exporting === `plan-${p.id}`}
                    >
                      导出 Excel
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  phone: '电话',
  wechat: '微信',
  in_person: '线下',
  video: '视频',
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: '待开始',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
  no_show: '缺席',
};

function CommunicationTabContent({ studentId }: { studentId: string | number }) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

  const { data: list, isLoading } = useQuery({
    queryKey: ['consultations', studentId],
    queryFn: () => consultationApi.listByStudent(studentId),
    enabled: !!studentId,
  });

  const startMutation = useMutation({
    mutationFn: (id: number) => consultationApi.start(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultations', studentId] });
      message.success('已开始沟通');
    },
  });

  const endMutation = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) =>
      consultationApi.end(id, notes),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultations', studentId] });
      message.success('已结束沟通');
    },
  });

  if (isLoading) {
    return (
      <div className="rounded-lg bg-bg/30 py-12 text-center">
        <Spin />
      </div>
    );
  }

  const items = list ?? [];
  const totalMinutes = items.reduce((acc, c) => acc + (c.durationAct ?? 0), 0);

  return (
    <div className="pt-2 space-y-3">
      <div className="flex items-baseline justify-between">
        <p className="m-0 text-sm font-medium text-text">
          共 {items.length} 次 · 累计 {Math.floor(totalMinutes / 60)}h{totalMinutes % 60}m
        </p>
        <Button type="primary" size="small" onClick={() => setCreateOpen(true)}>
          新建预约
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-bg/30 p-12 text-center">
          <p className="m-0 text-text-muted">暂无沟通记录</p>
        </div>
      ) : (
        <ol className="m-0 list-none space-y-2 p-0">
          {items.map((c) => (
            <ConsultationRow
              key={c.id}
              consultation={c}
              onStart={() => startMutation.mutate(c.id)}
              onEnd={(notes) => endMutation.mutate({ id: c.id, notes })}
            />
          ))}
        </ol>
      )}

      <CreateConsultationModal
        open={createOpen}
        studentId={Number(studentId)}
        onCancel={() => setCreateOpen(false)}
        onSuccess={() => {
          setCreateOpen(false);
          qc.invalidateQueries({ queryKey: ['consultations', studentId] });
          message.success('预约已创建');
        }}
      />
    </div>
  );
}

function ConsultationRow({
  consultation,
  onStart,
  onEnd,
}: {
  consultation: Consultation;
  onStart: () => void;
  onEnd: (notes?: string) => void;
}) {
  const c = consultation;
  const when = new Date(c.scheduledAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const channelLabel = CHANNEL_LABEL[c.channel] ?? c.channel;
  const statusLabel = STATUS_LABEL[c.status] ?? c.status;

  return (
    <li className="rounded-md border border-border-subtle bg-surface px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="m-0 text-sm font-medium text-text">
            {when} · {channelLabel}
            {c.purpose ? ` · ${c.purpose}` : ''}
          </p>
          <p className="m-0 text-xs text-text-muted">
            状态:{statusLabel}
            {c.durationEst != null ? ` · 预估 ${c.durationEst} 分` : ''}
            {c.durationAct != null ? ` · 实际 ${c.durationAct} 分` : ''}
          </p>
        </div>
        <div className="flex gap-1">
          {c.status === 'scheduled' ? (
            <Button size="small" type="primary" onClick={onStart}>
              开始
            </Button>
          ) : null}
          {c.status === 'in_progress' ? (
            <Button size="small" type="primary" onClick={() => onEnd()}>
              结束
            </Button>
          ) : null}
        </div>
      </div>
      {c.notes ? (
        <p className="m-0 mt-1 text-xs text-text-muted">{c.notes}</p>
      ) : null}
    </li>
  );
}

function CreateConsultationModal({
  open,
  studentId,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  studentId: number;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [form] = Form.useForm();
  const createMutation = useMutation({
    mutationFn: (payload: any) => consultationApi.create(payload),
    onSuccess: () => {
      form.resetFields();
      onSuccess();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '创建失败'),
  });

  return (
    <Modal
      title="新建沟通预约"
      open={open}
      onCancel={onCancel}
      onOk={() =>
        form.validateFields().then((values) => {
          createMutation.mutate({
            studentId,
            scheduledAt: values.scheduledAt.toISOString(),
            durationEst: values.durationEst,
            channel: values.channel,
            purpose: values.purpose,
            notes: values.notes,
          });
        })
      }
      confirmLoading={createMutation.isPending}
    >
      <Form form={form} layout="vertical" initialValues={{ channel: 'phone', durationEst: 30 }}>
        <Form.Item name="scheduledAt" label="预约时间" rules={[{ required: true }]}>
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="channel" label="沟通方式" rules={[{ required: true }]}>
          <Select
            options={[
              { label: '电话', value: 'phone' },
              { label: '微信', value: 'wechat' },
              { label: '线下', value: 'in_person' },
              { label: '视频', value: 'video' },
            ]}
          />
        </Form.Item>
        <Form.Item name="durationEst" label="预估时长(分钟)">
          <InputNumber min={5} max={300} style={{ width: '100%' }} />
        </Form.Item>
        <Form.Item name="purpose" label="沟通目的">
          <Input placeholder="例:方案讲解 / 家长反馈 / 催进度" />
        </Form.Item>
        <Form.Item name="notes" label="备注">
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
