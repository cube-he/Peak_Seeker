'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';
import ProvenanceBadge from '../ProvenanceBadge';

interface Props {
  profile: Record<string, any>;
}

export default function HukouSection({ profile }: Props) {
  return (
    <Card
      title={
        <span>
          3. 户籍与考试地
          <ProvenanceBadge updatedBy={profile.hukouUpdatedBy} updatedAt={profile.hukouUpdatedAt} />
        </span>
      }
      size="small"
    >
      <Form layout="vertical" size="small">
        <Form.Item label="户籍省">
          <AutoSaveField fieldKey="province" defaultValue={profile.province ?? ''} />
        </Form.Item>
        <Form.Item label="户籍市">
          <AutoSaveField fieldKey="city" defaultValue={profile.city ?? ''} />
        </Form.Item>
        <Form.Item label="户籍县（区）">
          <AutoSaveField fieldKey="county" defaultValue={profile.county ?? ''} />
        </Form.Item>
        <Form.Item label="是否农村户籍" help="填 true / false">
          <AutoSaveField
            fieldKey="isRural"
            defaultValue={profile.isRural === true ? 'true' : profile.isRural === false ? 'false' : ''}
            placeholder="true / false"
          />
        </Form.Item>
        <Form.Item label="高考报名省">
          <AutoSaveField fieldKey="examLocationProvince" defaultValue={profile.examLocationProvince ?? ''} />
        </Form.Item>
        <Form.Item label="高考报名市">
          <AutoSaveField fieldKey="examLocationCity" defaultValue={profile.examLocationCity ?? ''} />
        </Form.Item>
        <Form.Item label="高考报名县（区）">
          <AutoSaveField fieldKey="examLocationCounty" defaultValue={profile.examLocationCounty ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
