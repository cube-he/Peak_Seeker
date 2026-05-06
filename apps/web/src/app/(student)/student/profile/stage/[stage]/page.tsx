'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Card,
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
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
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
} from '@/components/student/stage1-score-mapping';

const STAGE_FIELD_MAP: Record<string, readonly string[]> = {
  '1': STAGE_1_REQUIRED,
  '2': STAGE_2_FIELDS,
  '3': STAGE_3_FIELDS,
};

/**
 * 阶段表单页 (W3) - 学生填某一阶段的字段。
 * 路由：/student/profile/stage/[1|2|3]
 *
 * 表单字段限定在该阶段对应的字段集（STAGE_N_FIELDS），保存时
 * 仅提交该子集 + dataVersion（乐观锁），后端会拒绝任何 ① 字段。
 */
export default function StudentStageFormPage() {
  const params = useParams<{ stage: string }>();
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
      const nonScoreFields = ['realName', 'phone', 'parentPhone', 'gender', 'formFiller'];
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
      saveMutation.mutate(values as UpdateStudentDto);
    });
  };

  return (
    <div className="space-y-4 pb-20">
      <Button
        type="link"
        icon={<ArrowLeftOutlined />}
        onClick={() => router.push('/student/profile')}
        className="px-0"
      >
        返回档案首页
      </Button>

      <Card>
        <h1 className="mb-1 font-serif text-xl font-semibold text-text">
          阶段 {stage}：{labels.title}
        </h1>
        <p className="mb-4 text-xs text-text-secondary">{labels.subtitle}</p>

        <Form form={form} layout="vertical" requiredMark="optional">
          <Form.Item name="dataVersion" hidden>
            <Input />
          </Form.Item>

          {stage === '1' && <Stage1Fields />}
          {stage === '2' && <Stage2Fields />}
          {stage === '3' && <Stage3Fields />}

          <div className="mt-4 flex justify-end border-t border-border-subtle pt-4">
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

function Stage1Fields() {
  const form = Form.useFormInstance();
  return (
    <>
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
        <Radio.Group>
          <Radio value="MALE">男</Radio>
          <Radio value="FEMALE">女</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="formFiller" label="填表人" rules={[{ required: true }]}>
        <Radio.Group>
          <Radio value="STUDENT">学生本人</Radio>
          <Radio value="PARENT">家长</Radio>
          <Radio value="TOGETHER">共同填写</Radio>
        </Radio.Group>
      </Form.Item>

      {/* ─── 高考成绩：9 科分数驱动选科 ─── */}
      <div className="mt-6 mb-2 text-sm font-semibold text-text">高考成绩</div>
      <p className="mb-3 text-xs text-text-secondary">
        填语数外 + 物理或历史 + 任选 2 门（化/生/政/地）。系统会自动识别你的科类和选考组合。
      </p>

      <div className="grid grid-cols-3 gap-4">
        <Form.Item name="scoreChinese" label="语文" rules={[{ required: true, message: '必填' }]}>
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreMath" label="数学" rules={[{ required: true, message: '必填' }]}>
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
        <Form.Item name="scoreEnglish" label="英语" rules={[{ required: true, message: '必填' }]}>
          <InputNumber min={0} max={150} className="w-full" />
        </Form.Item>
      </div>

      {/* 物理/历史 互斥锁死 */}
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
            <div className="grid grid-cols-2 gap-4">
              <Form.Item name="scorePhysics" label="物理">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={hasHistory}
                  placeholder={hasHistory ? '已选历史' : ''}
                  onChange={(v) => {
                    if (v != null) form.setFieldValue('scoreHistory', undefined);
                  }}
                />
              </Form.Item>
              <Form.Item name="scoreHistory" label="历史">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={hasPhysics}
                  placeholder={hasPhysics ? '已选物理' : ''}
                  onChange={(v) => {
                    if (v != null) form.setFieldValue('scorePhysics', undefined);
                  }}
                />
              </Form.Item>
            </div>
          );
        }}
      </Form.Item>

      {/* 化生政地：最多 2 个有值，第 3 个 disabled */}
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
            <div className="grid grid-cols-4 gap-4">
              <Form.Item name="scoreChemistry" label="化学">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scoreChemistry')}
                />
              </Form.Item>
              <Form.Item name="scoreBiology" label="生物">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scoreBiology')}
                />
              </Form.Item>
              <Form.Item name="scorePolitics" label="政治">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scorePolitics')}
                />
              </Form.Item>
              <Form.Item name="scoreGeography" label="地理">
                <InputNumber
                  min={0}
                  max={100}
                  className="w-full"
                  disabled={lockOthers && !isFilled('scoreGeography')}
                />
              </Form.Item>
            </div>
          );
        }}
      </Form.Item>

      {/* 总分自动累加显示 */}
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
            <div className="mt-2 mb-2 rounded-md bg-surface-2 px-4 py-3 text-base">
              总分（自动累加）：<span className="font-semibold">{total}</span> 分
            </div>
          );
        }}
      </Form.Item>

      <p className="text-xs text-text-faint">
        提示：填好成绩后，系统会自动用一分一段表算出全省位次（位次仅老师可看；如有政策加分，老师录入后参与位次计算）。
      </p>
    </>
  );
}

