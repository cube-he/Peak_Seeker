'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useParams, usePathname, useRouter } from 'next/navigation';
import {
  Form,
  Input,
  InputNumber,
  Select,
  Radio,
  Checkbox,
  Button,
  Spin,
  Alert,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { studentApi, type UpdateStudentDto } from '@/services/student-api';
import {
  STAGE_1_REQUIRED,
  STAGE_2_FIELDS,
  STAGE_3_FIELDS,
  STAGE_LABELS,
} from '@/components/student/stage-fields';
import HealthCheckboxGroup from '@/components/student/HealthCheckboxGroup';
import {
  type Subject9Form,
  sum9Subjects,
  to9Subjects,
  from9Subjects,
  validate6Subjects,
} from '@/components/student/stage1-score-mapping';
import {
  ETHNICITY_OPTIONS,
  POLITICAL_STATUS_OPTIONS,
  getRegionCascaderOptions,
} from '@/data/student-options';
import StudentSummaryRail from '@/components/student/workspace/StudentSummaryRail';
import {
  StudentWorkspace,
  StudentWorkspacePanel,
} from '@/components/student/workspace/StudentWorkspace';
import { useUniversityOptions } from '@/components/student/picker/options/useUniversityOptions';
import { useMajorOptions } from '@/components/student/picker/options/useMajorOptions';

type StageKey = '1' | '2' | '3';

interface StageProgress {
  filled?: number;
  total?: number;
  completed?: boolean;
}

interface ProfileProgress {
  overallCompleteness?: number;
  isRecommendable?: boolean;
  stageProgress?: Record<string, StageProgress>;
}

const STAGE_KEYS: StageKey[] = ['1', '2', '3'];

const STAGE_SUMMARIES: Record<StageKey, string> = {
  '1': '身份、电话、成绩与选科',
  '2': '身体条件、地域偏好与专业方向',
  '3': '排除项、经济条件、兴趣性格',
};

const STAGE_FIELD_MAP: Record<string, readonly string[]> = {
  '1': STAGE_1_REQUIRED,
  '2': STAGE_2_FIELDS,
  '3': STAGE_3_FIELDS,
};

const REGION_OPTIONS = getRegionCascaderOptions();
const PROVINCE_OPTIONS = REGION_OPTIONS.map(({ value, label }) => ({
  value,
  label,
}));
const CITY_OPTIONS = Array.from(
  new Map(
    REGION_OPTIONS.flatMap((province) => province.children ?? []).map((city) => [
      city.value,
      { value: city.value, label: city.label },
    ]),
  ).values(),
);
const PERSONALITY_TYPE_OPTIONS = [
  'ISTJ',
  'ISFJ',
  'INFJ',
  'INTJ',
  'ISTP',
  'ISFP',
  'INFP',
  'INTP',
  'ESTP',
  'ESFP',
  'ENFP',
  'ENTP',
  'ESTJ',
  'ESFJ',
  'ENFJ',
  'ENTJ',
  '内向',
  '外向',
  '偏研究型',
  '偏实践型',
].map((value) => ({ value, label: value }));

/**
 * 阶段表单页 (W3) - 学生填某一阶段的字段。
 * 路由：/student/profile/stage/[1|2|3]
 *
 * 表单字段限定在该阶段对应的字段集（STAGE_N_FIELDS），保存时
 * 仅提交该子集 + dataVersion（乐观锁），后端会拒绝任何 ① 字段。
 */
export default function StudentStageFormPage() {
  const params = useParams<{ stage: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const stage = String(params.stage);
  const fields = STAGE_FIELD_MAP[stage];
  const labels = STAGE_LABELS[stage as '1' | '2' | '3'];

  const [form] = Form.useForm();
  const queryClient = useQueryClient();

  const { data: profileData, isLoading } = useQuery({
    queryKey: ['student-my-profile'],
    queryFn: () => studentApi.getMyProfile(),
  });
  const profile: Record<string, any> | undefined =
    (profileData as any)?.data ?? profileData;

  // 把 profile 中本阶段相关字段写到 form
  useEffect(() => {
    if (!profile || !fields) return;
    const initial: Record<string, any> = {};
    if (stage === '1') {
      // stage 1 走 9 科语义层：先回填非分数字段，再用 to9Subjects 解构槽位为具体科目
      // nonScoreFields 是 STAGE_1_REQUIRED 中非分数字段的子集；dataVersion 在下方单独设置；
      // 分数字段由 to9Subjects 从槽位字段解码生成，所以不在这里手动复制
      const nonScoreFields = [
        'realName',
        'phone',
        'parentPhone',
        'gender',
        'ethnicity',
        'politicalStatus',
        'formFiller',
      ];
      for (const f of nonScoreFields) initial[f] = profile[f];
      Object.assign(initial, to9Subjects(profile));
    } else {
      for (const f of fields) initial[f] = profile[f];
    }
    initial.dataVersion = profile.dataVersion ?? 0;
    form.setFieldsValue(initial);
  }, [profile, fields, form, stage]);

  const saveMutation = useMutation({
    mutationFn: (values: UpdateStudentDto) => studentApi.updateMyProfile(values),
    onSuccess: () => {
      void message.success('保存成功');
      queryClient.invalidateQueries({ queryKey: ['student-my-profile'] });
    },
    onError: (e: any) => {
      const msg =
        e?.response?.data?.message ?? e?.message ?? '保存失败，请稍后重试';
      void message.error(typeof msg === 'string' ? msg : '保存失败');
    },
  });

  if (!fields || !labels) {
    return (
      <div className="space-y-3">
        <Alert
          type="warning"
          message={`未知阶段：${stage}`}
          description="路径必须是 /student/profile/stage/1|2|3"
        />
        <Button onClick={() => router.push('/student/profile')}>
          返回档案首页
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spin size="large" />
      </div>
    );
  }

  const onSave = () => {
    form.validateFields().then((values) => {
      if (stage === '1') {
        // stage 1: 9 科 → 6 门齐全校验 → 翻译为后端槽位字段
        const subj9 = {
          scoreChinese: values.scoreChinese,
          scoreMath: values.scoreMath,
          scoreEnglish: values.scoreEnglish,
          scorePhysics: values.scorePhysics,
          scoreHistory: values.scoreHistory,
          scoreChemistry: values.scoreChemistry,
          scoreBiology: values.scoreBiology,
          scorePolitics: values.scorePolitics,
          scoreGeography: values.scoreGeography,
        } as Subject9Form;
        const err = validate6Subjects(subj9);
        if (err) {
          void message.error(err);
          return;
        }
        const translated = from9Subjects(subj9);
        const payload: UpdateStudentDto = {
          dataVersion: values.dataVersion,
          realName: values.realName,
          phone: values.phone,
          parentPhone: values.parentPhone,
          gender: values.gender,
          ethnicity: values.ethnicity,
          politicalStatus: values.politicalStatus,
          formFiller: values.formFiller,
          ...translated,
        };
        saveMutation.mutate(payload);
        return;
      }
      saveMutation.mutate(values as UpdateStudentDto);
    });
  };

  const activeStage = stage as StageKey;
  const progress = profile?.progress as ProfileProgress | undefined;
  const currentProgress = getStageProgress(progress, activeStage);
  const currentPercent = stagePercent(currentProgress);
  const rail = (
    <StudentSummaryRail
      activePathname={pathname}
      profile={profile}
      progress={progress}
    />
  );
  const aside = (
    <>
      <StudentWorkspacePanel title="当前阶段">
        <div className="flex items-end gap-2">
          <span className="font-serif text-4xl font-semibold tabular-nums text-accent">
            {currentPercent}
          </span>
          <span className="pb-1 text-sm text-text-muted">%</span>
        </div>
        <p className="m-0 mt-2 text-xs leading-5 text-text-muted">
          已填写 {currentProgress?.filled ?? 0}/{currentProgress?.total ?? 0} 项。
          {currentProgress?.completed ? ' 当前阶段已完成。' : ' 保存后完整度会同步刷新。'}
        </p>
      </StudentWorkspacePanel>

      <StudentWorkspacePanel title="三阶段进度">
        <StageProgressList activeStage={activeStage} progress={progress} />
      </StudentWorkspacePanel>
    </>
  );

  return (
    <StudentWorkspace rail={rail} aside={aside}>
      <div className="space-y-5 pb-20 lg:pb-0">
        <Button
          type="link"
          icon={<ArrowLeftOutlined />}
          onClick={() => router.push('/student/profile')}
          className="h-auto px-0 text-text-muted"
        >
          返回档案首页
        </Button>

        <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-[#15212e] px-5 py-5 text-white shadow-glow-primary sm:px-6">
          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
              <p className="m-0 text-[11px] font-medium uppercase tracking-[1.8px] text-white/50">
                Student Profile
              </p>
              <h1 className="m-0 mt-2 font-serif text-2xl font-semibold leading-tight">
                档案编辑工作台
              </h1>
              <p className="m-0 mt-2 max-w-2xl text-sm leading-6 text-white/70">
                三个阶段放在同一套编辑流程里查看和切换；当前页面只保存阶段 {stage} 的字段，避免误改其他阶段。
              </p>
            </div>
            <div className="rounded-xl bg-white/[0.08] px-4 py-3">
              <p className="m-0 text-[11px] text-white/50">当前阶段</p>
              <p className="m-0 mt-1 font-serif text-lg font-semibold">
                阶段 {stage}：{labels.title}
              </p>
            </div>
          </div>
        </section>

        <StageSwitcher activeStage={activeStage} progress={progress} />

        <StudentWorkspacePanel
          title={`阶段 ${stage}：${labels.title}`}
          action={
            <span className="rounded-md bg-accent-fixed px-2 py-1 text-[11px] font-medium text-accent">
              {labels.badge}
            </span>
          }
        >
          <p className="m-0 mb-5 text-xs leading-5 text-text-secondary">
            {labels.subtitle}
          </p>

          <Form form={form} layout="vertical" requiredMark={false}>
            <Form.Item name="dataVersion" hidden>
              <Input />
            </Form.Item>

            {stage === '1' && <Stage1Fields />}
            {stage === '2' && <Stage2Fields />}
            {stage === '3' && <Stage3Fields />}

            <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border-subtle pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="m-0 text-xs leading-5 text-text-faint">
                保存只会提交当前阶段字段，其他阶段内容保持不变。
              </p>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={onSave}
                loading={saveMutation.isPending}
                size="large"
              >
                保存当前阶段
              </Button>
            </div>
          </Form>
        </StudentWorkspacePanel>
      </div>
    </StudentWorkspace>
  );
}

function stageHref(stage: StageKey) {
  return `/student/profile/stage/${stage}`;
}

function getStageProgress(progress: ProfileProgress | undefined, stage: StageKey) {
  return progress?.stageProgress?.[`stage${stage}`];
}

function stagePercent(stage?: StageProgress) {
  if (!stage?.total) return 0;
  return Math.round(((stage.filled ?? 0) / stage.total) * 100);
}

function StageSwitcher({
  activeStage,
  progress,
}: {
  activeStage: StageKey;
  progress?: ProfileProgress;
}) {
  return (
    <nav
      aria-label="档案填写阶段"
      className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-1 2xl:grid-cols-3"
    >
      {STAGE_KEYS.map((stage) => {
        const labels = STAGE_LABELS[stage];
        const stageProgress = getStageProgress(progress, stage);
        const percent = stagePercent(stageProgress);
        const active = stage === activeStage;
        return (
          <Link
            key={stage}
            href={stageHref(stage)}
            aria-current={active ? 'page' : undefined}
            className={`group rounded-xl border px-4 py-3 text-text no-underline transition-colors ${
              active
                ? 'border-primary/30 bg-primary-fixed shadow-card'
                : 'border-border-subtle bg-surface hover:border-primary/20 hover:bg-surface-dim'
            }`}
          >
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-3">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] font-serif text-base font-semibold ${
                    stageProgress?.completed
                      ? 'bg-primary text-white'
                      : active
                        ? 'bg-primary text-white'
                        : 'bg-accent-fixed text-accent'
                  }`}
                >
                  {stageProgress?.completed ? (
                    <CheckCircleOutlined className="text-sm" />
                  ) : (
                    stage
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block font-serif text-[15px] font-semibold">
                    {labels.title}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-text-muted">
                    {STAGE_SUMMARIES[stage]}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-serif text-base font-semibold tabular-nums text-accent">
                  {percent}%
                </span>
                <span className="text-[10px] text-text-faint">{labels.badge}</span>
              </span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function StageProgressList({
  activeStage,
  progress,
}: {
  activeStage: StageKey;
  progress?: ProfileProgress;
}) {
  return (
    <div className="space-y-3">
      {STAGE_KEYS.map((stage) => {
        const labels = STAGE_LABELS[stage];
        const stageProgress = getStageProgress(progress, stage);
        const percent = stagePercent(stageProgress);
        return (
          <div key={stage}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span
                className={`font-medium ${
                  stage === activeStage ? 'text-primary' : 'text-text'
                }`}
              >
                阶段 {stage} · {labels.title}
              </span>
              <span className="tabular-nums text-text-muted">{percent}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-dim">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border-subtle pt-5 first:border-t-0 first:pt-0">
      <div className="mb-4">
        <h3 className="m-0 font-serif text-base font-semibold text-text">
          {title}
        </h3>
        {description ? (
          <p className="m-0 mt-1 text-xs leading-5 text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function FieldGrid({
  children,
  columns = 'md:grid-cols-2',
}: {
  children: React.ReactNode;
  columns?: string;
}) {
  return <div className={`grid grid-cols-1 gap-x-4 ${columns}`}>{children}</div>;
}

function ScoreInput({
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
    <div
      className={`rounded-xl border px-3 py-3 transition-colors ${
        disabled
          ? 'border-border-subtle bg-surface-dim/60 opacity-70'
          : 'border-border-subtle bg-surface hover:border-primary/25'
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-medium text-text">{label}</span>
        <span className="text-[11px] text-text-muted">满分 {max}</span>
      </div>
      <Form.Item
        name={name}
        rules={required ? [{ required: true, message: '必填' }] : undefined}
        className="mb-0"
      >
        <InputNumber
          min={0}
          max={max}
          className="w-full"
          disabled={disabled}
          placeholder={placeholder}
          onChange={onChange}
        />
      </Form.Item>
    </div>
  );
}

function Stage1Fields() {
  const form = Form.useFormInstance();
  return (
    <div className="space-y-6">
      <FormSection
        title="联系信息"
        description="用于老师与你和家长确认资料，建议填写常用联系方式。"
      >
        <FieldGrid columns="md:grid-cols-2">
          <Form.Item name="realName" label="姓名" rules={[{ required: true }]}>
            <Input placeholder="你的真实姓名" />
          </Form.Item>
          <Form.Item name="phone" label="手机号" rules={[{ required: true }]}>
            <Input placeholder="11 位手机号" />
          </Form.Item>
          <Form.Item
            name="parentPhone"
            label="家长手机号"
            rules={[{ required: true }]}
          >
            <Input placeholder="家长联系电话" />
          </Form.Item>
          <Form.Item name="gender" label="性别" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              className="w-full"
              options={[
                { value: 'MALE', label: '男' },
                { value: 'FEMALE', label: '女' },
              ]}
            />
          </Form.Item>
          <Form.Item name="ethnicity" label="民族" rules={[{ required: true }]}>
            <Select
              showSearch
              allowClear
              placeholder="选择民族"
              optionFilterProp="label"
              options={ETHNICITY_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="politicalStatus" label="政治面貌" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              className="w-full"
              options={POLITICAL_STATUS_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="formFiller" label="填表人" rules={[{ required: true }]}>
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              className="w-full"
              options={[
                { value: 'STUDENT', label: '学生本人' },
                { value: 'PARENT', label: '家长' },
                { value: 'TOGETHER', label: '共同填写' },
              ]}
            />
          </Form.Item>
        </FieldGrid>
      </FormSection>

      <FormSection
        title="高考成绩"
        description="填语数外 + 物理或历史 + 任选 2 门。系统会自动识别科类和选考组合。"
      >
        <div className="space-y-4">
          <section className="rounded-2xl bg-surface-dim px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="m-0 text-sm font-semibold text-text">必填三科</h4>
              <span className="text-[11px] text-text-muted">语文 / 数学 / 英语</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <ScoreInput name="scoreChinese" label="语文" max={150} required />
              <ScoreInput name="scoreMath" label="数学" max={150} required />
              <ScoreInput name="scoreEnglish" label="英语" max={150} required />
            </div>
          </section>

          <section className="rounded-2xl bg-surface-dim px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="m-0 text-sm font-semibold text-text">首选科目</h4>
              <span className="rounded-full bg-accent-fixed px-2 py-0.5 text-[11px] font-medium text-accent">
                物理 / 历史二选一
              </span>
            </div>
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <ScoreInput
                      name="scorePhysics"
                      label="物理"
                      max={100}
                      disabled={hasHistory}
                      placeholder={hasHistory ? '已选历史' : undefined}
                      onChange={(v) => {
                        if (v != null) form.setFieldValue('scoreHistory', undefined);
                      }}
                    />
                    <ScoreInput
                      name="scoreHistory"
                      label="历史"
                      max={100}
                      disabled={hasPhysics}
                      placeholder={hasPhysics ? '已选物理' : undefined}
                      onChange={(v) => {
                        if (v != null) form.setFieldValue('scorePhysics', undefined);
                      }}
                    />
                  </div>
                );
              }}
            </Form.Item>
          </section>

          <section className="rounded-2xl bg-surface-dim px-4 py-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h4 className="m-0 text-sm font-semibold text-text">再选科目</h4>
              <span className="rounded-full bg-accent-fixed px-2 py-0.5 text-[11px] font-medium text-accent">
                化 / 生 / 政 / 地选四选二
              </span>
            </div>
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
                const reKeys = ['scoreChemistry', 'scoreBiology', 'scorePolitics', 'scoreGeography'] as const;
                const filledCount = reKeys.filter((k) => getFieldValue(k) != null).length;
                const lockOthers = filledCount >= 2;
                const isFilled = (k: string) => getFieldValue(k) != null;
                return (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <ScoreInput
                      name="scoreChemistry"
                      label="化学"
                      max={100}
                      disabled={lockOthers && !isFilled('scoreChemistry')}
                    />
                    <ScoreInput
                      name="scoreBiology"
                      label="生物"
                      max={100}
                      disabled={lockOthers && !isFilled('scoreBiology')}
                    />
                    <ScoreInput
                      name="scorePolitics"
                      label="政治"
                      max={100}
                      disabled={lockOthers && !isFilled('scorePolitics')}
                    />
                    <ScoreInput
                      name="scoreGeography"
                      label="地理"
                      max={100}
                      disabled={lockOthers && !isFilled('scoreGeography')}
                    />
                  </div>
                );
              }}
            </Form.Item>
          </section>
        </div>

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
              <div className="mt-4 flex items-center justify-between rounded-2xl bg-primary-fixed px-4 py-4 text-sm text-text">
                <span className="font-medium">总分自动累加</span>
                <span className="font-serif text-2xl font-semibold tabular-nums text-accent">
                  {total} 分
                </span>
              </div>
            );
          }}
        </Form.Item>

        <p className="m-0 mt-3 text-xs leading-5 text-text-faint">
          提示：填好成绩后，系统会自动用一分一段表算出全省位次（位次仅老师可看；如有政策加分，老师录入后参与位次计算）。
        </p>
      </FormSection>
    </div>
  );
}

function Stage2Fields() {
  const { data: universityOptions, isLoading: isLoadingUniversities } =
    useUniversityOptions();
  const { data: majorOptions, isLoading: isLoadingMajors } = useMajorOptions();

  return (
    <div className="space-y-6">
      <FormSection
        title="身体条件"
        description="部分院校和专业会参考体检限制，尽量按体检表填写。"
      >
        <FieldGrid columns="sm:grid-cols-2 xl:grid-cols-4">
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
        </FieldGrid>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item name="colorBlind" valuePropName="checked">
            <Checkbox>色盲</Checkbox>
          </Form.Item>
          <Form.Item name="colorWeak" valuePropName="checked">
            <Checkbox>色弱</Checkbox>
          </Form.Item>
        </div>
      </FormSection>

      <FormSection
        title="地域与院校偏好"
        description="把最确定的方向写在前面，老师生成方案时会优先参考。"
      >
        <FieldGrid columns="lg:grid-cols-2">
          <Form.Item name="preferredProvinces" label="意向省份">
            <Select
              mode="multiple"
              placeholder="选择意向省份"
              allowClear
              showSearch
              optionFilterProp="label"
              options={PROVINCE_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="preferredCities" label="意向城市">
            <Select
              mode="multiple"
              placeholder="选择意向城市"
              allowClear
              showSearch
              optionFilterProp="label"
              options={CITY_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="preferredUniversities" label="意向院校">
            <Select
              mode="multiple"
              placeholder="选择意向院校"
              allowClear
              showSearch
              optionFilterProp="label"
              options={universityOptions}
              loading={isLoadingUniversities}
              notFoundContent={isLoadingUniversities ? '加载中...' : '暂无匹配院校'}
            />
          </Form.Item>
          <Form.Item name="preferredBatches" label="意向批次">
            <Select
              mode="multiple"
              placeholder="选择意向批次"
              allowClear
              options={[
                { value: 'EARLY_BATCH', label: '提前批' },
                { value: 'FIRST_BATCH', label: '本科批' },
                { value: 'SECOND_BATCH', label: '专科批' },
                { value: 'SPECIAL_BATCH', label: '专项计划' },
              ]}
            />
          </Form.Item>
        </FieldGrid>
      </FormSection>

      <FormSection
        title="专业与升学规划"
        description="专业方向、升学路径和优先级会影响冲稳保排序。"
      >
        <FieldGrid columns="lg:grid-cols-2">
          <Form.Item name="preferredMajors" label="意向专业">
            <Select
              mode="multiple"
              placeholder="选择意向专业"
              allowClear
              showSearch
              optionFilterProp="label"
              options={majorOptions}
              loading={isLoadingMajors}
              notFoundContent={isLoadingMajors ? '加载中...' : '暂无匹配专业'}
            />
          </Form.Item>
          <Form.Item name="preferredMajorCategories" label="意向专业大类">
            <Select
              mode="multiple"
              placeholder="选择"
              allowClear
              options={[
                { value: '工学', label: '工学' },
                { value: '理学', label: '理学' },
                { value: '医学', label: '医学' },
                { value: '经济学', label: '经济学' },
                { value: '管理学', label: '管理学' },
                { value: '法学', label: '法学' },
                { value: '文学', label: '文学' },
                { value: '教育学', label: '教育学' },
              ]}
            />
          </Form.Item>
          <Form.Item name="careerPlan" label="升学规划">
            <Select
              placeholder="选择"
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
          <Form.Item name="priorityMode" label="院校 / 专业优先">
            <Radio.Group className="flex flex-wrap gap-x-4 gap-y-2">
              <Radio value="UNIVERSITY_FIRST">院校优先</Radio>
              <Radio value="MAJOR_FIRST">专业优先</Radio>
              <Radio value="BALANCED">兼顾</Radio>
            </Radio.Group>
          </Form.Item>
        </FieldGrid>
        <Form.Item name="careerDirection" label="职业方向">
          <Input.TextArea rows={2} placeholder="未来想从事什么方向的工作？" />
        </Form.Item>
      </FormSection>
    </div>
  );
}

function Stage3Fields() {
  const { data: universityOptions, isLoading: isLoadingUniversities } =
    useUniversityOptions();
  const { data: majorOptions, isLoading: isLoadingMajors } = useMajorOptions();

  return (
    <div className="space-y-6">
      <FormSection
        title="录取边界"
        description="把不能接受的地区、院校和专业提前写清楚，减少后续反复沟通。"
      >
        <Form.Item name="remoteAreaAcceptance" label="是否接受偏远地区">
          <Radio.Group className="flex flex-wrap gap-x-4 gap-y-2">
            <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
            <Radio value="BACKUP_ONLY">仅保底院校可接受</Radio>
            <Radio value="FAMOUS_OK">名校可接受</Radio>
            <Radio value="GOOD_MAJOR_OK">好专业可接受</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="coldMajorAcceptance" label="是否接受冷门专业">
          <Radio.Group className="flex flex-wrap gap-x-4 gap-y-2">
            <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
            <Radio value="FAMOUS_OK">名校可接受</Radio>
            <Radio value="DEVELOPED_AREA_OK">发达地区可接受</Radio>
            <Radio value="GOOD_PROSPECT_OK">前景好可接受</Radio>
          </Radio.Group>
        </Form.Item>
        <Form.Item name="stayPreference" label="在省内/外读书偏好">
          <Radio.Group className="flex flex-wrap gap-x-4 gap-y-2">
            <Radio value="LOCAL_ONLY">仅省内</Radio>
            <Radio value="PREFER_LOCAL">偏好省内</Radio>
            <Radio value="NO_PREFERENCE">无所谓</Radio>
            <Radio value="PREFER_OUTSIDE">偏好省外</Radio>
          </Radio.Group>
        </Form.Item>
        <FieldGrid columns="lg:grid-cols-2">
          <Form.Item name="excludedProvinces" label="不接受的省份">
            <Select
              mode="multiple"
              placeholder="选择不接受的省份"
              allowClear
              showSearch
              optionFilterProp="label"
              options={PROVINCE_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="excludedCities" label="不接受的城市">
            <Select
              mode="multiple"
              placeholder="选择不接受的城市"
              allowClear
              showSearch
              optionFilterProp="label"
              options={CITY_OPTIONS}
            />
          </Form.Item>
          <Form.Item name="excludedUniversities" label="不接受的院校">
            <Select
              mode="multiple"
              placeholder="选择不接受的院校"
              allowClear
              showSearch
              optionFilterProp="label"
              options={universityOptions}
              loading={isLoadingUniversities}
              notFoundContent={isLoadingUniversities ? '加载中...' : '暂无匹配院校'}
            />
          </Form.Item>
          <Form.Item name="excludedMajors" label="不接受的专业">
            <Select
              mode="multiple"
              placeholder="选择不接受的专业"
              allowClear
              showSearch
              optionFilterProp="label"
              options={majorOptions}
              loading={isLoadingMajors}
              notFoundContent={isLoadingMajors ? '加载中...' : '暂无匹配专业'}
            />
          </Form.Item>
        </FieldGrid>
      </FormSection>

      <FormSection
        title="兴趣性格与方向"
        description="这些信息会帮助老师解释推荐逻辑，也能用于专业筛选。"
      >
        <FieldGrid columns="lg:grid-cols-2">
          <Form.Item name="preferredTags" label="偏好标签">
            <Select mode="tags" placeholder="如「就业好」「学风好」" allowClear />
          </Form.Item>
          <Form.Item name="interests" label="兴趣爱好">
            <Select mode="tags" placeholder="输入" allowClear />
          </Form.Item>
          <Form.Item name="personalityType" label="性格类型">
            <Select
              showSearch
              allowClear
              placeholder="选择性格类型"
              optionFilterProp="label"
              options={PERSONALITY_TYPE_OPTIONS}
            />
          </Form.Item>
        </FieldGrid>
        <Form.Item name="selfDescription" label="自我描述">
          <Input.TextArea rows={3} placeholder="任何想让老师知道的信息" />
        </Form.Item>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item name="militaryInterest" valuePropName="checked">
            <Checkbox>对军校/军事专业感兴趣</Checkbox>
          </Form.Item>
          <Form.Item name="teacherInterest" valuePropName="checked">
            <Checkbox>对师范专业感兴趣</Checkbox>
          </Form.Item>
        </div>
      </FormSection>

      <FormSection
        title="经济条件与办学类型"
        description="提前明确预算边界，方案会更贴近家庭实际选择。"
      >
        <Form.Item name="tuitionBudget" label="学费预算">
          <Radio.Group className="flex flex-wrap gap-x-4 gap-y-2">
            <Radio value="LOW">经济敏感（≤6000/年）</Radio>
            <Radio value="MEDIUM">适中（6000-15000/年）</Radio>
            <Radio value="HIGH">不限（含中外合作）</Radio>
            <Radio value="UNLIMITED">无上限</Radio>
          </Radio.Group>
        </Form.Item>
        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <Form.Item name="acceptSinoForeign" valuePropName="checked">
            <Checkbox>接受中外合作办学</Checkbox>
          </Form.Item>
        </div>
        <FieldGrid columns="lg:grid-cols-2">
          <Form.Item name="acceptPrivate" label="是否接受民办">
            <Radio.Group className="flex flex-wrap gap-x-4 gap-y-2">
              <Radio value="STRICT">不接受</Radio>
              <Radio value="MODERATE">部分接受</Radio>
              <Radio value="RELAXED">接受</Radio>
              <Radio value="UNDECIDED">未定</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item name="acceptCooperation" label="是否接受合作办学">
            <Radio.Group className="flex flex-wrap gap-x-4 gap-y-2">
              <Radio value="STRICT">不接受</Radio>
              <Radio value="MODERATE">部分接受</Radio>
              <Radio value="RELAXED">接受</Radio>
              <Radio value="UNDECIDED">未定</Radio>
            </Radio.Group>
          </Form.Item>
        </FieldGrid>
        <Form.Item name="otherRequirements" label="其他要求">
          <Input.TextArea rows={2} placeholder="任何其他特殊要求" />
        </Form.Item>
      </FormSection>

      <FormSection
        title="体检与身份补充"
        description="这些字段主要用于特殊专业限制和政策审核。"
      >
        <FieldGrid columns="sm:grid-cols-2">
          <Form.Item name="visionLeftCorrected" label="左眼矫正视力">
            <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
          </Form.Item>
          <Form.Item name="visionRightCorrected" label="右眼矫正视力">
            <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
          </Form.Item>
        </FieldGrid>
        <Form.Item name="physicalLimits" label="体检受限项">
          <HealthCheckboxGroup />
        </Form.Item>
        <Form.Item name="medicalHistory" label="既往病史 / 特殊情况">
          <Input.TextArea
            rows={2}
            placeholder="如有需注明的既往病史，请填写"
          />
        </Form.Item>
      </FormSection>
    </div>
  );
}
