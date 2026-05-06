'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveSwitch from '../auto-save/AutoSaveSwitch';
interface Props { profile: Record<string, any>; }

export default function HukouSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={8}><Form.Item label="户籍省"><AutoSaveField fieldKey="province" defaultValue={profile.province ?? ''} placeholder="如 四川" /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="户籍市"><AutoSaveField fieldKey="city" defaultValue={profile.city ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="户籍县"><AutoSaveField fieldKey="county" defaultValue={profile.county ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="高考报名省"><AutoSaveField fieldKey="examLocationProvince" defaultValue={profile.examLocationProvince ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="高考报名市"><AutoSaveField fieldKey="examLocationCity" defaultValue={profile.examLocationCity ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="高考报名县"><AutoSaveField fieldKey="examLocationCounty" defaultValue={profile.examLocationCounty ?? ''} /></Form.Item></Col>
        <Col xs={24} md={8}><Form.Item label="农村户籍"><AutoSaveSwitch fieldKey="isRural" defaultValue={profile.isRural} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
