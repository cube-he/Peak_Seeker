'use client';

import { Col, Form, Row } from 'antd';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';
import { BONUS_POLICY_OPTIONS } from '@/data/student-options';
import BonusCalcCard from '@/components/policy/BonusCalcCard';

interface Props {
  profile: Record<string, any>;
}

export default function BonusPolicySection({ profile }: Props) {
  return (
    <div className="space-y-3">
      <Form layout="horizontal" labelCol={{ span: 4 }} wrapperCol={{ span: 20 }} size="small">
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item label="政策">
              <AutoSaveSelect
                fieldKey="bonusPolicyStatus"
                mode="single"
                options={BONUS_POLICY_OPTIONS}
                defaultValue={profile.bonusPolicyStatus ?? null}
                placeholder="选择加分政策"
              />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item label="加分细则" labelCol={{ span: 2 }} wrapperCol={{ span: 22 }}>
              <AutoSaveTextArea
                fieldKey="bonusItems"
                defaultValue={profile.bonusItems ?? ''}
                rows={2}
                placeholder="例如 +5 / +10 / 具体细则说明"
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>

      <BonusCalcCard />
    </div>
  );
}
