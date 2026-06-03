'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import PrerequisiteCheckModal from '@/components/plan/PrerequisiteCheckModal';
import { Alert, Button, Card, Cascader, Checkbox, Collapse, DatePicker, Form, Input, InputNumber, Modal, Radio, Select, Spin, message } from 'antd';
import {
  LockOutlined,
  SwapOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type BonusItem, type UpdateStudentDto } from '@/services/student-api';
import { planApi } from '@/services/plan-api';
import { consultationApi, type Consultation } from '@/services/consultation-api';
import { Avatar as WnAvatar, TIcon } from '@/components/willnest';
import BonusCalcCard from '@/components/policy/BonusCalcCard';
import { useProvinceOptions } from '@/components/student/picker/options/useProvinceOptions';
import { useCityOptions } from '@/components/student/picker/options/useCityOptions';
import { useUniversityOptions } from '@/components/student/picker/options/useUniversityOptions';
import { useMajorOptions } from '@/components/student/picker/options/useMajorOptions';
import { useMajorCategoryOptions } from '@/components/student/picker/options/useMajorCategoryOptions';
import PreferredMajorTierFormItem from '@/components/student/preferred-majors/PreferredMajorTierFormItem';
import { getRegionCascaderOptions, type CascaderOption } from '@/data/student-options';
import { fieldLabel } from '@/components/student/stage-fields';
import {
  type Subject9Form,
  to9Subjects,
  from9Subjects,
  sum9Subjects,
  validate6Subjects,
} from '@/components/student/stage1-score-mapping';
import { ETHNICITY_OPTIONS } from '@/data/student-options';
import { scoreSegmentApi, type ExamType as RankExamType } from '@/services/score-segment';

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
  excludedMajors: '排除个别专业',
  excludedMajorCategories: '排除专业类',
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
    // 偏差 >20% 时升级到 banner 样式 (背景色), 防止老师漏看小红字
    const absDiff = Math.abs(rankCheck.difference ?? 0);
    const ratio =
      rankCheck.calculatedRank && rankCheck.calculatedRank > 0
        ? absDiff / rankCheck.calculatedRank
        : 0;
    const isBigGap = ratio > 0.2;
    if (isBigGap) {
      return (
        <span className="mt-1 inline-block rounded border border-red-300 bg-red-50 px-2 py-1 text-xs font-medium text-red-700">
          ⚠️ {sourceLabel}：{formatRank(rankCheck.calculatedRank)} 位{estimateNote}；
          当前填写：{formatRank(rankCheck.currentRank)} 位；
          相差 {formatRank(absDiff)} 位 ({Math.round(ratio * 100)}%)，请核对录入是否正确。
        </span>
      );
    }
    return (
      <span className="font-medium text-red-600">
        {sourceLabel}：{formatRank(rankCheck.calculatedRank)} 位{estimateNote}；当前填写：{formatRank(rankCheck.currentRank)} 位；
        相差 {formatRank(absDiff)} 位，请核对。
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

  // ---- 复刻设计稿 student-detail.jsx: sd-header + sd-intake + sop + sd-progress
  // + missing-card + sd-tabs. 业务字段映射 / mutations / Tab content 保留. ----
  const name =
    student.user?.realName || student.realName || student.username || '学生';
  const examType = student?.examType
    ? EXAM_TYPE_LABEL[student.examType] ?? student.examType
    : '--';
  const totalScore = student?.totalScore ?? null;
  const provincialRank = student?.provincialRank ?? null;
  const signedAt = student?.createdAt ? new Date(student.createdAt) : null;
  const daysServed = signedAt
    ? Math.floor((Date.now() - signedAt.getTime()) / 86_400_000)
    : null;
  const checks = getFieldChecks(student);
  const missingFieldsList = checks.filter((c) => !c.passed);
  const intakeStatus: string = student.intakeStatus ?? 'DRAFT';
  const INTAKE_INFO: Record<string, { label: string; tone: string; hint: string }> = {
    DRAFT: { label: '资料草稿', tone: 'muted', hint: '学生还在自填' },
    SUBMITTED: { label: '待老师确认', tone: 'accent', hint: '学生已提交,等老师核对' },
    VERIFIED: { label: '资料已确认', tone: 'safe', hint: '可生成方案' },
    NEEDS_CHANGES: { label: '已退回修改', tone: 'rush', hint: '需学生补正' },
    REQUEST_CHANGE: { label: '请求修改中', tone: 'rush', hint: '老师要求重填部分字段' },
  };
  const intakeInfo = INTAKE_INFO[intakeStatus] ?? INTAKE_INFO.DRAFT;
  const canGenerate =
    !!progress?.isRecommendable && intakeStatus === 'VERIFIED';
  const overall = progress?.overallCompleteness ?? 0;
  const studentPct = progress?.studentSelfCompleteness ?? 0;
  const teacherPct = progress?.teacherDataCompleteness ?? 0;

  return (
    <div className="view-transition">
      {/* —— 面包屑返回 —— */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 13,
          color: 'var(--text-tertiary)',
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          onClick={() => router.back()}
          style={{
            background: 'transparent',
            border: 0,
            padding: '4px 8px',
            borderRadius: 6,
            color: 'var(--text-tertiary)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            cursor: 'pointer',
          }}
        >
          <span style={{ width: 12, height: 12, display: 'inline-flex' }}>
            <TIcon.chevLeft />
          </span>{' '}
          返回
        </button>
        <span style={{ color: 'var(--text-faint)' }}>/</span>
        <span>学生详情</span>
      </div>

      {/* —— sd-header: avatar + 信息 + 操作 + intake pill + SOP timeline —— */}
      <div className="sd-header fade-up d1">
        <div className="top">
          <WnAvatar
            student={{
              id: student?.id ?? 0,
              name,
              initials: name.charAt(0),
              tone: 't-blue',
            }}
            size={64}
          />
          <div className="who">
            <h1>
              {name}
              {student?.id ? <span className="id-chip">#{student.id}</span> : null}
            </h1>
            <div className="info-meta">
              <span>{examType}</span>
              {totalScore != null ? (
                <>
                  <span className="sep" />
                  <span>
                    总分 <span className="num">{totalScore}</span>
                  </span>
                </>
              ) : null}
              {provincialRank != null ? (
                <span>
                  位次{' '}
                  <span className="num">
                    {provincialRank.toLocaleString('zh-CN')}
                  </span>
                </span>
              ) : null}
              {(signedAt || daysServed != null) ? <span className="sep" /> : null}
              {signedAt ? (
                <span>
                  签约{' '}
                  <span className="num">
                    {signedAt.toLocaleDateString('zh-CN')}
                  </span>
                </span>
              ) : null}
              {daysServed != null ? (
                <span>
                  服务 <span className="num">{daysServed}</span> 天
                </span>
              ) : null}
              {plansSummary?.latestPlanStatus ? (
                <>
                  <span className="sep" />
                  <span>
                    当前方案 v{plansSummary.latestPlanVersionNo ?? '?'} ·{' '}
                    {plansSummary.latestPlanStatus}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={() =>
                form.validateFields().then((values) => {
                  // 9 科 → 后端 6 槽位字段翻译。
                  // 老师可能只动了一两个字段，但只要 9 科里任一有值就走翻译。
                  const subj9: Subject9Form = {
                    scoreChinese: values.scoreChinese,
                    scoreMath: values.scoreMath,
                    scoreEnglish: values.scoreEnglish,
                    scorePhysics: values.scorePhysics,
                    scoreHistory: values.scoreHistory,
                    scoreChemistry: values.scoreChemistry,
                    scoreBiology: values.scoreBiology,
                    scorePolitics: values.scorePolitics,
                    scoreGeography: values.scoreGeography,
                  };
                  const has9 = Object.values(subj9).some((v) => v != null);
                  if (has9) {
                    const t = from9Subjects(subj9);
                    Object.assign(values, {
                      totalScore: t.totalScore,
                      examType: t.examType,
                      firstChoice: t.firstChoice,
                      scoreFirstChoice: t.scoreFirstChoice,
                      reChoices: t.reChoices,
                      scoreSub1: t.scoreSub1,
                      scoreSub2: t.scoreSub2,
                    });
                  }
                  // 后端 DTO 不接受 6 个具体科目字段名 (物/史/化/生/政/地)，删掉
                  for (const k of [
                    'scorePhysics', 'scoreHistory',
                    'scoreChemistry', 'scoreBiology', 'scorePolitics', 'scoreGeography',
                  ]) {
                    delete (values as Record<string, unknown>)[k];
                  }
                  saveMutation.mutate(values);
                })
              }
              disabled={saveMutation.isPending}
            >
              <TIcon.save /> {saveMutation.isPending ? '保存中...' : '保存'}
            </button>
            <button
              type="button"
              className="btn"
              onClick={onExportIntake}
            >
              <TIcon.excel /> 导出登记表
            </button>
            {/* 推荐批次入口 — SUBMITTED/NEEDS_CHANGES/VERIFIED 可见, DRAFT 不显示 */}
            {(intakeStatus === 'SUBMITTED' ||
              intakeStatus === 'NEEDS_CHANGES' ||
              intakeStatus === 'VERIFIED') && (
              <Link
                href={`/teacher/students/${studentId}/batch-recommendations`}
                className="btn"
              >
                <TIcon.shield />{' '}
                {student?.batchesConfirmedAt ? '查看/修改批次' : '查看推荐批次'}
              </Link>
            )}
            {intakeStatus !== 'VERIFIED' ? (
              <>
                <button
                  type="button"
                  className="btn"
                  onClick={onRequestIntakeChange}
                  disabled={reviewIntakeMutation.isPending}
                >
                  <TIcon.alert /> 退回修改
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() =>
                    reviewIntakeMutation.mutate({
                      action: 'VERIFY',
                      comment: '资料已核验',
                    })
                  }
                  disabled={reviewIntakeMutation.isPending}
                >
                  <TIcon.check /> 确认资料
                </button>
              </>
            ) : null}
            <button
              type="button"
              className="btn primary"
              disabled={!canGenerate}
              title={
                intakeStatus !== 'VERIFIED'
                  ? '需先确认学生资料'
                  : progress && !progress.isRecommendable
                  ? '档案未达到可推荐阈值,请先补全关键字段'
                  : ''
              }
              onClick={() => setShowPrereqModal(true)}
            >
              <TIcon.sparkles /> 生成方案
            </button>
          </div>
        </div>

        {/* —— intakeStatus pill —— */}
        <div className="sd-intake-row">
          <span className={`sd-intake-pill tone-${intakeInfo.tone}`}>
            {intakeStatus === 'VERIFIED' ? <TIcon.check /> : <TIcon.alert />}
            {intakeInfo.label}
          </span>
          <span className="sd-intake-hint">{intakeInfo.hint}</span>
        </div>

        {/* —— SOP timeline (从现有 sopNodes 派生) —— */}
        <div className="sop">
          {sopNodes.map((node, i) => (
            <div className={`sop-step ${node.status}`} key={node.key}>
              <span className="dot">
                {node.status === 'done' ? <TIcon.check /> : i + 1}
              </span>
              <span className="lbl">{node.label}</span>
              {node.detail ? (
                <span className="sub-detail">{node.detail}</span>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {/* —— sd-progress 3 bars —— */}
      {progress ? (
        <div className="sd-progress fade-up d2">
          <div className="prg t-student">
            <div className="k">学生自填进度</div>
            <div
              className={`v ${
                studentPct === 100 ? 'full' : studentPct < 50 ? 'low' : ''
              }`}
            >
              <span className="num">{studentPct}</span>
              <span className="pc">%</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${studentPct}%` }} />
            </div>
          </div>
          <div className="prg t-teacher">
            <div className="k">老师录入进度</div>
            <div
              className={`v ${
                teacherPct === 100 ? 'full' : teacherPct < 50 ? 'low' : ''
              }`}
            >
              <span className="num">{teacherPct}</span>
              <span className="pc">%</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${teacherPct}%` }} />
            </div>
          </div>
          <div className="prg t-total">
            <div className="k">档案总进度</div>
            <div
              className={`v ${
                overall >= 90 ? 'full' : overall < 60 ? 'low' : ''
              }`}
            >
              <span className="num">{overall}</span>
              <span className="pc">%</span>
            </div>
            <div className="bar">
              <div className="fill" style={{ width: `${overall}%` }} />
            </div>
          </div>
        </div>
      ) : null}

      {/* —— missing-card —— */}
      <div
        className={`missing-card fade-up d2 ${
          missingFieldsList.length === 0 ? 'ok' : ''
        }`}
      >
        <div className="lead">
          {missingFieldsList.length === 0 ? (
            <>
              ✓ 档案已就绪 · 完整度{' '}
              <span className="em" style={{ color: 'var(--safe)' }}>
                {overall}%
              </span>
            </>
          ) : (
            <>
              还缺 <span className="em">{missingFieldsList.length}</span>{' '}
              项关键资料 · 档案完整度{' '}
              <span className="em">{overall}%</span>
            </>
          )}
        </div>
        {missingFieldsList.length > 0 ? (
          <div className="chips">
            {missingFieldsList.map((c) => (
              <span className="mchip" key={c.key}>
                {c.label}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      {/* —— sd-tabs (设计稿样式 5 个 Tab) —— */}
      <div className="sd-tabs fade-up d3">
        {(
          [
            { k: 'profile', label: '资料', badge: missingFieldsList.length },
            { k: 'comm', label: '沟通记录' },
            { k: 'plan', label: '方案' },
            { k: 'external', label: '对外材料' },
            { k: 'log', label: '变更日志' },
          ] as const
        ).map((t) => (
          <button
            type="button"
            key={t.k}
            className={`sd-tab ${activeTab === t.k ? 'is-active' : ''}`}
            onClick={() => handleTabChange(t.k)}
          >
            {t.label}
            {t.k === 'profile' && (t.badge ?? 0) > 0 ? (
              <span className="badge">{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* —— Tab content (antd Form / Card / 子组件保留 ) —— */}
      <div className="fade-up d4">
        {activeTab === 'profile' && (
          <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-4">
              <DataCompletenessHeader student={student} />
              <Card className="rounded-2xl shadow-card">
                <Form
                  form={form}
                  layout="vertical"
                  initialValues={{
                    ...student,
                    ...student.user,
                    // 9 科分数字段：把后端 firstChoice/scoreFirstChoice/reChoices/scoreSub1/2
                    // 解开为具体科目分数（scorePhysics / scoreHistory / scoreChemistry...）
                    ...to9Subjects(student),
                    provincialRank:
                      student.provincialRank ??
                      student.rankCheck?.calculatedRank ??
                      undefined,
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
                      {
                        key: 'exam',
                        label: '考试成绩',
                        children: <ExamFields rankCheck={student.rankCheck} />,
                      },
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
            <div className="space-y-4">
              <ContactPanel student={student} />
              <KeyDataPanel student={student} />
            </div>
          </div>
        )}
        {activeTab === 'comm' && <CommunicationTabContent studentId={studentId} />}
        {activeTab === 'plan' && <PlanListTabContent student={student} />}
        {activeTab === 'external' && (
          <ExternalMaterialsTabContent student={student} />
        )}
        {activeTab === 'log' && <ChangeLogTabContent studentId={studentId} />}
      </div>

      {/* 原 antd Tabs + 副区 grid 已替换成 sd-tabs + Tab content 直接展开 */}
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
    <div className="sd-form-grid">
      <div className="field">
        <label>姓名<span className="req">必填</span></label>
        <Form.Item name="realName" rules={[{ required: true }]} noStyle>
          <Input placeholder="学生姓名" />
        </Form.Item>
      </div>
      <div className="field">
        <label>手机号</label>
        <Form.Item name="phone" noStyle>
          <Input placeholder="手机号" />
        </Form.Item>
      </div>
      <div className="field">
        <label>家长手机号</label>
        <Form.Item name="parentPhone" noStyle>
          <Input placeholder="家长手机号" />
        </Form.Item>
      </div>
      <div className="field">
        <label>性别</label>
        <Form.Item name="gender" noStyle>
          <Radio.Group>
            <Radio value="MALE">男</Radio>
            <Radio value="FEMALE">女</Radio>
          </Radio.Group>
        </Form.Item>
      </div>
      <div className="field">
        <label>民族</label>
        <Form.Item name="ethnicity" noStyle>
          <Select
            showSearch
            allowClear
            placeholder="选择民族"
            optionFilterProp="label"
            options={ETHNICITY_OPTIONS}
          />
        </Form.Item>
      </div>
      <div className="field">
        <label>政治面貌</label>
        <Form.Item name="politicalStatus" noStyle>
          <Radio.Group>
            <Radio value="PARTY_MEMBER">党员</Radio>
            <Radio value="LEAGUE_MEMBER">团员</Radio>
            <Radio value="MASSES">群众</Radio>
          </Radio.Group>
        </Form.Item>
      </div>
      <div className="field">
        <label>高中</label>
        <Form.Item name="highSchool" noStyle>
          <Input placeholder="如 成都七中" />
        </Form.Item>
      </div>
      <div className="field">
        <label>班级</label>
        <Form.Item name="classInfo" noStyle>
          <Input placeholder="如 高三(1)班" />
        </Form.Item>
      </div>
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
    <div className="sd-form-grid">
      {/* 户籍所在地 — Cascader 保留 antd (业务下拉, 不改) */}
      <div className="field sd-field-full">
        <label>户籍所在地</label>
        <RegionCascaderField
          fieldKeys={['province', 'city', 'county']}
          options={regionOptions}
          placeholder="选择户籍省 / 市 / 县区"
        />
      </div>
      <div className="field">
        <label>户口性质</label>
        <Form.Item name="isRural" valuePropName="checked" noStyle>
          <Checkbox>农村户籍</Checkbox>
        </Form.Item>
      </div>
      {/* 高考报名地 — Cascader 保留 antd */}
      <div className="field sd-field-full">
        <label>高考报名地</label>
        <RegionCascaderField
          fieldKeys={['examLocationProvince', 'examLocationCity', 'examLocationCounty']}
          options={regionOptions}
          placeholder="选择报名省 / 市 / 县区"
        />
      </div>
      <div className="field">
        <label>&nbsp;</label>
        <Button icon={<SwapOutlined />} onClick={copyHukouToExamLocation}>
          同户籍所在地
        </Button>
      </div>
    </div>
  );
}

function RegionCascaderField({
  fieldKeys,
  options,
  placeholder,
}: {
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
      <Cascader
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
    </>
  );
}

function ExamFields({ rankCheck }: { rankCheck?: RankCheck }) {
  const form = Form.useFormInstance();
  return (
    <div className="sd-form-grid">
      {/* —— 顶部三段: 科类(可手选, 选物理/历史首选时自动同步) / 年份 / 来源 —— */}
      <div className="field">
        <label>科类<span className="sc-hint"> 可手选 · 选物理/历史首选时自动同步</span></label>
        <Form.Item name="examType" noStyle>
          <Select
            placeholder="选择科类"
            options={[
              { value: 'PHYSICS', label: '物理类' },
              { value: 'HISTORY', label: '历史类' },
              // 文科综合 / 理科综合 是 2024 前旧高考方案; 四川 2025+ 新高考
              // 只有 物理类 / 历史类 两类, 此处不再提供.
              // EXAM_TYPE_LABEL 映射仍保留这两个 key, 仅用于回显旧届数据.
            ]}
          />
        </Form.Item>
      </div>
      <div className="field">
        <label>高考年份</label>
        <Form.Item name="examYear" noStyle>
          <Select
            placeholder="年份"
            options={[
              { value: 2026, label: '2026' },
              { value: 2025, label: '2025' },
              { value: 2024, label: '2024' },
            ]}
          />
        </Form.Item>
      </div>
      <div className="field">
        <label>分数来源</label>
        <Form.Item name="examSource" noStyle>
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

      {/* —— 必填三科: 语数英 —— */}
      <div className="field full">
        <label>必填三科<span className="sc-hint"> 语文 / 数学 / 英语</span></label>
        <div className="sc-9subjects-grid">
          {/* 不加 required: 老师建档支持渐进式录入 (先填一部分先保存, 后续补).
              学生端 stage 表单是"提交意向"语义所以 required; 老师端是"档案管理"
              语义, 任何时候保存都该允许. 完整度 / missing-card 仍标缺失项. */}
          <TeacherScoreInput name="scoreChinese" label="语文" max={150} />
          <TeacherScoreInput name="scoreMath" label="数学" max={150} />
          <TeacherScoreInput name="scoreEnglish" label="英语" max={150} />
        </div>
      </div>

      {/* —— 首选: 物理/历史互斥 —— */}
      <div className="field full">
        <label>首选科目<span className="sc-hint"> 物理 / 历史二选一</span></label>
        <Form.Item
          noStyle
          shouldUpdate={(p, c) =>
            p.scorePhysics !== c.scorePhysics || p.scoreHistory !== c.scoreHistory
          }
        >
          {({ getFieldValue }) => {
            const hasPhysics = getFieldValue('scorePhysics') != null;
            const hasHistory = getFieldValue('scoreHistory') != null;
            return (
              <div className="sc-9subjects-grid sc-9subjects-grid--2col">
                <TeacherScoreInput
                  name="scorePhysics"
                  label="物理"
                  max={100}
                  disabled={hasHistory}
                  placeholder={hasHistory ? '已选历史' : undefined}
                  onChange={(v) => {
                    if (v != null) {
                      form.setFieldValue('scoreHistory', undefined);
                      form.setFieldsValue({ examType: 'PHYSICS', firstChoice: '物理' });
                    }
                  }}
                />
                <TeacherScoreInput
                  name="scoreHistory"
                  label="历史"
                  max={100}
                  disabled={hasPhysics}
                  placeholder={hasPhysics ? '已选物理' : undefined}
                  onChange={(v) => {
                    if (v != null) {
                      form.setFieldValue('scorePhysics', undefined);
                      form.setFieldsValue({ examType: 'HISTORY', firstChoice: '历史' });
                    }
                  }}
                />
              </div>
            );
          }}
        </Form.Item>
      </div>

      {/* —— 再选: 化 / 生 / 政 / 地 — 4 选 2 —— */}
      <div className="field full">
        <label>再选科目<span className="sc-hint"> 化 / 生 / 政 / 地 四选二</span></label>
        <Form.Item
          noStyle
          shouldUpdate={(p, c) =>
            p.scoreChemistry !== c.scoreChemistry ||
            p.scoreBiology !== c.scoreBiology ||
            p.scorePolitics !== c.scorePolitics ||
            p.scoreGeography !== c.scoreGeography
          }
        >
          {({ getFieldValue }) => {
            const reKeys = [
              'scoreChemistry', 'scoreBiology', 'scorePolitics', 'scoreGeography',
            ] as const;
            const filledCount = reKeys.filter((k) => getFieldValue(k) != null).length;
            const lockOthers = filledCount >= 2;
            const isFilled = (k: string) => getFieldValue(k) != null;
            return (
              <div className="sc-9subjects-grid">
                <TeacherScoreInput name="scoreChemistry" label="化学" max={100}
                  disabled={lockOthers && !isFilled('scoreChemistry')} />
                <TeacherScoreInput name="scoreBiology" label="生物" max={100}
                  disabled={lockOthers && !isFilled('scoreBiology')} />
                <TeacherScoreInput name="scorePolitics" label="政治" max={100}
                  disabled={lockOthers && !isFilled('scorePolitics')} />
                <TeacherScoreInput name="scoreGeography" label="地理" max={100}
                  disabled={lockOthers && !isFilled('scoreGeography')} />
              </div>
            );
          }}
        </Form.Item>
      </div>

      {/* —— 总分(自动累加) + 全省位次 —— */}
      <div className="field">
        <label>总分<span className="sc-hint"> 自动累加</span></label>
        <Form.Item
          noStyle
          shouldUpdate={(p, c) =>
            p.scoreChinese !== c.scoreChinese ||
            p.scoreMath !== c.scoreMath ||
            p.scoreEnglish !== c.scoreEnglish ||
            p.scorePhysics !== c.scorePhysics ||
            p.scoreHistory !== c.scoreHistory ||
            p.scoreChemistry !== c.scoreChemistry ||
            p.scoreBiology !== c.scoreBiology ||
            p.scorePolitics !== c.scorePolitics ||
            p.scoreGeography !== c.scoreGeography
          }
        >
          {({ getFieldsValue }) => {
            const v = getFieldsValue([
              'scoreChinese', 'scoreMath', 'scoreEnglish',
              'scorePhysics', 'scoreHistory',
              'scoreChemistry', 'scoreBiology', 'scorePolitics', 'scoreGeography',
            ]) as Subject9Form;
            const total = sum9Subjects(v);
            return (
              <div className="sc-total-display">
                <span className="sc-total-num">{total}</span>
                <span className="sc-total-unit"> 分</span>
              </div>
            );
          }}
        </Form.Item>
      </div>
      <div className="field">
        <label>全省位次<span className="sc-hint"> 6 科齐后实时估算 · 可手动校正</span></label>
        <Form.Item name="provincialRank" noStyle>
          <InputNumber min={1} style={{ width: '100%' }} placeholder="6 科齐后自动估算" />
        </Form.Item>
        <EstimatedRankHint />
        {rankCheck ? <div className="sc-hint"><RankCheckExtra rankCheck={rankCheck} /></div> : null}
      </div>
    </div>
  );
}

/** 老师端独立 ScoreInput — 视觉风格 (rounded-xl 卡片 + 满分提示) 与学生端 ScoreInput
 *  对齐, 老师可帮学生录入信息时, UI 和学生看到的一致, 避免误填。
 *  独立组件 (不共享文件) 防止跨页面状态泄漏 / hydration 错位。 */
function TeacherScoreInput({
  name,
  label,
  max,
  required,
  disabled,
  placeholder,
  onChange,
}: {
  name: string;
  label: string;
  max: number;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onChange?: (value: number | null) => void;
}) {
  return (
    <div className={`sc-input-card ${disabled ? 'is-disabled' : ''}`}>
      <div className="sc-input-card-head">
        <span className="sc-input-card-label">{label}</span>
        <span className="sc-input-card-max">满分 {max}</span>
      </div>
      <Form.Item
        name={name}
        rules={[
          ...(required ? [{ required: true, message: '必填' }] : []),
          // 用 rules 校验而不是 InputNumber 的 max prop —— max prop 会在 blur 时
          // 自动 clamp 到 150 (silent 截断, 老师以为 input 自己改了数字).
          // 改 rules: 用户输 200 不 clamp, 但提交时显示红字"不能超过 150".
          {
            type: 'number',
            max,
            message: `不能超过 ${max} 分`,
          },
        ]}
        className="mb-0"
        style={{ marginBottom: 0 }}
      >
        <InputNumber
          min={0}
          style={{ width: '100%' }}
          disabled={disabled}
          placeholder={placeholder}
          onChange={onChange}
        />
      </Form.Item>
    </div>
  );
}

/** 通用 debounce hook — 让 useQuery 在用户停止输入 500ms 后才 fire,
 *  避免每按一个数字键就调一次 /score-segment/lookup。 */
function useDebounceValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/** 实时位次估算 hint — 监听 form 里 9 科分数 + examYear, 6 科齐 + 物理/历史
 *  确定后调 POST /score-segment/lookup, 自动写回 provincialRank 字段, 并显示
 *  来源年份和总分。一分一段表里没有当年时, fallback 到最近可用年份
 *  (PROXY_YEAR = 2025), 与 RankInput 组件保持一致。 */
function EstimatedRankHint() {
  const form = Form.useFormInstance();
  const scoreChinese = Form.useWatch('scoreChinese', form);
  const scoreMath = Form.useWatch('scoreMath', form);
  const scoreEnglish = Form.useWatch('scoreEnglish', form);
  const scorePhysics = Form.useWatch('scorePhysics', form);
  const scoreHistory = Form.useWatch('scoreHistory', form);
  const scoreChemistry = Form.useWatch('scoreChemistry', form);
  const scoreBiology = Form.useWatch('scoreBiology', form);
  const scorePolitics = Form.useWatch('scorePolitics', form);
  const scoreGeography = Form.useWatch('scoreGeography', form);
  const examYear = Form.useWatch('examYear', form);

  const subj9: Subject9Form = useMemo(
    () => ({
      scoreChinese,
      scoreMath,
      scoreEnglish,
      scorePhysics,
      scoreHistory,
      scoreChemistry,
      scoreBiology,
      scorePolitics,
      scoreGeography,
    }),
    [
      scoreChinese, scoreMath, scoreEnglish,
      scorePhysics, scoreHistory,
      scoreChemistry, scoreBiology, scorePolitics, scoreGeography,
    ],
  );

  const validateErr = useMemo(() => validate6Subjects(subj9), [subj9]);
  const total = useMemo(() => sum9Subjects(subj9), [subj9]);
  const examTypeForRank: RankExamType | null = subj9.scorePhysics != null
    ? '物理'
    : subj9.scoreHistory != null
    ? '历史'
    : null;

  // 2026 一分一段表通常 6 月底才出, 早期用 2025 代理 (与 RankInput.tsx 同步)
  const requestedYear = typeof examYear === 'number' ? examYear : null;
  const effectiveYear = requestedYear && requestedYear <= 2025 ? requestedYear : 2025;

  const debouncedTotal = useDebounceValue(total, 500);
  const debouncedYear = useDebounceValue(effectiveYear, 500);
  const debouncedExam = useDebounceValue(examTypeForRank, 500);

  const queryEnabled =
    !validateErr && debouncedExam != null && debouncedTotal > 0 && !!debouncedYear;

  const { data, isLoading, isError } = useQuery({
    queryKey: ['estimate-rank', debouncedYear, debouncedExam, debouncedTotal],
    queryFn: () => scoreSegmentApi.lookup({
      year: debouncedYear,
      examType: debouncedExam!,
      score: debouncedTotal,
    }),
    enabled: queryEnabled,
    retry: false,
    staleTime: 60_000,
  });

  // 自动写回 form: 估算结果出来就更新 provincialRank, 让 input 显示当前估算.
  // 老师改了 input 后, 下次分数变化触发新估算时仍会被覆盖 (因为这是"实时
  // 估算", 老师手填的值就该被最新估算替代).
  useEffect(() => {
    if (data?.rank != null) {
      form.setFieldValue('provincialRank', data.rank);
    }
  }, [data?.rank, form]);

  if (validateErr) {
    return <div className="sc-hint">{`填齐 6 科分数后, 实时估算位次 · 当前: ${validateErr}`}</div>;
  }
  if (isLoading) return <div className="sc-hint">…正在估算位次</div>;
  if (isError) {
    return (
      <div className="sc-hint err">
        位次估算暂不可用 (一分一段表 {effectiveYear} 数据缺失)
      </div>
    );
  }
  if (!data) return null;

  const usedProxy = requestedYear != null && requestedYear !== data.year;
  return (
    <div className="sc-rank-estimate">
      <strong>实时估算 {data.rank.toLocaleString('zh-CN')} 位</strong>
      <span>
        {' · '}总分 {data.score} · 基于 {data.year} 一分一段
        {usedProxy ? `（${requestedYear} 数据未出, 用 ${data.year} 代理）` : ''}
      </span>
    </div>
  );
}

function BonusFields() {
  return (
    <div className="sd-form-grid">
      <div className="field sd-field-full">
        <label>加分政策状态</label>
        <Form.Item name="bonusPolicyStatus" noStyle>
          <Radio.Group>
            <Radio value="NONE">没有</Radio>
            <Radio value="HAS_BONUS">有</Radio>
            <Radio value="UNKNOWN">不清楚</Radio>
          </Radio.Group>
        </Form.Item>
      </div>
      <div className="field sd-field-full">
        <label>加分细则</label>
        <Form.Item
          name="bonusItems"
          noStyle
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
      </div>
    </div>
  );
}

function HealthFields() {
  return (
    <div className="sd-form-grid">
      <div className="field">
        <label>身高 (cm)</label>
        <Form.Item name="height" noStyle><InputNumber min={100} max={250} style={{ width: '100%' }} /></Form.Item>
      </div>
      <div className="field">
        <label>体重 (kg)</label>
        <Form.Item name="weight" noStyle><InputNumber min={20} max={200} style={{ width: '100%' }} /></Form.Item>
      </div>
      <div className="field">
        <label>左眼裸眼视力</label>
        <Form.Item name="visionLeft" noStyle><InputNumber min={1} max={5.3} step={0.1} style={{ width: '100%' }} /></Form.Item>
      </div>
      <div className="field">
        <label>右眼裸眼视力</label>
        <Form.Item name="visionRight" noStyle><InputNumber min={1} max={5.3} step={0.1} style={{ width: '100%' }} /></Form.Item>
      </div>
      <div className="field">
        <label>色觉</label>
        <div style={{ display: 'flex', gap: 16, paddingTop: 6 }}>
          <Form.Item name="colorBlind" valuePropName="checked" noStyle><Checkbox>色盲</Checkbox></Form.Item>
          <Form.Item name="colorWeak" valuePropName="checked" noStyle><Checkbox>色弱</Checkbox></Form.Item>
        </div>
      </div>
      <div className="field sd-field-full">
        <label>体检受限项</label>
        <Form.Item name="physicalLimits" noStyle><Select mode="tags" allowClear placeholder="可输入多个,回车添加" /></Form.Item>
      </div>
      <div className="field sd-field-full">
        <label>既往病史 / 特殊情况</label>
        <Form.Item name="medicalHistory" noStyle><Input.TextArea rows={2} placeholder="如有先天性疾病、过敏等请详填" /></Form.Item>
      </div>
    </div>
  );
}

function PreferenceFields() {
  const { data: provinceOptions } = useProvinceOptions();
  const { data: cityOptions } = useCityOptions();
  const { data: universityOptions, isLoading: isUniversityLoading } = useUniversityOptions();
  const { data: majorOptions, isLoading: isMajorLoading } = useMajorOptions();
  const { data: majorCategoryOptions, isLoading: isMajorCategoryLoading } = useMajorCategoryOptions();

  return (
    <div className="sd-form-grid">
      <div className="field sd-field-full">
        <label>优先模式</label>
        <Form.Item name="priorityMode" noStyle>
          <Radio.Group>
            <Radio value="UNIVERSITY_FIRST">院校优先</Radio>
            <Radio value="MAJOR_FIRST">专业优先</Radio>
            <Radio value="CITY_FIRST">城市优先</Radio>
            <Radio value="BALANCED">均衡</Radio>
          </Radio.Group>
        </Form.Item>
      </div>
      {/* 院校/专业/省市 Picker 保留 antd Select (业务搜索下拉, 不改) */}
      <div className="field">
        <label>意向省份</label>
        <Form.Item name="preferredProvinces" noStyle>
          <Select {...pickerSelectProps(provinceOptions)} placeholder="选择省份" />
        </Form.Item>
      </div>
      <div className="field">
        <label>意向城市</label>
        <Form.Item name="preferredCities" noStyle>
          <Select {...pickerSelectProps(cityOptions)} placeholder="选择城市" />
        </Form.Item>
      </div>
      <div className="field sd-field-full">
        <label>意向专业 (梯队)</label>
        <Form.Item name="preferredMajors" noStyle>
          <PreferredMajorTierFormItem options={majorOptions ?? []} isLoading={isMajorLoading} />
        </Form.Item>
      </div>
      <div className="field">
        <label>意向院校</label>
        <Form.Item name="preferredUniversities" noStyle>
          <Select {...pickerSelectProps(universityOptions)} loading={isUniversityLoading} placeholder="搜索院校" />
        </Form.Item>
      </div>
      <div className="field">
        <label>排除院校</label>
        <Form.Item name="excludedUniversities" noStyle>
          <Select {...pickerSelectProps(universityOptions)} loading={isUniversityLoading} placeholder="搜索院校" />
        </Form.Item>
      </div>
      <div className="field">
        <label>排除专业类<span className="sc-hint"> 整类不要 · 如机械类 / 安全类</span></label>
        <Form.Item name="excludedMajorCategories" noStyle>
          <Select
            {...pickerSelectProps(majorCategoryOptions ?? [])}
            loading={isMajorCategoryLoading}
            placeholder="搜索专业类"
          />
        </Form.Item>
      </div>
      <div className="field">
        <label>排除个别专业<span className="sc-hint"> 类内某几个不要 · 精确到名</span></label>
        <Form.Item name="excludedMajors" noStyle>
          <Select {...pickerSelectProps(majorOptions)} loading={isMajorLoading} placeholder="搜索专业" />
        </Form.Item>
      </div>
      <div className="field sd-field-full">
        <label>职业方向</label>
        <Form.Item name="careerDirection" noStyle><Input.TextArea rows={2} placeholder="可填多个方向,如电子信息 / 计算机" /></Form.Item>
      </div>
      <div className="field sd-field-full">
        <label>其他要求</label>
        <Form.Item name="otherRequirements" noStyle><Input.TextArea rows={2} placeholder="如希望保留独立招生计划院校等" /></Form.Item>
      </div>
    </div>
  );
}

// ── 顶部摘要条:身份 + 关键摘要 + 操作 ──
/* StudentSummaryBar + SopTimeline 旧子组件已被主入口 inline 替换为设计稿
   .sd-header / .sop 结构, 删除以避免 unused 报错. */

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
  // 统一用后端 progress 数据 (与顶部 ProgressBar 同源, 避免 18 字段 vs 8 字段两套数字打架).
  // 用 fieldLabel 把英文 key 翻译成中文 chip.
  const progress = student?.progress;
  const missing: string[] = Array.isArray(progress?.missingFieldsForRecommend)
    ? progress.missingFieldsForRecommend
    : [];
  const isRecommendable = !!progress?.isRecommendable;
  const overallPercent: number | null =
    typeof progress?.overallCompleteness === 'number' ? progress.overallCompleteness : null;

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
          {overallPercent != null ? (
            <span className="ml-2 text-text-muted">档案完整度 {overallPercent}%</span>
          ) : null}
        </p>
      </div>
      {missing.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {missing.map((key: string) => (
            <span
              key={key}
              className="inline-block rounded border border-rush bg-rush/10 px-2 py-0.5 text-[11px] font-medium text-rush"
            >
              {fieldLabel(key)}
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
        {/* 历史案例参考 (需要 examType + totalScore 才能算 ±20 分范围). */}
        {student?.examType && totalScore != null ? (
          <div className="border-t border-border-subtle pt-3">
            <Link
              href={`/teacher/historical-cases?examType=${student.examType}&scoreFrom=${totalScore - 20}&scoreTo=${totalScore + 20}`}
              className="text-xs text-primary no-underline hover:underline"
            >
              📚 查看 ±20 分相似历史案例 →
            </Link>
          </div>
        ) : null}
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
  requested: '待老师确认',
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
