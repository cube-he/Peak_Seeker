'use client';

import { Col, Form, Row } from 'antd';
import AutoSaveNumber from '../auto-save/AutoSaveNumber';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import AutoSaveSwitch from '../auto-save/AutoSaveSwitch';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';

interface Props {
  profile: Record<string, any>;
}

export default function HealthSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={12} md={6}><Form.Item label="身高(cm)"><AutoSaveNumber fieldKey="height" defaultValue={profile.height ? Number(profile.height) : null} step={0.1} min={100} max={250} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="体重(kg)"><AutoSaveNumber fieldKey="weight" defaultValue={profile.weight ? Number(profile.weight) : null} step={0.1} min={20} max={200} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="左眼裸视"><AutoSaveNumber fieldKey="visionLeft" defaultValue={profile.visionLeft ? Number(profile.visionLeft) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="右眼裸视"><AutoSaveNumber fieldKey="visionRight" defaultValue={profile.visionRight ? Number(profile.visionRight) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="左眼矫正"><AutoSaveNumber fieldKey="visionLeftCorrected" defaultValue={profile.visionLeftCorrected ? Number(profile.visionLeftCorrected) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="右眼矫正"><AutoSaveNumber fieldKey="visionRightCorrected" defaultValue={profile.visionRightCorrected ? Number(profile.visionRightCorrected) : null} step={0.1} min={0} max={5} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="色盲"><AutoSaveSwitch fieldKey="colorBlind" defaultValue={profile.colorBlind} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="色弱"><AutoSaveSwitch fieldKey="colorWeak" defaultValue={profile.colorWeak} /></Form.Item></Col>
        <Col xs={24}>
          <Form.Item label="身体限制" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
            <AutoSaveSelect fieldKey="physicalLimits" defaultValue={profile.physicalLimits ?? []} mode="tags" placeholder="回车添加限制项" />
          </Form.Item>
        </Col>
        <Col xs={24}>
          <Form.Item label="病史" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }}>
            <AutoSaveTextArea fieldKey="medicalHistory" defaultValue={profile.medicalHistory ?? ''} rows={2} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