function Stage2Fields() {
  return (
    <>
      <div className="grid grid-cols-2 gap-4">
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
      </div>
      <Form.Item name="colorBlind" valuePropName="checked">
        <Checkbox>色盲</Checkbox>
      </Form.Item>
      <Form.Item name="colorWeak" valuePropName="checked">
        <Checkbox>色弱</Checkbox>
      </Form.Item>
      <Form.Item name="preferredProvinces" label="意向省份">
        <Select
          mode="multiple"
          placeholder="选择意向省份"
          allowClear
          options={[
            { value: '四川', label: '四川' },
            { value: '北京', label: '北京' },
            { value: '上海', label: '上海' },
            { value: '广东', label: '广东' },
            { value: '浙江', label: '浙江' },
            { value: '江苏', label: '江苏' },
            { value: '湖北', label: '湖北' },
            { value: '陕西', label: '陕西' },
          ]}
        />
      </Form.Item>
      <Form.Item name="preferredCities" label="意向城市">
        <Select mode="tags" placeholder="输入意向城市" allowClear />
      </Form.Item>
      <Form.Item name="preferredMajors" label="意向专业">
        <Select mode="tags" placeholder="输入意向专业" allowClear />
      </Form.Item>
      <Form.Item name="preferredUniversities" label="意向院校">
        <Select mode="tags" placeholder="输入意向院校" allowClear />
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
      <Form.Item name="priorityMode" label="院校 / 专业优先">
        <Radio.Group>
          <Radio value="UNIVERSITY_FIRST">院校优先</Radio>
          <Radio value="MAJOR_FIRST">专业优先</Radio>
          <Radio value="BALANCED">兼顾</Radio>
        </Radio.Group>
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
      <Form.Item name="careerDirection" label="职业方向">
        <Input.TextArea rows={2} placeholder="未来想从事什么方向的工作？" />
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
    </>
  );
}

function Stage3Fields() {
  return (
    <>
      <Form.Item name="remoteAreaAcceptance" label="是否接受偏远地区">
        <Radio.Group>
          <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
          <Radio value="BACKUP_ONLY">仅保底院校可接受</Radio>
          <Radio value="FAMOUS_OK">名校可接受</Radio>
          <Radio value="GOOD_MAJOR_OK">好专业可接受</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="coldMajorAcceptance" label="是否接受冷门专业">
        <Radio.Group>
          <Radio value="ABSOLUTELY_NO">绝对不接受</Radio>
          <Radio value="FAMOUS_OK">名校可接受</Radio>
          <Radio value="DEVELOPED_AREA_OK">发达地区可接受</Radio>
          <Radio value="GOOD_PROSPECT_OK">前景好可接受</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="stayPreference" label="在省内/外读书偏好">
        <Radio.Group>
          <Radio value="LOCAL_ONLY">仅省内</Radio>
          <Radio value="PREFER_LOCAL">偏好省内</Radio>
          <Radio value="NO_PREFERENCE">无所谓</Radio>
          <Radio value="PREFER_OUTSIDE">偏好省外</Radio>
        </Radio.Group>
      </Form.Item>
      <Form.Item name="excludedProvinces" label="不接受的省份">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="excludedCities" label="不接受的城市">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="excludedUniversities" label="不接受的院校">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="excludedMajors" label="不接受的专业">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="preferredTags" label="偏好标签">
        <Select mode="tags" placeholder="如「就业好」「学风好」" allowClear />
      </Form.Item>
      <Form.Item name="interests" label="兴趣爱好">
        <Select mode="tags" placeholder="输入" allowClear />
      </Form.Item>
      <Form.Item name="personalityType" label="性格类型">
        <Input placeholder="如 INTJ / 内向 / 善于沟通" />
      </Form.Item>
      <Form.Item name="selfDescription" label="自我描述">
        <Input.TextArea rows={3} placeholder="任何想让老师知道的信息" />
      </Form.Item>
      <Form.Item name="militaryInterest" valuePropName="checked">
        <Checkbox>对军校/军事专业感兴趣</Checkbox>
      </Form.Item>
      <Form.Item name="teacherInterest" valuePropName="checked">
        <Checkbox>对师范专业感兴趣</Checkbox>
      </Form.Item>
      <Form.Item name="tuitionBudget" label="学费预算">
        <Radio.Group>
          <Radio value="LOW">经济敏感（≤6000/年）</Radio>
          <Radio value="MEDIUM">适中（6000-15000/年）</Radio>
          <Radio value="HIGH">不限（含中外合作）</Radio>
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
        <Input.TextArea rows={2} placeholder="任何其他特殊要求" />
      </Form.Item>
      <div className="grid grid-cols-2 gap-4">
        <Form.Item name="visionLeftCorrected" label="左眼矫正视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
        <Form.Item name="visionRightCorrected" label="右眼矫正视力">
          <InputNumber min={1} max={5.3} step={0.1} className="w-full" />
        </Form.Item>
      </div>
      <Form.Item name="physicalLimits" label="体检受限项">
        <HealthCheckboxGroup />
      </Form.Item>
      <Form.Item name="medicalHistory" label="既往病史 / 特殊情况">
        <Input.TextArea
          rows={2}
          placeholder="如有需注明的既往病史，请填写"
        />
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
    </>
  );
}
