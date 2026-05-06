'use client';
import { Form, Row, Col } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';
import AutoSaveTextArea from '../auto-save/AutoSaveTextArea';
import AutoSaveSwitch from '../auto-save/AutoSaveSwitch';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
interface Props { profile: Record<string, any>; }

const STAY_PREF = [
  {label:'仅本省',value:'LOCAL_ONLY'},
  {label:'倾向本省',value:'PREFER_LOCAL'},
  {label:'无所谓',value:'NO_PREFERENCE'},
  {label:'倾向外省',value:'PREFER_OUTSIDE'},
];

const TUITION = [
  {label:'低 (<6k/年)',value:'LOW'},
  {label:'中 (6k-1w)',value:'MEDIUM'},
  {label:'高 (1w-3w)',value:'HIGH'},
  {label:'不限',value:'UNLIMITED'},
];

export default function PlanningSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 8 }} wrapperCol={{ span: 16 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}><Form.Item label="升学规划"><AutoSaveField fieldKey="careerPlan" defaultValue={profile.careerPlan ?? ''} placeholder="本科/考研/留学..." /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="职业方向"><AutoSaveField fieldKey="careerDirection" defaultValue={profile.careerDirection ?? ''} placeholder="软件/医疗/金融..." /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="军校意愿"><AutoSaveSwitch fieldKey="militaryInterest" defaultValue={profile.militaryInterest} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="师范意愿"><AutoSaveSwitch fieldKey="teacherInterest" defaultValue={profile.teacherInterest} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="接受偏远"><AutoSaveSwitch fieldKey="remoteAreaAcceptance" defaultValue={profile.remoteAreaAcceptance} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="接受冷门"><AutoSaveSwitch fieldKey="coldMajorAcceptance" defaultValue={profile.coldMajorAcceptance} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="中外合办"><AutoSaveSwitch fieldKey="acceptSinoForeign" defaultValue={profile.acceptSinoForeign} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="民办"><AutoSaveSwitch fieldKey="acceptPrivate" defaultValue={profile.acceptPrivate} /></Form.Item></Col>
        <Col xs={12} md={6}><Form.Item label="合作办学"><AutoSaveSwitch fieldKey="acceptCooperation" defaultValue={profile.acceptCooperation} /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="性格类型"><AutoSaveField fieldKey="personalityType" defaultValue={profile.personalityType ?? ''} placeholder="如 INTJ / 内向" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="留省偏好" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveRadio fieldKey="stayPreference" options={STAY_PREF} defaultValue={profile.stayPreference ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="学费预算" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveRadio fieldKey="tuitionBudget" options={TUITION} defaultValue={profile.tuitionBudget ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="兴趣爱好" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveTextArea fieldKey="interests" defaultValue={profile.interests ?? ''} rows={2} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="自我描述" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveTextArea fieldKey="selfDescription" defaultValue={profile.selfDescription ?? ''} rows={3} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="其他要求" labelCol={{span:4}} wrapperCol={{span:20}}><AutoSaveTextArea fieldKey="otherRequirements" defaultValue={profile.otherRequirements ?? ''} rows={2} /></Form.Item></Col>
      </Row>
    </Form>
  );
}
