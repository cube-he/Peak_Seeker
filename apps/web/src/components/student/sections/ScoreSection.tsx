'use client';
import { Form, Row, Col, Tag } from 'antd';
import AutoSaveNumber from '../auto-save/AutoSaveNumber';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
import AutoSaveCheckbox from '../auto-save/AutoSaveCheckbox';
interface Props { profile: Record<string, any>; }

const FIRST_CHOICE = [{label:'物理',value:'PHYSICS'},{label:'历史',value:'HISTORY'}];
const RE_CHOICES = [
  {label:'化学',value:'CHEM'},{label:'生物',value:'BIO'},
  {label:'政治',value:'POL'},{label:'地理',value:'GEO'},
];

export default function ScoreSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 10 }} wrapperCol={{ span: 14 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={12} md={6}><Form.Item label="总分"><AutoSaveNumber fieldKey="totalScore" defaultValue={profile.totalScore ?? null} min={0} max={750} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="语文"><AutoSaveNumber fieldKey="scoreChinese" defaultValue={profile.scoreChinese ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="数学"><AutoSaveNumber fieldKey="scoreMath" defaultValue={profile.scoreMath ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="英语"><AutoSaveNumber fieldKey="scoreEnglish" defaultValue={profile.scoreEnglish ?? null} min={0} max={150} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="首选分"><AutoSaveNumber fieldKey="scoreFirstChoice" defaultValue={profile.scoreFirstChoice ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="再选1"><AutoSaveNumber fieldKey="scoreSub1" defaultValue={profile.scoreSub1 ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="再选2"><AutoSaveNumber fieldKey="scoreSub2" defaultValue={profile.scoreSub2 ?? null} min={0} max={100} /></Form.Item></Col>
        <Col xs={12} md={6}>
          <Form.Item label="位次">{profile.provincialRank ? <Tag color="blue">#{profile.provincialRank}</Tag> : <span className="text-text-faint text-xs">填总分后自动算</span>}</Form.Item>
        </Col>
        <Col xs={24} md={12}><Form.Item label="首选科目" labelCol={{span:6}} wrapperCol={{span:18}}><AutoSaveRadio fieldKey="firstChoice" options={FIRST_CHOICE} defaultValue={profile.firstChoice ?? null} /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="再选(2)" labelCol={{span:6}} wrapperCol={{span:18}}><AutoSaveCheckbox fieldKey="reChoices" options={RE_CHOICES} defaultValue={profile.reChoices ?? []} maxCount={2} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
