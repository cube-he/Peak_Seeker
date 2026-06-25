'use client';

import { useState } from 'react';
import { Col, Form, Radio, Row } from 'antd';
import AutoSaveNumber from '../auto-save/AutoSaveNumber';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';
import { studentApi } from '@/services/student-api';

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
        <Col xs={24} md={12}>
          <Form.Item label="色觉" required>
            <ColorVisionField profile={profile} />
          </Form.Item>
        </Col>
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

/**
 * 色觉单 Radio: UI 三选一 (正常/色盲/色弱) → DB 双布尔 (colorBlind + colorWeak).
 * 业务必填 (2026-06-25): REQUIRED_FIELDS 含 colorBlind + colorWeak, 老师必须明确选一档.
 * 互斥语义: Radio 单选保证色盲与色弱不同时为 true.
 */
function ColorVisionField({ profile }: { profile: Record<string, any> }) {
  const initial: '正常' | '色盲' | '色弱' =
    profile.colorBlind ? '色盲' : profile.colorWeak ? '色弱' : '正常';
  const [value, setValue] = useState<'正常' | '色盲' | '色弱'>(initial);
  const onChange = async (next: '正常' | '色盲' | '色弱') => {
    setValue(next);
    await studentApi.patchMyProfile({
      colorBlind: next === '色盲',
      colorWeak: next === '色弱',
    } as any);
  };
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value)}>
      <Radio value="正常">正常</Radio>
      <Radio value="色盲">色盲</Radio>
      <Radio value="色弱">色弱</Radio>
    </Radio.Group>
  );
}
