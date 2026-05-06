'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

const boolStr = (v: any) => v === true ? 'true' : v === false ? 'false' : '';

export default function PlanningSection({ profile }: Props) {
  return (
    <Card title="7. 升学规划与个性" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="升学规划">
          <AutoSaveField fieldKey="careerPlan" defaultValue={profile.careerPlan ?? ''} />
        </Form.Item>
        <Form.Item label="职业方向">
          <AutoSaveField fieldKey="careerDirection" defaultValue={profile.careerDirection ?? ''} />
        </Form.Item>
        <Form.Item label="军校意愿" help="true / false">
          <AutoSaveField fieldKey="militaryInterest" defaultValue={boolStr(profile.militaryInterest)} />
        </Form.Item>
        <Form.Item label="师范意愿" help="true / false">
          <AutoSaveField fieldKey="teacherInterest" defaultValue={boolStr(profile.teacherInterest)} />
        </Form.Item>
        <Form.Item label="兴趣爱好">
          <AutoSaveField fieldKey="interests" defaultValue={profile.interests ?? ''} />
        </Form.Item>
        <Form.Item label="性格类型">
          <AutoSaveField fieldKey="personalityType" defaultValue={profile.personalityType ?? ''} />
        </Form.Item>
        <Form.Item label="自我描述">
          <AutoSaveField fieldKey="selfDescription" defaultValue={profile.selfDescription ?? ''} />
        </Form.Item>
        <Form.Item label="是否接受偏远地区" help="true / false">
          <AutoSaveField fieldKey="remoteAreaAcceptance" defaultValue={boolStr(profile.remoteAreaAcceptance)} />
        </Form.Item>
        <Form.Item label="是否接受冷门专业" help="true / false">
          <AutoSaveField fieldKey="coldMajorAcceptance" defaultValue={boolStr(profile.coldMajorAcceptance)} />
        </Form.Item>
        <Form.Item label="留省/出省偏好">
          <AutoSaveField fieldKey="stayPreference" defaultValue={profile.stayPreference ?? ''} placeholder="stay / leave / no_pref" />
        </Form.Item>
        <Form.Item label="学费预算 (元/年)">
          <AutoSaveField fieldKey="tuitionBudget" defaultValue={String(profile.tuitionBudget ?? '')} />
        </Form.Item>
        <Form.Item label="是否接受中外合办" help="true / false">
          <AutoSaveField fieldKey="acceptSinoForeign" defaultValue={boolStr(profile.acceptSinoForeign)} />
        </Form.Item>
        <Form.Item label="是否接受民办" help="true / false">
          <AutoSaveField fieldKey="acceptPrivate" defaultValue={boolStr(profile.acceptPrivate)} />
        </Form.Item>
        <Form.Item label="是否接受合作办学" help="true / false">
          <AutoSaveField fieldKey="acceptCooperation" defaultValue={boolStr(profile.acceptCooperation)} />
        </Form.Item>
        <Form.Item label="其他要求">
          <AutoSaveField fieldKey="otherRequirements" defaultValue={profile.otherRequirements ?? ''} />
        </Form.Item>
      </Form>
    </Card>
  );
}
