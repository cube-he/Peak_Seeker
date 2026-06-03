'use client';

import { Col, Form, Row } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import { ETHNICITY_OPTIONS, POLITICAL_STATUS_OPTIONS } from '@/data/student-options';

interface Props {
  profile: Record<string, any>;
}

const GENDER = [
  { label: '男', value: 'MALE' },
  { label: '女', value: 'FEMALE' },
];

const EXAM_TYPE = [
  { label: '物理类', value: 'PHYSICS' },
  { label: '历史类', value: 'HISTORY' },
  // 文科综合 / 理科综合 是 2024 前旧高考方案; 四川 2025+ 新高考
  // 只有 物理类 / 历史类, 此处不再让用户选.
];

const FORM_FILLER = [
  { label: '本人', value: 'STUDENT' },
  { label: '家长', value: 'PARENT' },
  { label: '共同', value: 'TOGETHER' },
];

export default function BasicInfoSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="姓名">
            <AutoSaveField fieldKey="realName" defaultValue={profile.realName ?? ''} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="手机">
            <AutoSaveField fieldKey="phone" defaultValue={profile.phone ?? ''} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="家长手机">
            <AutoSaveField fieldKey="parentPhone" defaultValue={profile.parentPhone ?? ''} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="性别">
            <AutoSaveRadio fieldKey="gender" options={GENDER} defaultValue={profile.gender ?? null} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="科类">
            <AutoSaveRadio fieldKey="examType" options={EXAM_TYPE} defaultValue={profile.examType ?? null} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="填表人">
            <AutoSaveRadio fieldKey="formFiller" options={FORM_FILLER} defaultValue={profile.formFiller ?? null} />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="民族">
            <AutoSaveSelect
              fieldKey="ethnicity"
              mode="single"
              options={ETHNICITY_OPTIONS}
              defaultValue={profile.ethnicity ?? null}
              placeholder="选择民族"
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Form.Item label="政治面貌">
            <AutoSaveSelect
              fieldKey="politicalStatus"
              mode="single"
              options={POLITICAL_STATUS_OPTIONS}
              defaultValue={profile.politicalStatus ?? null}
              placeholder="选择政治面貌"
            />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
