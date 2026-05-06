'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';
import ProvenanceBadge from '../ProvenanceBadge';

interface Props {
  profile: Record<string, any>;
}

export default function BonusPolicySection({ profile }: Props) {
  return (
    <Card
      title={
        <span>
          4. 加分政策
          <ProvenanceBadge updatedBy={profile.bonusUpdatedBy} updatedAt={profile.bonusUpdatedAt} />
        </span>
      }
      size="small"
    >
      <Form layout="vertical" size="small">
        <Form.Item label="加分政策" help="如：少数民族加分 / 烈士子女 / 退伍军人 / 无">
          <AutoSaveField fieldKey="bonusPolicyStatus" defaultValue={profile.bonusPolicyStatus ?? ''} />
        </Form.Item>
        <Form.Item label="具体加分项目">
          <AutoSaveField fieldKey="bonusItems" defaultValue={profile.bonusItems ?? ''} placeholder="如：5 分加分 / 10 分加分 等具体细则" />
        </Form.Item>
      </Form>
    </Card>
  );
}
