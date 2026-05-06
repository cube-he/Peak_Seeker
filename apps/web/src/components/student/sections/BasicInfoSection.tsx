'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

export default function BasicInfoSection({ profile }: Props) {
  return (
    <Card title="1. 基础信息" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="姓名">
          <AutoSaveField fieldKey="realName" defaultValue={profile.realName ?? ''} />
        </Form.Item>
        <Form.Item label="手机">
          <AutoSaveField fieldKey="phone" defaultValue={profile.phone ?? ''} />
        </Form.Item>
        <Form.Item label="性别">
          <AutoSaveField fieldKey="gender" defaultValue={profile.gender ?? ''} placeholder="男/女" />
        </Form.Item>
        <Form.Item label="科类">
          <AutoSaveField fieldKey="examType" defaultValue={profile.examType ?? ''} placeholder="物理类/历史类" />
        </Form.Item>
        <Form.Item label="家长手机">
          <AutoSaveField fieldKey="parentPhone" defaultValue={profile.parentPhone ?? ''} />
        </Form.Item>
        <Form.Item label="本表填写人">
          <AutoSaveField fieldKey="formFiller" defaultValue={profile.formFiller ?? ''} placeholder="本人/家长/老师" />
        </Form.Item>
        <Form.Item label="民族">
          <AutoSaveField fieldKey="ethnicity" defaultValue={profile.ethnicity ?? ''} />
        </Form.Item>
        <Form.Item label="政治面貌">
          <AutoSaveField fieldKey="politicalStatus" defaultValue={profile.politicalStatus ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
