'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';
interface Props { profile: Record<string, any>; }

export default function BonusPolicySection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}><Form.Item label="政策"><AutoSaveField fieldKey="bonusPolicyStatus" defaultValue={profile.bonusPolicyStatus ?? ''} placeholder="少数民族 / 烈士子女 / 退伍军人 / 无" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="加分细则" labelCol={{span:2}} wrapperCol={{span:22}}><AutoSaveTextArea fieldKey="bonusItems" defaultValue={profile.bonusItems ?? ''} rows={2} placeholder="如 +5 / +10" /></Form.Item></Col>
      </Row>
    </Form>
  );
}
