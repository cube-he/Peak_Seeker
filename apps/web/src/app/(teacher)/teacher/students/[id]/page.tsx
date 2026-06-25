'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { hasRankedPreferredMajors } from '@/components/plan/PrerequisiteCheckModal';
import { Alert, Cascader, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Popconfirm, Select, Spin, message } from 'antd';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { studentApi, type BonusItem, type UpdateStudentDto } from '@/services/student-api';
import { planApi } from '@/services/plan-api';
import { consultationApi, type Consultation } from '@/services/consultation-api';
import {
  Avatar as WnAvatar,
  ChannelIcon,
  Empty as WnEmpty,
  PlanStatusChip,
  StatusChip,
  SubjectChip,
  TIcon,
  fmtMins,
} from '@/components/willnest';
import BonusCalcCard from '@/components/policy/BonusCalcCard';
import { useProvinceOptions } from '@/components/student/picker/options/useProvinceOptions';
import { useCityOptions } from '@/components/student/picker/options/useCityOptions';
import { useUniversityOptions } from '@/components/student/picker/options/useUniversityOptions';
import { useMajorOptions } from '@/components/student/picker/options/useMajorOptions';
import { useMajorCategoryOptions } from '@/components/student/picker/options/useMajorCategoryOptions';
import PreferredMajorTierFormItem from '@/components/student/preferred-majors/PreferredMajorTierFormItem';
import { tagForLevels, type EligibleLevel } from '@/lib/level-mismatch';
import { getRegionCascaderOptions, type CascaderOption } from '@/data/student-options';
import { fieldLabel } from '@/components/student/stage-fields';
import { CHECK_TO_SECTION } from './missing-field-locate';
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

// DTO 字段名 → 所在子页 key。保存校验失败(后端回传 fields)时据此定位到出错字段的子页。
// 只需覆盖"有格式/范围约束、会 400"的字段; 其余未列字段不跳转(仅提示)。
// 子页改成 2 个(required/optional)后, 此映射同步重写 —— 否则保存后端 400 时
// jumpToSection 会切到已不存在的旧 key(basic/exam...)导致表单空白(2026-06-25 修)。
const FIELD_TO_SUBTAB: Record<string, string> = {
  // 必填子页: 基本身份 / 户籍 / 考试成绩 / 色觉
  realName: 'required', phone: 'required',
  gender: 'required', ethnicity: 'required', politicalStatus: 'required', highSchool: 'required', classInfo: 'required',
  province: 'required', city: 'required', county: 'required', isRural: 'required',
  examLocationProvince: 'required', examLocationCity: 'required', examLocationCounty: 'required',
  examType: 'required', firstChoice: 'required', reChoices: 'required', examYear: 'required',
  scoreChinese: 'required', scoreMath: 'required', scoreEnglish: 'required',
  scoreFirstChoice: 'required', scoreSub1: 'required', scoreSub2: 'required',
  totalScore: 'required', provincialRank: 'required',
  colorBlind: 'required', colorWeak: 'required',
  // 选填子页: 出生日期 / 政治面貌与加分 / 健康与体检 / 偏好与规划
  birthDate: 'optional',
  bonusPolicyStatus: 'optional', bonusItems: 'optional',
  height: 'optional', weight: 'optional', visionLeft: 'optional', visionRight: 'optional',
  visionLeftCorrected: 'optional', visionRightCorrected: 'optional',
  physicalLimits: 'optional', medicalHistory: 'optional',
};

