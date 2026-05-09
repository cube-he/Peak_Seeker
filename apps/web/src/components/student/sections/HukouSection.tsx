'use client';

import { Col, Form, Row } from 'antd';
import AutoSaveCascader from '../auto-save/AutoSaveCascader';
import AutoSaveSwitch from '../auto-save/AutoSaveSwitch';
import { getRegionCascaderOptions } from '@/data/student-options';

interface Props {
  profile: Record<string, any>;
}

export default function HukouSection({ profile }: Props) {
  const regionOptions = getRegionCascaderOptions();
  return (
    <Form layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}>
          <Form.Item label="户籍">
            <AutoSaveCascader
              fieldKeys={['province', 'city', 'county']}
              defaultValue={[profile.province, profile.city, profile.county]}
              options={regionOptions}
              placeholder="选择省 / 市 / 县"
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="高考报名地">
            <AutoSaveCascader
              fieldKeys={['examLocationProvince', 'examLocationCity', 'examLocationCounty']}
              defaultValue={[profile.examLocationProvince, profile.examLocationCity, profile.examLocationCounty]}
              options={regionOptions}
              placeholder="选择省 / 市 / 县"
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}>
          <Form.Item label="农村户籍">
            <AutoSaveSwitch fieldKey="isRural" defaultValue={profile.isRural} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
