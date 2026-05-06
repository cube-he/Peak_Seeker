'use client';

import { Card, Form, Tag } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

export default function ScoreSection({ profile }: Props) {
  return (
    <Card title="2. 分数与选科" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="首选科目">
          <AutoSaveField fieldKey="firstChoice" defaultValue={profile.firstChoice ?? ''} placeholder="物理 / 历史" />
        </Form.Item>
        <Form.Item label="再选科目（2 科）">
          <AutoSaveField fieldKey="reChoices" defaultValue={Array.isArray(profile.reChoices) ? profile.reChoices.join(',') : (profile.reChoices ?? '')} placeholder="如：化学,生物" />
        </Form.Item>
        <Form.Item label="总分">
          <AutoSaveField fieldKey="totalScore" defaultValue={String(profile.totalScore ?? '')} />
        </Form.Item>
        <Form.Item label="语文">
          <AutoSaveField fieldKey="scoreChinese" defaultValue={String(profile.scoreChinese ?? '')} />
        </Form.Item>
        <Form.Item label="数学">
          <AutoSaveField fieldKey="scoreMath" defaultValue={String(profile.scoreMath ?? '')} />
        </Form.Item>
        <Form.Item label="英语">
          <AutoSaveField fieldKey="scoreEnglish" defaultValue={String(profile.scoreEnglish ?? '')} />
        </Form.Item>
        <Form.Item label="首选分">
          <AutoSaveField fieldKey="scoreFirstChoice" defaultValue={String(profile.scoreFirstChoice ?? '')} />
        </Form.Item>
        <Form.Item label="再选 1">
          <AutoSaveField fieldKey="scoreSub1" defaultValue={String(profile.scoreSub1 ?? '')} />
        </Form.Item>
        <Form.Item label="再选 2">
          <AutoSaveField fieldKey="scoreSub2" defaultValue={String(profile.scoreSub2 ?? '')} />
        </Form.Item>
        <Form.Item label="全省位次">
          {profile.provincialRank ? (
            <Tag color="blue">{profile.provincialRank}</Tag>
          ) : (
            <span className="text-text-faint text-xs">填完总分+科类后自动计算</span>
          )}
        </Form.Item>
      </Form>
    </Card>
  );
}
