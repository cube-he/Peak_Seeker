'use client';

import { Col, Form, Row, Tag } from 'antd';
import AutoSaveNumber from '../auto-save/AutoSaveNumber';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
import AutoSaveCheckbox from '../auto-save/AutoSaveCheckbox';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';

interface Props {
  profile: Record<string, any>;
}

const FIRST_CHOICE = [
  { label: '物理', value: 'PHYSICS' },
  { label: '历史', value: 'HISTORY' },
];

const RE_CHOICES = [
  { label: '化学', value: 'CHEM' },
  { label: '生物', value: 'BIO' },
  { label: '政治', value: 'POL' },
  { label: '地理', value: 'GEO' },
];

export default function ScoreSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={12} md={6}><Form.Item label="高考年份" required><AutoSaveNumber fieldKey="examYear" defaultValue={profile.examYear ?? null} min={2020} max={2030} /></Form.Item></Col>
        <Col xs={12} md={6}>
          <Form.Item label="成绩来源" required>
            <AutoSaveSelect
              fieldKey="examSource"
              mode="single"
              options={[
                { label: '高考实考', value: 'REAL_EXAM' },
                { label: '模考', value: 'MOCK_EXAM' },
                { label: '预估', value: 'ESTIMATED' },
              ]}
              defaultValue={profile.examSource ?? null}
              placeholder="选择成绩来源"
            />
          </Form.Item>
        </Col>
        <Col xs={12} md={6}><Form.Item label="总分"><AutoSaveNumber fieldKey="totalScore" defaultValue={profile.totalScore ?? null} min={0} max={750} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="语文" required><AutoSaveNumber fieldKey="scoreChinese" defaultValue={profile.scoreChinese ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="数学" required><AutoSaveNumber fieldKey="scoreMath" defaultValue={profile.scoreMath ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="英语" required><AutoSaveNumber fieldKey="scoreEnglish" defaultValue={profile.scoreEnglish ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="首选科目分" required><AutoSaveNumber fieldKey="scoreFirstChoice" defaultValue={profile.scoreFirstChoice ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="再选一" required><AutoSaveNumber fieldKey="scoreSub1" defaultValue={profile.scoreSub1 ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="再选二" required><AutoSaveNumber fieldKey="scoreSub2" defaultValue={profile.scoreSub2 ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}>
          <Form.Item label="位次">
            {profile.provincialRank ? (
              <Tag color="blue">#{profile.provincialRank}</Tag>
            ) : (
              <span className="text-xs text-text-faint">填写总分后自动计算</span>
            )}
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="首选科目" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} required>
            <AutoSaveRadio fieldKey="firstChoice" options={FIRST_CHOICE} defaultValue={profile.firstChoice ?? null} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item label="再选科目" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} required>
            <AutoSaveCheckbox fieldKey="reChoices" options={RE_CHOICES} defaultValue={profile.reChoices ?? []} maxCount={2} />
          </Form.Item>
        </Col>
      </Row>
    </Form>
  );
}