// 字段 key → 中文 label 映射(与后端 student-change-log.config.ts 保持一致)
const CHANGE_LOG_FIELD_LABEL: Record<string, string> = {
  // CORE_FOR_RECOMMEND 字段 — 跟后端 field-policy.ts 对齐
  realName: '姓名',
  phone: '学生手机号',
  parentPhone: '家长手机号',
  birthDate: '出生日期',
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

// 方案版本状态 → 中文 / 语义色 (PlanStatusChip 用)
const PLAN_STATUS_LABEL: Record<string, string> = {
  DRAFT: '草稿',
  PENDING_REVIEW: '待审核',
  REVIEWING: '审核中',
  REJECTED: '已退回',
  APPROVED: '已通过',
  PARENT_CONFIRMED: '家长已确认',
  FINALIZED: '终稿',
  PUBLISHED: '已提交',
};
const PLAN_STATUS_TONE: Record<string, string> = {
  DRAFT: 'gray',
  PENDING_REVIEW: 'accent',
  REVIEWING: 'accent',
  REJECTED: 'rush',
  APPROVED: 'primary',
  PARENT_CONFIRMED: 'primary',
  FINALIZED: 'safe',
  PUBLISHED: 'safe',
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
  // 整档保存用: 累积"访问过的子页里注册过的表单字段名"。子页是条件渲染(切走即卸载),
  // 保存时只能从 store 取全量, 但 store 被 initialValues 灌入了非表单字段(id/rankCheck/…),
  // 后端 forbidNonWhitelisted 见到就 400 → 用这份白名单只挑真正的表单字段。
  const knownFieldsRef = useRef<Set<string>>(new Set());

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
    onSuccess: (_data, savedValues) => {
      queryClient.invalidateQueries({ queryKey: ['student-detail', studentId] });
      // 加分自动测算依赖 户籍县/民族/申报细则, 这些字段刚保存 → 立即重算,
      // 否则卡片吃 5 分钟 staleTime, 老师看到的是"无加分"旧结果
      queryClient.invalidateQueries({ queryKey: ['bonus-calc', Number(studentId)] });
      // 保存后跨子页必填检查: 刚提交的 values 叠加原 student = 保存后状态(partial update,
      // 未提交字段沿用库里旧值)。缺关键资料则提示缺哪 + 定位到第一个缺的子页(复用生成方案那套)。
      // 不拦截保存 — 渐进式录入随时可存。toast 统一 key, 连点保存只刷新同一条不堆叠。
      const merged = { ...student, ...(savedValues as Record<string, any>) };
      // 只对必填子页缺失项催填(意向/加分/体检等选填缺失不提示) → 必填齐了就只报"保存成功"。
      const miss = getFieldChecks(merged).filter(
        (c) => !c.passed && CHECK_TO_SECTION[c.key] === 'required',
      );
      if (miss.length > 0) {
        const labels = miss.slice(0, 3).map((c) => c.label).join('、');
        void message.warning({
          content: `已保存 · 还缺 ${miss.length} 项关键资料:${labels}${miss.length > 3 ? ' 等' : ''}，已为你定位`,
          key: 'save-profile',
        });
        jumpToSection('required');
      } else {
        void message.success({ content: '保存成功', key: 'save-profile' });
      }
    },
    onError: (error: any) => {
      // 把后端真实回错原样打到 console, 便于排查 (老师 F12 截图给我).
      // NestJS ValidationPipe 报错 message 是数组, 需要展平成可读字符串.
      const data = error?.response?.data;
      const status = error?.response?.status;
      console.error('[saveMutation] PUT 失败', { status, data, error });
      const rawMsg = data?.message;
      const friendlyMsg = Array.isArray(rawMsg)
        ? rawMsg.slice(0, 3).join('; ')
        : (typeof rawMsg === 'string' ? rawMsg : '');
      // 校验失败(400): 后端回传 fields(出错字段名)。跨子页保存时出错字段可能在未挂载的
      // 子页, 这里定位到第一个能识别子页的出错字段, 切过去并触发校验把它标红, 让老师直接看到。
      const badFields: string[] = Array.isArray(data?.fields) ? data.fields : [];
      if (status === 400 && badFields.length > 0) {
        const targetField = badFields.find((f) => FIELD_TO_SUBTAB[f]) ?? badFields[0];
        const label = CHANGE_LOG_FIELD_LABEL[targetField] ?? targetField;
        const sec = FIELD_TO_SUBTAB[targetField];
        void message.error({
          content: `保存失败 ·「${label}」${friendlyMsg || '格式/取值不正确'}${sec ? '，已为你定位' : ''}`,
          key: 'save-profile',
        });
        if (sec) {
          jumpToSection(sec);
          // 切到子页后该字段才挂载, 下一拍触发校验把出错字段标红
          setTimeout(() => { void form.validateFields().catch(() => {}); }, 80);
        }
        return;
      }
      if (status === 409) {
        message.error({ content: '数据已被其他人修改，请刷新后重试', key: 'save-profile' });
      } else if (status === 400 && friendlyMsg) {
        message.error({ content: `保存失败: ${friendlyMsg}`, key: 'save-profile' });
      } else if (friendlyMsg) {
        message.error({ content: friendlyMsg, key: 'save-profile' });
      } else {
        message.error({ content: `保存失败 (${status ?? 'network'})`, key: 'save-profile' });
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

  const deleteMutation = useMutation({
    mutationFn: () => studentApi.delete(studentId),
    onSuccess: () => {
      message.success('学生已彻底删除');
      // 删除后必须失效学生列表 / 看板缓存: 全局 staleTime 60s(看板更长达 1h), 列表/看板的
      // ['teacher-students']、['teacher-dashboard-*'] 在删除时处于非激活态, 不失效就会被标记为"仍新鲜",
      // router.push 回列表时不重拉 → 渲染出已删学生的残留卡片。invalidate 把它们标脏, 回到页面即重拉。
      queryClient.invalidateQueries({ queryKey: ['teacher-students'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-dashboard-students'] });
      queryClient.invalidateQueries({ queryKey: ['teacher-dashboard-pending-plans'] });
      router.push('/teacher/students');
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.message;
      message.error(Array.isArray(msg) ? msg[0] : msg ?? '删除失败');
    },
  });

  // 二次确认：列清后果再删，物理删不可逆
  const onDeleteStudent = () => {
    Modal.confirm({
      title: '彻底删除该学生?',
      width: 460,
      okText: '彻底删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      content: (
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          将永久删除 <strong>{name}</strong> 的：
          <ul style={{ margin: '8px 0 8px 18px' }}>
            <li>学生档案与全部志愿方案</li>
            <li>沟通记录、附件、收藏等关联数据</li>
            <li>该学生的登录账号</li>
          </ul>
          <span style={{ color: '#dc2626' }}>此操作不可恢复。</span>
        </div>
      ),
      onOk: () => deleteMutation.mutateAsync(),
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

  const handleSave = () => {
    form.validateFields().then(() => {
      // 整档保存: 不只存当前子页。先把当前子页字段名并入白名单(兜底), 再从 store 全量里
      // 只挑访问过的表单字段。store 是实时的, 含所有子页的编辑; 挑白名单字段 = 干净且完整。
      Object.keys(form.getFieldsValue()).forEach((k) => knownFieldsRef.current.add(k));
      const store = form.getFieldsValue(true) as Record<string, unknown>;
      const values: Record<string, any> = {};
      for (const k of knownFieldsRef.current) values[k] = store[k];
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
        // from9Subjects 要求 6 门凑齐才能整组翻译; 不齐时强行翻译会把
        // examType 强翻成历史、totalScore 写成部分和、reChoices 清空
        // (渐进式录入场景必踩)。不齐时: 语数英是独立列照常提交,
        // 槽位字段(科类/首选/再选/总分)一律不发, 保留库里旧值。
        const incompleteMsg = validate6Subjects(subj9);
        if (!incompleteMsg) {
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
        } else {
          void message.info(`${incompleteMsg}；首选/再选成绩将在 6 门凑齐后一并保存`);
        }
      }
      // 后端 DTO 不接受 6 个具体科目字段名 (物/史/化/生/政/地)，删掉
      for (const k of [
        'scorePhysics', 'scoreHistory',
        'scoreChemistry', 'scoreBiology', 'scorePolitics', 'scoreGeography',
      ]) {
        delete (values as Record<string, unknown>)[k];
      }
      // DatePicker 给出 dayjs 对象 (或 null), 后端 DTO 期望 ISO 字符串.
      // dayjs.isDayjs 安全检测后转 ISO; null/undefined 不发送.
      const bd = (values as any).birthDate;
      if (bd && typeof bd === 'object' && typeof bd.toISOString === 'function') {
        (values as any).birthDate = bd.toISOString();
      } else if (bd == null) {
        delete (values as Record<string, unknown>).birthDate;
      }
      saveMutation.mutate(values);
    }).catch(() => {
      // 校验未过: antd 已就近在对应字段下标红(取代顶部 toast); 吞掉 rejection 避免 unhandledrejection
    });
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

  // sd-subtabs 单选: 初值 required; 缺字段定位时切到对应子页 (key 与 CHECK_TO_SECTION 对齐)
  const [subTab, setSubTab] = useState<string>('required');
  const jumpToSection = (sectionKey: string | null) => {
    if (!sectionKey) return;
    setActiveTab('profile');
    setSubTab(sectionKey);
    // 切到子页后滚到该子页表单体 (子页挂载有延迟 → 有限次 rAF 轮询, 取不到就放弃, 不报错).
    let tries = 0;
    const tryScroll = () => {
      const el = document.getElementById(`sd-sec-${sectionKey}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else if (tries < 15) {
        tries += 1;
        requestAnimationFrame(tryScroll);
      }
    };
    requestAnimationFrame(tryScroll);
  };

  // 每次进入某个子页(或切回资料主 tab), 把它此刻注册的表单字段名收进白名单。
  // 离开后子页卸载但名字已记下 → 保存时能从 store 把这些字段一并提交, 不丢跨子页编辑。
  useEffect(() => {
    if (activeTab !== 'profile' || !student) return;
    Object.keys(form.getFieldsValue()).forEach((k) => knownFieldsRef.current.add(k));
  }, [subTab, activeTab, form, student]);

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
  // "缺关键资料" 只算必填子页字段(考试成绩/户籍/色觉); 选填子页(意向/加分/体检)缺失属正常按需采集, 不计入、不催填。
  const missingFieldsList = checks.filter(
    (c) => !c.passed && CHECK_TO_SECTION[c.key] === 'required',
  );
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
          返回学生列表
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
              {student?.examType === 'PHYSICS' || student?.examType === 'HISTORY' ? (
                <>
                  <SubjectChip exam={student.examType} />
                  {student?.firstChoice ||
                  (Array.isArray(student?.reChoices) && student.reChoices.length > 0) ? (
                    <span>
                      {[
                        student?.firstChoice,
                        ...(Array.isArray(student?.reChoices) ? student.reChoices : []),
                      ]
                        .filter(Boolean)
                        .join(' / ')}
                    </span>
                  ) : null}
                </>
              ) : (
                <span>{examType}</span>
              )}
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
              {Array.isArray(student?.preferredBatches) && student.preferredBatches.length > 0 ? (
                <>
                  <span className="sep" />
                  <span>
                    确认批次 <span className="num">{student.preferredBatches.length}</span> 个:{' '}
                    {student.preferredBatches.join(' / ')}
                  </span>
                </>
              ) : null}
            </div>
          </div>
          <div className="actions">
            <button
              type="button"
              className="btn"
              onClick={handleSave}
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
              title={
                intakeStatus !== 'VERIFIED'
                  ? '需先确认学生资料'
                  : progress && !progress.isRecommendable
                  ? '档案未达到可推荐阈值,请先补全关键字段'
                  : ''
              }
              onClick={() => {
                if (canGenerate) {
                  // 轻量化: 不再弹"生成方案前置检查"弹窗, 直接进生成工作台
                  router.push(`/teacher/plans/generate/${studentId}`);
                  return;
                }
                if (intakeStatus !== 'VERIFIED') {
                  void message.warning('需先确认学生资料后再生成');
                  return;
                }
                const reqMiss = getFieldChecks(student).filter(
                  (c) => !c.passed && CHECK_TO_SECTION[c.key] === 'required',
                );
                if (reqMiss.length > 0) {
                  void message.warning(`还缺关键资料:${reqMiss[0].label}，已为你定位`);
                  jumpToSection('required');
                } else {
                  void message.warning('档案未达到可推荐阈值,请补全上方"缺失项"提示的字段');
                }
              }}
            >
              <TIcon.sparkles /> 生成方案
            </button>
            <button
              type="button"
              className="btn"
              style={{ color: '#dc2626' }}
              onClick={onDeleteStudent}
              disabled={deleteMutation.isPending}
            >
              <TIcon.alert /> 删除学生
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
              <span
                className="mchip"
                key={c.key}
                role="button"
                tabIndex={0}
                style={{ cursor: 'pointer' }}
                title="点击跳到该字段所在分区"
                onClick={() => jumpToSection(CHECK_TO_SECTION[c.key] ?? null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    jumpToSection(CHECK_TO_SECTION[c.key] ?? null);
                  }
                }}
              >
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
        {activeTab === 'profile' && (() => {
          // —— 资料 tab: 2 子页 (必填 / 选填) sd-subtabs + pf-sechead + sd-savebar (复刻 student-detail.jsx) ——
          const SUBTABS = [
            { key: 'required', label: '必填资料' },
            { key: 'optional', label: '选填资料' },
          ] as const;
          const SECHEAD: Record<string, [string, string]> = {
            required: [
              '必填资料',
              '出方案与资格判定的硬性字段 · 姓名 / 性别 / 手机号 / 民族 / 户籍 / 考试成绩 / 色觉',
            ],
            optional: [
              '选填资料',
              '按需采集 · 每类可由老师手动开启或跳过,缺失不影响基本出方案',
            ],
          };
          // 必填子页未通过核对项数 → rush 角标; 考试页位次偏差 → accent ! 角标。
          // 选填子页缺失不算"缺关键资料"(按需采集), 不上红角标。
          const missBySec: Record<string, number> = {};
          for (const c of checks) {
            if (!c.passed && CHECK_TO_SECTION[c.key] === 'required') {
              missBySec.required = (missBySec.required ?? 0) + 1;
            }
          }
          const examWarn = !!student.rankCheck?.isMismatch;
          const head = SECHEAD[subTab] ?? ['', ''];
          return (
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                ...student,
                ...student.user,
                // 9 科分数字段：把后端 firstChoice/scoreFirstChoice/reChoices/scoreSub1/2
                // 解开为具体科目分数（scorePhysics / scoreHistory / scoreChemistry...）
                ...to9Subjects(student),
                // birthDate 在 user 表 (ISO 字符串), DatePicker 期望 dayjs 对象
                birthDate: (() => {
                  const raw = student.user?.birthDate ?? student.birthDate;
                  return raw ? dayjs(raw) : undefined;
                })(),
                provincialRank:
                  student.provincialRank ??
                  student.rankCheck?.calculatedRank ??
                  undefined,
                // 高考年份选择器已删除, 固定 2026(隐藏 field) → 新建学生也带上年份
                examYear: student.examYear ?? 2026,
              }}
            >
              <div className="form-body">
                <div className="sd-subtabs">
                  {SUBTABS.map((st) => (
                    <button
                      type="button"
                      key={st.key}
                      className={`sd-subtab ${subTab === st.key ? 'is-active' : ''}`}
                      onClick={() => setSubTab(st.key)}
                    >
                      {st.label}
                      {(missBySec[st.key] ?? 0) > 0 ? (
                        <span className="sd-subtab-badge rush">{missBySec[st.key]}</span>
                      ) : null}
                      {st.key === 'required' && examWarn ? (
                        <span className="sd-subtab-badge accent">!</span>
                      ) : null}
                    </button>
                  ))}
                </div>

                <div className="sd-subtab-body" id={`sd-sec-${subTab}`}>
                  <div className="pf-sechead">
                    <div className="pf-sechead-eyebrow">档案录入</div>
                    <h3>{head[0]}</h3>
                    <p>{head[1]}</p>
                  </div>

                  {subTab === 'required' && (
                    <div className="req-form">
                      <ReqGroup n="1" title="基本身份" desc="姓名 / 性别 / 手机号 / 民族">
                        <BasicFields />
                      </ReqGroup>
                      <ReqGroup
                        n="2"
                        title="户籍"
                        desc="户籍所在地 / 高考报名地 · 决定一分一段与三州十七县两区专项加分适用"
                      >
                        <HouseholdFields />
                      </ReqGroup>
                      <ReqGroup
                        n="3"
                        title="考试成绩"
                        desc="先定选科组合,再录各科分数 · 总分自动累加"
                      >
                        <ExamFields rankCheck={student.rankCheck} />
                      </ReqGroup>
                      <ReqGroup
                        n="4"
                        title="色觉"
                        desc="军警 / 航海 / 医学 / 化工等专业资格判定的硬门槛"
                      >
                        <ColorVisionFields />
                      </ReqGroup>
                    </div>
                  )}
                  {subTab === 'optional' && (
                    <div className="opt-form">
                      <div className="opt-intro">
                        以下均为选填。每一类可由老师手动「采集 / 跳过」——按学生实际需要筛选要录入的信息;采集得越全,资格判定与推荐越精准。
                      </div>
                      <OptionalSection
                        title="政治面貌与加分"
                        desc="退役 / 烈士子女 / 三州十七县两区等 · 直接影响投档有效分"
                      >
                        <div className="space-y-4">
                          <BonusFields />
                          <BonusCalcCard studentProfileId={Number(studentId)} />
                        </div>
                      </OptionalSection>
                      <OptionalSection
                        title="健康与体检"
                        desc="出生日期 / 身高 / 体重 / 视力 / 体检受限 / 既往病史 · 军警航海等专业资格判定用"
                        defaultOn={false}
                      >
                        <div className="sd-form-grid" style={{ marginBottom: 12 }}>
                          <div className="field">
                            <label>出生日期<span className="sc-hint"> 批次年龄校验用(军校/飞行员等有年龄上限)</span></label>
                            <Form.Item name="birthDate" noStyle>
                              <DatePicker
                                style={{ width: '100%' }}
                                format="YYYY-MM-DD"
                                placeholder="选择出生日期"
                                disabledDate={(d) => d && d.isAfter(dayjs())}
                              />
                            </Form.Item>
                          </div>
                        </div>
                        <HealthFields />
                      </OptionalSection>
                      <OptionalSection
                        title="偏好与规划"
                        desc="优先模式 / 意向专业梯队 / 城市院校偏好 / 排除项 · AI 推荐约束"
                      >
                        <PreferenceFields
                          eligibleLevel={student?.eligibleLevel ?? null}
                          examType={student?.examType ?? null}
                        />
                      </OptionalSection>
                    </div>
                  )}

                  {progress && !progress.isRecommendable ? (
                    <Alert
                      style={{ marginTop: 20 }}
                      type="info"
                      showIcon
                      message={'档案未达到"可推荐"阈值'}
                      description={(() => {
                        const missing = Array.isArray(progress.missingFieldsForRecommend)
                          ? progress.missingFieldsForRecommend
                          : [];
                        if (missing.length === 0) {
                          return '补完整关键字段后，"生成方案"按钮才会启用。';
                        }
                        // 把后端字段 key 翻译成中文 label, 直接列出来让老师知道缺什么
                        const labels = (missing as string[]).map((f: string) => fieldLabel(f));
                        return `还缺 ${missing.length} 项关键字段: ${labels.join('、')}。补齐后"生成方案"按钮才会启用。`;
                      })()}
                    />
                  ) : null}
                </div>

                <div className="sd-savebar">
                  <div className="sd-savebar-info">
                    <span className="sd-savebar-pct">
                      档案完整度 <b>{overall}%</b>
                    </span>
                    <span className="sd-savebar-dot" />
                    <span className={missingFieldsList.length > 0 ? 'sd-savebar-miss' : 'sd-savebar-ok'}>
                      {missingFieldsList.length > 0
                        ? `还缺 ${missingFieldsList.length} 项关键资料`
                        : '关键资料就绪'}
                    </span>
                    <span className="sd-savebar-note">渐进式录入 · 任何时候可保存</span>
                  </div>
                  <div className="sd-savebar-actions">
                    <button type="button" className="sd-savebar-ghost" onClick={onExportIntake}>
                      <TIcon.excel /> 导出登记表
                    </button>
                    <button
                      type="button"
                      className="sd-savebar-save"
                      onClick={handleSave}
                      disabled={saveMutation.isPending}
                    >
                      <TIcon.save /> {saveMutation.isPending ? '保存中...' : '保存资料'}
                    </button>
                  </div>
                </div>
              </div>
            </Form>
          );
        })()}
        {activeTab === 'comm' && <CommunicationTabContent studentId={studentId} />}
        {activeTab === 'plan' && <PlanListTabContent student={student} />}
        {activeTab === 'external' && (
          <ExternalMaterialsTabContent student={student} />
        )}
        {activeTab === 'log' && <ChangeLogTabContent studentId={studentId} />}
      </div>

      {/* 原 antd Tabs + 副区 grid 已替换成 sd-tabs + Tab content 直接展开 */}
    </div>
  );
}

/* —— 必填资料分组卡片 (复刻 student-detail.jsx ReqGroup): 序号圆点 + 标题(带红*) + desc + body —— */
function ReqGroup({
  n,
  title,
  desc,
  children,
}: {
  n: number | string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <section className="req-grp">
      <div className="req-grp-head">
        <span className="req-grp-n">{n}</span>
        <div className="req-grp-tt">
          <h4>
            {title}
            <i className="req">*</i>
          </h4>
          <p>{desc}</p>
        </div>
      </div>
      <div className="req-grp-body">{children}</div>
    </section>
  );
}

/* —— 选填资料可折叠区 (复刻 student-detail.jsx OptionalSection): 头部点击展开/收起 + 采集中/已跳过 toggle —— */
function OptionalSection({
  title,
  desc,
  defaultOn = true,
  children,
}: {
  title: string;
  desc: string;
  defaultOn?: boolean;
  children: React.ReactNode;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <section className={`opt-sec ${on ? 'is-on' : 'is-off'}`}>
      <div className="opt-sec-head" onClick={() => setOn(!on)}>
        <div className="opt-sec-tt">
          <h4>{title}</h4>
          <p>{desc}</p>
        </div>
        <button
          type="button"
          className={`opt-sec-toggle ${on ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            setOn(!on);
          }}
        >
          <span className="dot" />
          {on ? '采集中' : '已跳过'}
        </button>
      </div>
      {on ? <div className="opt-sec-body">{children}</div> : null}
    </section>
  );
}

/* —— 资料页设计控件 (复刻 student-detail.jsx, 经 Form.Item 注入 value/onChange) —— */
function PfSeg<T extends string | number | boolean>({
  value,
  onChange,
  options,
}: {
  value?: T;
  onChange?: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="pf-seg">
      {options.map((o) => (
        <button
          type="button"
          key={String(o.value)}
          className={`pf-seg-opt ${value === o.value ? 'on' : ''}`}
          onClick={() => onChange?.(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PfSwitch({
  checked,
  onChange,
  onText = '接受',
  offText = '不接受',
}: {
  checked?: boolean;
  onChange?: (v: boolean) => void;
  onText?: string;
  offText?: string;
}) {
  return (
    <div className="pf-sw">
      <button
        type="button"
        className={`pf-sw-track ${checked ? 'on' : ''}`}
        onClick={() => onChange?.(!checked)}
      >
        <span className="pf-sw-knob" />
      </button>
      <span className="pf-sw-label">{checked ? <b>{onText}</b> : offText}</span>
    </div>
  );
}

function PfUnitInput({
  value,
  onChange,
  unit,
  placeholder,
  step,
  min,
  max,
}: {
  value?: number | null;
  onChange?: (v: number | null) => void;
  unit?: string;
  placeholder?: string;
  step?: number;
  min?: number;
  max?: number;
}) {
  return (
    <div className="pf-unit">
      <input
        type="number"
        inputMode="decimal"
        value={value == null ? '' : value}
        placeholder={placeholder}
        step={step}
        min={min}
        max={max}
        onChange={(e) => {
          const r = e.target.value;
          onChange?.(r === '' ? null : Number(r));
        }}
      />
      {unit ? <span>{unit}</span> : null}
    </div>
  );
}

/* sc-cell 录分控件: 有值变白底, 超分报红字; 经 Form.Item 注入 value/onChange,
   onValueChange 单独透传给联动逻辑 (首选/再选互斥) */
function ScoreCellControl({
  value,
  onChange,
  onValueChange,
  label,
  max,
  disabled,
  placeholder,
}: {
  value?: number | null;
  onChange?: (v: number | null) => void;
  onValueChange?: (v: number | null) => void;
  label: string;
  max: number;
  disabled?: boolean;
  placeholder?: string;
}) {
  const has = value != null && !Number.isNaN(value as number);
  const over = value != null && (value as number) > max;
  return (
    <div className={`sc-cell ${has ? 'has' : ''} ${over ? 'err' : ''}`}>
      <div className="sc-cell-head">
        <span className="sc-cell-label">{label}</span>
        <span className="sc-cell-max">满分 {max}</span>
      </div>
      <input
        type="number"
        inputMode="numeric"
        disabled={disabled}
        value={value == null ? '' : value}
        placeholder={placeholder ?? '—'}
        onChange={(e) => {
          const r = e.target.value;
          const v = r === '' ? null : Number(r);
          onChange?.(v);
          onValueChange?.(v);
        }}
      />
      {over && <div className="sc-cell-err">不能超过 {max} 分</div>}
    </div>
  );
}

function BasicFields() {
  return (
    <div className="sd-form-grid">
      <div className="field">
        <label>姓名<span className="req">*</span></label>
        <Form.Item name="realName" rules={[{ required: true }]} noStyle>
          <Input placeholder="学生姓名" />
        </Form.Item>
      </div>
      <div className="field">
        <label>手机号<span className="req">*</span></label>
        <Form.Item name="phone" rules={[{ pattern: /^1[3-9]\d{9}$/, message: '请输入正确的 11 位手机号' }]}>
          <Input placeholder="学生或家长手机号,沟通用" />
        </Form.Item>
      </div>
      <div className="field">
        <label>性别<span className="req">*</span></label>
        <Form.Item name="gender" noStyle>
          <PfSeg
            options={[
              { value: 'MALE', label: '男' },
              { value: 'FEMALE', label: '女' },
            ]}
          />
        </Form.Item>
      </div>
      <div className="field">
        <label>民族<span className="req">*</span></label>
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
        <label>政治面貌<span className="req">*</span></label>
        <Form.Item name="politicalStatus" noStyle>
          <PfSeg
            options={[
              { value: 'MASSES', label: '群众' },
              { value: 'LEAGUE_MEMBER', label: '团员' },
              { value: 'PARTY_MEMBER', label: '党员' },
            ]}
          />
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
    <div className="pf-form">
      <div className="pf-shared">
        <TIcon.info />
        户籍与高考报名地学生可自填、老师可改可审核；决定一分一段表与三州十七县两区加分适用。
      </div>
      {/* 户籍所在地 — Cascader 保留 antd (业务下拉, 不改) */}
      <div className="pf-field">
        <label>
          户籍所在地 <i className="req">*</i>
        </label>
        <RegionCascaderField
          fieldKeys={['province', 'city', 'county']}
          options={regionOptions}
          placeholder="选择户籍省 / 市 / 县区"
        />
      </div>
      <div className="pf-row2">
        <div className="pf-field">
          <label>
            户口性质 <i className="req">*</i>
          </label>
          <Form.Item name="isRural" noStyle>
            <PfSeg
              options={[
                { value: true, label: '农村户籍' },
                { value: false, label: '城镇户籍' },
              ]}
            />
          </Form.Item>
        </div>
        <div className="pf-field">
          <label>&nbsp;</label>
          <button type="button" className="pf-gbtn" onClick={copyHukouToExamLocation}>
            <TIcon.check /> 同户籍所在地
          </button>
        </div>
      </div>
      {/* 高考报名地 — Cascader 保留 antd */}
      <div className="pf-field">
        <label>
          高考报名地 <i className="req">*</i> <em>决定一分一段 / 加分适用</em>
        </label>
        <RegionCascaderField
          fieldKeys={['examLocationProvince', 'examLocationCity', 'examLocationCounty']}
          options={regionOptions}
          placeholder="选择报名省 / 市 / 县区"
        />
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
  const examType = Form.useWatch('examType', form) as 'PHYSICS' | 'HISTORY' | undefined;
  const RE = [
    { key: 'scoreChemistry', label: '化学' },
    { key: 'scoreBiology', label: '生物' },
    { key: 'scorePolitics', label: '政治' },
    { key: 'scoreGeography', label: '地理' },
  ] as const;
  // 再选选择是纯 UI 本地态, 初值从已填分数推导 (4 选 2); 分数本身仍是 form 的真值
  const [reSel, setReSel] = useState<string[]>(() =>
    RE.filter((r) => form.getFieldValue(r.key) != null).map((r) => r.key),
  );

  const pickFirst = (type: 'PHYSICS' | 'HISTORY') => {
    form.setFieldsValue({
      examType: type,
      firstChoice: type === 'PHYSICS' ? '物理' : '历史',
      // 切首选 → 清另一首选分数 (物理/历史互斥)
      ...(type === 'PHYSICS' ? { scoreHistory: undefined } : { scorePhysics: undefined }),
    });
  };
  const toggleRe = (key: string) => {
    setReSel((prev) => {
      if (prev.includes(key)) {
        form.setFieldValue(key, undefined); // 取消选择 → 清该科分数
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 2) return prev; // 最多 2 门
      return [...prev, key];
    });
  };

  const firstKey = examType === 'HISTORY' ? 'scoreHistory' : 'scorePhysics';
  const firstLabel = examType === 'HISTORY' ? '历史' : '物理';

  return (
    <div className="exam-redo">
      {/* examType / firstChoice 靠 setFieldsValue 写入, 必须注册成 field entity, 否则 useWatch 读不到 → chip 高亮/科类/首选列全失效 */}
      <Form.Item name="examType" hidden><Input /></Form.Item>
      <Form.Item name="firstChoice" hidden><Input /></Form.Item>
      {/* 高考年份固定 2026(单届产品, 选择器多余) — 仍注册为隐藏 field, 让值随档案落库,
          避免新建学生 examYear 为空导致按年份取批次/分数线时查不到。
          "成绩来源" 选择器(REAL_EXAM/MOCK_EXAM/ESTIMATED)与后端 ExamSource 枚举不匹配且非必填, 已删除。 */}
      <Form.Item name="examYear" hidden><Input /></Form.Item>

      {/* ① 选科组合 — 勾选 / 复选框, 不录分 */}
      <div className="exam-block">
        <div className="exam-block-h">
          ① 选科组合<span>先勾选科目，再到下方录分 · 科类随首选自动确定</span>
        </div>
        <div className="choice-cols">
          <div className="choice-col">
            <div className="choice-label">
              首选科目 <i className="req">*</i>
              <em>物理 / 历史 二选一</em>
            </div>
            <div className="ec-chips">
              {(['PHYSICS', 'HISTORY'] as const).map((t) => {
                const on = examType === t;
                return (
                  <button
                    type="button"
                    key={t}
                    className={`ec-chip radio ${on ? 'on' : ''}`}
                    onClick={() => pickFirst(t)}
                  >
                    <span className="ec-box">{on ? <TIcon.check /> : null}</span>
                    {t === 'PHYSICS' ? '物理' : '历史'}
                  </button>
                );
              })}
            </div>
            <div className="ec-derived">
              科类：
              <b>{examType === 'HISTORY' ? '历史类' : examType === 'PHYSICS' ? '物理类' : '未定'}</b>
            </div>
          </div>
          <div className="choice-col">
            <div className="choice-label">
              再选科目 <i className="req">*</i>
              <em>化 / 生 / 政 / 地 四选二</em>
            </div>
            <div className="ec-chips">
              {RE.map((r) => {
                const on = reSel.includes(r.key);
                const dis = !on && reSel.length >= 2;
                return (
                  <button
                    type="button"
                    key={r.key}
                    className={`ec-chip ${on ? 'on' : ''}`}
                    disabled={dis}
                    onClick={() => toggleRe(r.key)}
                  >
                    <span className="ec-box">{on ? <TIcon.check /> : null}</span>
                    {r.label}
                  </button>
                );
              })}
            </div>
            <div className="ec-derived">
              已选 <b>{reSel.length}/2</b>
              {reSel.length === 2 ? ' · 组合已定' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* ② 各科成绩 — 只为已选科目录分 */}
      <div className="exam-block">
        <div className="exam-block-h">
          ② 各科成绩<span>语数外满分 150，选考科目满分 100 · 超限报红字</span>
        </div>
        <div className="sc-sub">必考三科</div>
        <div className="sc-grid">
          {/* 不加 required: 老师建档支持渐进式录入, 完整度 / missing-card 仍标缺失项 */}
          <TeacherScoreInput name="scoreChinese" label="语文" max={150} />
          <TeacherScoreInput name="scoreMath" label="数学" max={150} />
          <TeacherScoreInput name="scoreEnglish" label="英语" max={150} />
        </div>
        <div className="sc-sub">选考三科（按上方选科组合）</div>
        <div className="sc-grid">
          <TeacherScoreInput
            name={firstKey}
            label={`首选 · ${firstLabel}`}
            max={100}
            onChange={(v) => {
              // 未点首选就直接录分 → 默认按当前列(物理)落 examType
              if (v != null && examType == null) {
                form.setFieldsValue({ examType: 'PHYSICS', firstChoice: '物理' });
              }
            }}
          />
          {[0, 1].map((i) => {
            const r = RE.find((x) => x.key === reSel[i]);
            return r ? (
              <TeacherScoreInput key={r.key} name={r.key} label={`再选 · ${r.label}`} max={100} />
            ) : (
              <div className="sc-cell empty" key={`re-empty-${i}`}>
                请先选再选科目 {i + 1}
              </div>
            );
          })}
        </div>
      </div>

      {/* ③ 总分(自动累加) + 全省位次 */}
      <div className="exam-foot">
        <div className="exam-total">
          <div className="k">总分 · 自动累加</div>
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
                <div className="v">
                  {total}
                  <small>分</small>
                </div>
              );
            }}
          </Form.Item>
        </div>
        <div className="exam-rank">
          <label>
            全省位次{' '}
            <span className="lock-chip">
              <TIcon.lock /> 老师独占
            </span>
          </label>
          <Form.Item name="provincialRank" noStyle>
            <RankInputControl />
          </Form.Item>
          <EstimatedRankHint />
          {rankCheck ? (
            <div className="sc-hint">
              <RankCheckExtra rankCheck={rankCheck} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/* 全省位次原生输入 (设计稿 .exam-rank input 样式); EstimatedRankHint 仍会自动回填 */
function RankInputControl({
  value,
  onChange,
}: {
  value?: number | null;
  onChange?: (v: number | null) => void;
}) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={1}
      value={value == null ? '' : value}
      placeholder="6 科齐后自动估算"
      onChange={(e) => {
        const r = e.target.value;
        onChange?.(r === '' ? null : Number(r));
      }}
    />
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
    <Form.Item
      name={name}
      rules={[
        ...(required ? [{ required: true, message: '必填' }] : []),
        // 用 rules 校验而非原生 max —— 超分不静默截断, 提交时报红字"不能超过 N"
        { type: 'number', max, message: `不能超过 ${max} 分` },
      ]}
      noStyle
    >
      <ScoreCellControl
        label={label}
        max={max}
        disabled={disabled}
        placeholder={placeholder}
        onValueChange={onChange}
      />
    </Form.Item>
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

  // 2026 一分一段已入库(2026-06-25), 直接按考试年份查, 不再强制回退 2025 代理。
  // (旧逻辑 cap 到 2025 → 即便 2026 有数据也只查 2025, 与后端 rankCheck(已用2026)对不上, 报"相差N位"。)
  const requestedYear = typeof examYear === 'number' ? examYear : null;
  const effectiveYear = requestedYear ?? 2026;

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
    <div className="pf-form">
      <div className="pf-shared">
        <TIcon.info />
        加分政策按四川省高考实施细则录入，关系到投档有效分计算；老师核验材料后维护。
      </div>
      <div className="pf-field">
        <label>
          加分政策状态 <i className="req">*</i>
        </label>
        <Form.Item name="bonusPolicyStatus" noStyle>
          <PfSeg
            options={[
              { value: 'NONE', label: '没有' },
              { value: 'HAS_BONUS', label: '有' },
              { value: 'UNKNOWN', label: '不清楚' },
            ]}
          />
        </Form.Item>
      </div>
      <div className="pf-field">
        <label>
          加分细则 <em>关系投档有效分</em>
        </label>
        {/* bonusItems 库里是 {type,value,source}[], UI 用 type[] 多选; 搜索量大保留 antd Select */}
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

/* 色觉: 从 HealthFields 抽出 (必填资料组用). UI 三选一, 底层仍是 colorBlind/colorWeak 两布尔.
   注意只能在一处渲染这两个 Form.Item, 避免 antd 同名字段双重注册导致数据错乱. */
function ColorVisionFields() {
  return (
    <div className="pf-field">
      <label>
        色觉 <i className="req">*</i> <em>底层映射 colorBlind / colorWeak 两布尔</em>
      </label>
      <Form.Item name="colorBlind" hidden valuePropName="checked"><Checkbox /></Form.Item>
      <Form.Item name="colorWeak" hidden valuePropName="checked"><Checkbox /></Form.Item>
      <Form.Item
        noStyle
        shouldUpdate={(p, c) => p.colorBlind !== c.colorBlind || p.colorWeak !== c.colorWeak}
      >
        {({ getFieldValue, setFieldsValue }) => {
          const blind = getFieldValue('colorBlind');
          const weak = getFieldValue('colorWeak');
          const val = blind ? 'BLIND' : weak ? 'WEAK' : (blind === false && weak === false ? 'NORMAL' : undefined);
          return (
            <PfSeg
              value={val}
              onChange={(v) => setFieldsValue({ colorBlind: v === 'BLIND', colorWeak: v === 'WEAK' })}
              options={[
                { value: 'NORMAL', label: '正常' },
                { value: 'BLIND', label: '色盲' },
                { value: 'WEAK', label: '色弱' },
              ]}
            />
          );
        }}
      </Form.Item>
    </div>
  );
}

function HealthFields() {
  return (
    <div className="pf-form">
      <div className="pf-row2">
        <div className="pf-field">
          <label>
            身高 <i className="req">*</i>
          </label>
          <Form.Item name="height" rules={[{ type: 'number', min: 100, max: 250, message: '身高需在 100-250cm 之间' }]}>
            <PfUnitInput unit="cm" placeholder="100 – 250" min={100} max={250} />
          </Form.Item>
        </div>
        <div className="pf-field">
          <label>
            体重 <i className="req">*</i>
          </label>
          <Form.Item name="weight" rules={[{ type: 'number', min: 20, max: 200, message: '体重需在 20-200kg 之间' }]}>
            <PfUnitInput unit="kg" placeholder="20 – 200" min={20} max={200} />
          </Form.Item>
        </div>
      </div>
      <div className="pf-row2">
        <div className="pf-field">
          <label>
            左眼裸眼视力 <i className="req">*</i> <em>五分记录法</em>
          </label>
          <Form.Item name="visionLeft" rules={[{ type: 'number', min: 1, max: 5.3, message: '裸眼视力需在 1.0-5.3 之间' }]}>
            <PfUnitInput placeholder="1.0 – 5.3" step={0.1} min={1} max={5.3} />
          </Form.Item>
        </div>
        <div className="pf-field">
          <label>
            右眼裸眼视力 <i className="req">*</i> <em>五分记录法</em>
          </label>
          <Form.Item name="visionRight" rules={[{ type: 'number', min: 1, max: 5.3, message: '裸眼视力需在 1.0-5.3 之间' }]}>
            <PfUnitInput placeholder="1.0 – 5.3" step={0.1} min={1} max={5.3} />
          </Form.Item>
        </div>
      </div>
      <div className="pf-field">
        <label>
          体检受限项 <em>自由打标签</em>
        </label>
        <Form.Item name="physicalLimits" noStyle>
          <Select mode="tags" allowClear placeholder="可输入多个,回车添加" />
        </Form.Item>
      </div>
      <div className="pf-field">
        <label>既往病史 / 特殊情况</label>
        <Form.Item name="medicalHistory" noStyle>
          <Input.TextArea rows={2} placeholder="如有先天性疾病、过敏等请详填" />
        </Form.Item>
      </div>
    </div>
  );
}

function PreferenceFields({
  eligibleLevel = null,
  examType = null,
}: {
  eligibleLevel?: EligibleLevel;
  examType?: string | null;
}) {
  // 跳专业库工作台时带上学生 id, 在那边选完直接存回本学生的意向池
  const prefParams = useParams<{ id: string }>();
  const { data: provinceOptions } = useProvinceOptions();
  const { data: cityOptions } = useCityOptions();
  const { data: universityOptions, isLoading: isUniversityLoading } = useUniversityOptions();
  const { data: majorOptions, isLoading: isMajorLoading } = useMajorOptions();
  const { data: majorCategoryOptions, isLoading: isMajorCategoryLoading } = useMajorCategoryOptions();

  // 给意向院校选项加层次标记 (与学生可上层次对不上时括号提示), 仅意向院校,
  // 排除院校不标 (那是主动排除, 层次提示无意义)
  const markedUniversityOptions = useMemo(
    () =>
      (universityOptions ?? []).map((o: any) => {
        const t = tagForLevels(o.levels, examType, eligibleLevel);
        return t ? { ...o, label: `${o.label}（${t}）` } : o;
      }),
    [universityOptions, examType, eligibleLevel],
  );

  return (
    <div className="pf-form">
      <div className="pf-field">
        <label>
          优先模式 <i className="req">*</i>
        </label>
        <Form.Item name="priorityMode" noStyle>
          <PfSeg
            options={[
              { value: 'UNIVERSITY_FIRST', label: '院校优先' },
              { value: 'MAJOR_FIRST', label: '专业优先' },
              { value: 'CITY_FIRST', label: '城市优先' },
              { value: 'BALANCED', label: '均衡' },
            ]}
          />
        </Form.Item>
      </div>
      {/* 经济边界: 工作台"接受边界 民办: 未确定"读的就是这个字段, 此前只有学生小程序能填,
          老师面谈采集到的信息没有落库入口 → 对经济困难学生这是候选过滤的第一变量 */}
      <div className="pf-field">
        <label>
          是否接受民办 <em>学费通常 3-8 万/年 · 经济困难家庭重点确认</em>
        </label>
        <Form.Item name="acceptPrivate" noStyle>
          <PfSeg
            options={[
              { value: 'STRICT', label: '不接受' },
              { value: 'MODERATE', label: '部分接受' },
              { value: 'RELAXED', label: '接受' },
              { value: 'UNDECIDED', label: '未定' },
            ]}
          />
        </Form.Item>
      </div>
      <div className="pf-field">
        <label>
          是否接受中外合作办学 <em>学费通常较高 · 多为合作办学 / 双校园培养</em>
        </label>
        <Form.Item name="acceptSinoForeign" valuePropName="checked" noStyle>
          <PfSwitch />
        </Form.Item>
      </div>
      {/* 院校/专业/省市 Picker 保留 antd Select (业务搜索下拉, 不改) */}
      <div className="pf-row2">
        <div className="pf-field">
          <label>意向省份</label>
          <Form.Item name="preferredProvinces" noStyle>
            <Select {...pickerSelectProps(provinceOptions)} placeholder="选择省份" />
          </Form.Item>
        </div>
        <div className="pf-field">
          <label>意向城市</label>
          <Form.Item name="preferredCities" noStyle>
            <Select {...pickerSelectProps(cityOptions)} placeholder="选择城市" />
          </Form.Item>
        </div>
      </div>
      <div className="pf-field">
        <label>
          意向专业（梯队） <i className="req">*</i>
          <a className="pf-link" href={`/majors?studentId=${prefParams.id}`} target="_blank" rel="noreferrer">
            去专业库挑选（看在川计划/分数带）→
          </a>
        </label>
        <Form.Item name="preferredMajors" noStyle>
          <PreferredMajorTierFormItem
            options={majorOptions ?? []}
            isLoading={isMajorLoading}
            eligibleLevel={eligibleLevel}
            examType={examType}
          />
        </Form.Item>
      </div>
      <div className="pf-field">
        <label>
          意向院校
          <a className="pf-link" href={`/universities?studentId=${prefParams.id}`} target="_blank" rel="noreferrer">
            去院校库挑选（带冲稳保）→
          </a>
        </label>
        <Form.Item name="preferredUniversities" noStyle>
          <Select {...pickerSelectProps(markedUniversityOptions)} loading={isUniversityLoading} placeholder="搜索院校" />
        </Form.Item>
      </div>
      <div className="pf-row2">
        <div className="pf-field">
          <label>排除院校</label>
          <Form.Item name="excludedUniversities" noStyle>
            <Select {...pickerSelectProps(universityOptions)} loading={isUniversityLoading} placeholder="搜索院校" />
          </Form.Item>
        </div>
        <div className="pf-field">
          <label>
            排除专业类 <em>整类不要 · 如机械类 / 安全类</em>
          </label>
          <Form.Item name="excludedMajorCategories" noStyle>
            <Select
              {...pickerSelectProps(majorCategoryOptions ?? [])}
              loading={isMajorCategoryLoading}
              placeholder="搜索专业类"
            />
          </Form.Item>
        </div>
      </div>
      <div className="pf-field">
        <label>
          排除个别专业 <em>类内某几个不要 · 精确到名</em>
        </label>
        <Form.Item name="excludedMajors" noStyle>
          <Select {...pickerSelectProps(majorOptions)} loading={isMajorLoading} placeholder="搜索专业" />
        </Form.Item>
      </div>
      <div className="pf-row2">
        <div className="pf-field">
          <label>职业方向</label>
          <Form.Item name="careerDirection" noStyle>
            <Input.TextArea rows={2} placeholder="可填多个方向,如电子信息 / 计算机" />
          </Form.Item>
        </div>
        <div className="pf-field">
          <label>其他要求</label>
          <Form.Item name="otherRequirements" noStyle>
            <Input.TextArea rows={2} placeholder="如希望保留独立招生计划院校等" />
          </Form.Item>
        </div>
      </div>
    </div>
  );
}

// ── 顶部摘要条:身份 + 关键摘要 + 操作 ──
/* StudentSummaryBar + SopTimeline 旧子组件已被主入口 inline 替换为设计稿
   .sd-header / .sop 结构, 删除以避免 unused 报错. */

// MVP 实装 (Plan 10 版本对比按需后做): 列出该学生所有方案版本, 点击跳转到方案详情页
function PlanListTabContent({ student }: { student: any }) {
  const plans: any[] = student?.volunteerPlans ?? [];
  return (
    <div>
      <div className="pf-sechead">
        <div className="pf-sechead-eyebrow">志愿方案</div>
        <h3>方案版本</h3>
        <p>AI 生成的冲 / 稳 / 保方案，按版本管理</p>
      </div>
      {plans.length === 0 ? (
        <WnEmpty
          icon="plans"
          title="还没有方案"
          sub="补全学生关键资料后，用顶部「生成方案」按钮自动出方案"
        />
      ) : (
        <div className="plan-list">
          {plans.map((p) => (
            <Link
              key={p.id}
              href={`/teacher/plans/${p.id}`}
              className="plan-row"
              style={{ textDecoration: 'none' }}
            >
              <span className="v">
                v{p.versionNo}
                {p.isFinal ? <span className="tail">终稿</span> : null}
              </span>
              <span className="note">{p.versionNote || '—'}</span>
              <span>
                <PlanStatusChip status={p.status} dict={PLAN_STATUS_LABEL} toneDict={PLAN_STATUS_TONE} />
              </span>
              <span className="when">{new Date(p.updatedAt).toLocaleDateString('zh-CN')}</span>
              <span className="actions">
                <span className="go">查看 →</span>
              </span>
            </Link>
          ))}
        </div>
      )}
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
      // 省/市二选一: 填了意向省份就够(不必再选城市); 城市/排除城市/留省偏好同样算满足
      label: '意向地区',
      passed:
        (Array.isArray(student?.preferredProvinces) && student.preferredProvinces.length > 0) ||
        (Array.isArray(student?.preferredCities) && student.preferredCities.length > 0) ||
        (Array.isArray(student?.excludedCities) && student.excludedCities.length > 0) ||
        !!student?.stayPreference,
    },
    {
      key: 'majors',
      label: '意向专业',
      passed:
        hasRankedPreferredMajors(student?.preferredMajors) ||
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

function ChangeLogTabContent({ studentId }: { studentId: string | number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['student-change-logs', studentId],
    queryFn: () => studentApi.getChangeLogs(studentId, { limit: 100 }),
    enabled: !!studentId,
  });

  const head = (
    <div className="pf-sechead">
      <div className="pf-sechead-eyebrow">留痕</div>
      <h3>变更日志</h3>
      <p>关键字段的修改记录，按时间倒序</p>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {head}
        <div className="rounded-lg bg-bg/30 py-12 text-center">
          <Spin />
        </div>
      </div>
    );
  }

  const logs = data?.logs ?? [];
  return (
    <div>
      {head}
      {logs.length === 0 ? (
        <WnEmpty
          icon="history"
          title="暂无变更记录"
          sub="学生 / 老师修改关键字段时会在这里显示"
        />
      ) : (
        <div className="cl-list">
          {logs.map((log) => {
            const fieldName = CHANGE_LOG_FIELD_LABEL[log.fieldKey] ?? log.fieldKey;
            const actorLabel = log.actor === 'student' ? '学生 / 家长' : '老师';
            const actorName = log.changedBy?.realName ?? log.changedBy?.username ?? '未知';
            const when = new Date(log.createdAt).toLocaleString('zh-CN', {
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div className="cl-row" key={log.id}>
                <span className="when">{when}</span>
                <span className="field-name">{fieldName}</span>
                <span className="change">
                  <span className="old">{formatFieldValue(log.oldValue)}</span>
                  <span className="arr">→</span>
                  <span className="new">{formatFieldValue(log.newValue)}</span>
                </span>
                <span className="who">
                  {actorName}
                  <span className="role">{actorLabel}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
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
    <div>
      <div className="pf-sechead">
        <div className="pf-sechead-eyebrow">交付物</div>
        <h3>对外材料</h3>
        <p>导出给学生 / 家长的方案 Excel</p>
      </div>
      <div className="collapse" data-open="true">
        <div className="collapse-head" style={{ cursor: 'default' }}>
          <h4>
            <span className="ic"><TIcon.excel /></span>
            方案 Excel
          </h4>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{plans.length} 个方案</span>
        </div>
        <div style={{ padding: '0 22px 16px', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, marginTop: -4 }}>
          按版本独立导出 · A3 横版 24 列 · 冲稳保彩色分组 · 可在 Excel 内继续微调
        </div>
        <div style={{ padding: '0 8px 12px' }}>
          {plans.length === 0 ? (
            <div style={{ padding: '24px 14px', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
              暂无方案 · 先去出第一版
            </div>
          ) : null}
          {plans.map((p) => (
            <div
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: 16 }}>
                  v{p.versionNo}
                </span>
                <PlanStatusChip status={p.status} dict={PLAN_STATUS_LABEL} toneDict={PLAN_STATUS_TONE} />
                {p.versionNote ? (
                  <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{p.versionNote}</span>
                ) : null}
              </div>
              <button
                type="button"
                className="qa"
                disabled={exporting === `plan-${p.id}`}
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
              >
                <TIcon.download /> 导出 Excel
              </button>
            </div>
          ))}
        </div>
      </div>
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
  const [editTarget, setEditTarget] = useState<Consultation | null>(null);

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

  // 取消 = update status 'cancelled', 保留记录可追溯 (不走 DELETE)
  const cancelMutation = useMutation({
    mutationFn: (id: number) => consultationApi.update(id, { status: 'cancelled' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['consultations', studentId] });
      message.success('预约已取消');
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? '取消失败'),
  });

  const head = (
    <div className="pf-sechead">
      <div className="pf-sechead-eyebrow">学生服务</div>
      <h3>沟通记录</h3>
      <p>面谈 / 电话 / 微信记录，含主题、状态与服务时长</p>
    </div>
  );

  if (isLoading) {
    return (
      <div>
        {head}
        <div className="rounded-lg bg-bg/30 py-12 text-center">
          <Spin />
        </div>
      </div>
    );
  }

  const items = list ?? [];
  const totalMinutes = items.reduce((acc, c) => acc + (c.durationAct ?? 0), 0);

  return (
    <div>
      {head}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>
          共 <span style={{ color: 'var(--text)', fontWeight: 500 }}>{items.length}</span> 次 · 累计{' '}
          <span style={{ color: 'var(--text)', fontWeight: 500 }}>{fmtMins(totalMinutes)}</span>
        </div>
        <button type="button" className="qa primary" onClick={() => setCreateOpen(true)}>
          <TIcon.plus /> 新建预约
        </button>
      </div>

      {items.length === 0 ? (
        <WnEmpty icon="reflect" title="暂无沟通记录" sub="新建预约后, 面谈 / 电话记录会在这里" />
      ) : (
        <div className="tbl">
          <div className="tbl-head">
            <span>时间</span>
            <span>方式</span>
            <span>主题</span>
            <span>状态</span>
            <span>时长</span>
            <span></span>
          </div>
          {items.map((c) => (
            <ConsultationRow
              key={c.id}
              consultation={c}
              onStart={() => startMutation.mutate(c.id)}
              onEnd={(notes) => endMutation.mutate({ id: c.id, notes })}
              onEdit={() => setEditTarget(c)}
              onCancelAppt={() => cancelMutation.mutate(c.id)}
            />
          ))}
        </div>
      )}

      <CreateConsultationModal
        open={createOpen || editTarget !== null}
        studentId={Number(studentId)}
        editing={editTarget}
        onCancel={() => { setCreateOpen(false); setEditTarget(null); }}
        onSuccess={() => {
          const wasEdit = editTarget !== null;
          setCreateOpen(false);
          setEditTarget(null);
          qc.invalidateQueries({ queryKey: ['consultations', studentId] });
          message.success(wasEdit ? '预约已更新' : '预约已创建');
        }}
      />
    </div>
  );
}

function ConsultationRow({
  consultation,
  onStart,
  onEnd,
  onEdit,
  onCancelAppt,
}: {
  consultation: Consultation;
  onStart: () => void;
  onEnd: (notes?: string) => void;
  onEdit: () => void;
  onCancelAppt: () => void;
}) {
  const c = consultation;
  const when = new Date(c.scheduledAt).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const channelLabel = CHANNEL_LABEL[c.channel] ?? c.channel;
  const channelKind = (c.channel === 'in_person' ? 'inperson' : c.channel) as keyof typeof TIcon;
  const dur =
    c.durationAct != null ? `${c.durationAct} 分` : c.durationEst != null ? `预 ${c.durationEst} 分` : '—';

  return (
    <div className="tbl-row">
      <span className="when">{when}</span>
      <span className="ch">
        <ChannelIcon kind={channelKind} />
        {channelLabel}
      </span>
      <span className="topic">
        {c.purpose || '—'}
        {c.notes ? <div className="note">{c.notes}</div> : null}
      </span>
      <span>
        <StatusChip status={c.status} dict={STATUS_LABEL} />
      </span>
      <span className="dur">{dur}</span>
      <span className="act">
        {c.status === 'scheduled' ? (
          <>
            <button type="button" className="go" onClick={onStart}>开始</button>
            <button type="button" onClick={onEdit}>改期</button>
            <Popconfirm title="确定取消这条预约?" okText="取消预约" cancelText="再想想" onConfirm={onCancelAppt}>
              <button type="button" className="end">取消</button>
            </Popconfirm>
          </>
        ) : null}
        {c.status === 'in_progress' ? (
          <button type="button" className="end" onClick={() => onEnd()}>结束</button>
        ) : null}
      </span>
    </div>
  );
}

// 7:00 前 / 22:00 后联系家长属非常规时段, 多半是 DatePicker 误操作(实测约成过 00:00), 二次确认兜底
function confirmOffHours(scheduled: dayjs.Dayjs): Promise<boolean> {
  const h = scheduled.hour();
  if (h >= 7 && h < 22) return Promise.resolve(true);
  return new Promise((resolve) => {
    Modal.confirm({
      title: '非常规时段提醒',
      content: `预约时间为 ${scheduled.format('MM/DD HH:mm')},属于${h < 7 ? '凌晨/清晨' : '深夜'}时段,确定要在这个时间联系家长吗?`,
      okText: '确认这个时间',
      cancelText: '回去改时间',
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    });
  });
}

function CreateConsultationModal({
  open,
  studentId,
  editing,
  onCancel,
  onSuccess,
}: {
  open: boolean;
  studentId: number;
  editing?: Consultation | null;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [form] = Form.useForm();
  // 改期模式: 弹窗打开时回填当前预约
  useEffect(() => {
    if (!open) return;
    if (editing) {
      form.setFieldsValue({
        scheduledAt: dayjs(editing.scheduledAt),
        channel: editing.channel,
        durationEst: editing.durationEst ?? 30,
        purpose: editing.purpose,
        notes: editing.notes,
      });
    } else {
      form.resetFields();
    }
  }, [open, editing, form]);

  const createMutation = useMutation({
    mutationFn: (payload: any) => (editing
      ? consultationApi.update(editing.id, payload)
      : consultationApi.create({ studentId, ...payload })),
    onSuccess: () => {
      form.resetFields();
      onSuccess();
    },
    onError: (e: any) => message.error(e?.response?.data?.message ?? (editing ? '更新失败' : '创建失败')),
  });

  return (
    <Modal
      title={editing ? '修改预约' : '新建沟通预约'}
      open={open}
      onCancel={onCancel}
      onOk={() =>
        form.validateFields().then(async (values) => {
          if (!(await confirmOffHours(values.scheduledAt))) return;
          createMutation.mutate({
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
