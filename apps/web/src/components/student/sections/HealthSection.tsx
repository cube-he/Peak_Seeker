'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

const boolStr = (v: any) => v === true ? 'true' : v === false ? 'false' : '';

export default function HealthSection({ profile }: Props) {
  return (
    <Card title="5. 健康条件" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="身高 (cm)">
          <AutoSaveField fieldKey="height" defaultValue={String(profile.height ?? '')} />
        </Form.Item>
        <Form.Item label="体重 (kg)">
          <AutoSaveField fieldKey="weight" defaultValue={String(profile.weight ?? '')} />
        </Form.Item>
        <Form.Item label="左眼裸视">
          <AutoSaveField fieldKey="visionLeft" defaultValue={String(profile.visionLeft ?? '')} />
        </Form.Item>
        <Form.Item label="右眼裸视">
          <AutoSaveField fieldKey="visionRight" defaultValue={String(profile.visionRight ?? '')} />
        </Form.Item>
        <Form.Item label="左眼矫正后">
          <AutoSaveField fieldKey="visionLeftCorrected" defaultValue={String(profile.visionLeftCorrected ?? '')} />
        </Form.Item>
        <Form.Item label="右眼矫正后">
          <AutoSaveField fieldKey="visionRightCorrected" defaultValue={String(profile.visionRightCorrected ?? '')} />
        </Form.Item>
        <Form.Item label="色盲" help="true / false">
          <AutoSaveField fieldKey="colorBlind" defaultValue={boolStr(profile.colorBlind)} placeholder="true / false" />
        </Form.Item>
        <Form.Item label="色弱" help="true / false">
          <AutoSaveField fieldKey="colorWeak" defaultValue={boolStr(profile.colorWeak)} placeholder="true / false" />
        </Form.Item>
        <Form.Item label="身体限制">
          <AutoSaveField fieldKey="physicalLimits" defaultValue={profile.physicalLimits ?? ''} />
        </Form.Item>
        <Form.Item label="病史">
          <AutoSaveField fieldKey="medicalHistory" defaultValue={profile.medicalHistory ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
