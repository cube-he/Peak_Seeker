'use client';
import { Form, Row, Col, Divider } from 'antd';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
interface Props { profile: Record<string, any>; }

const PRIORITY_MODE = [
  {label:'院校优先',value:'UNIVERSITY_FIRST'},
  {label:'专业优先',value:'MAJOR_FIRST'},
  {label:'城市优先',value:'CITY_FIRST'},
  {label:'均衡',value:'BALANCED'},
];

export default function PreferenceSection({ profile }: Props) {
  return (
    <Form layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} size="small">
      <Row gutter={[16, 0]}>
        <Col xs={24} md={12}><Form.Item label="意向省份"><AutoSaveSelect fieldKey="preferredProvinces" defaultValue={profile.preferredProvinces ?? []} mode="tags" placeholder="输入回车添加" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向城市"><AutoSaveSelect fieldKey="preferredCities" defaultValue={profile.preferredCities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向院校"><AutoSaveSelect fieldKey="preferredUniversities" defaultValue={profile.preferredUniversities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业"><AutoSaveSelect fieldKey="preferredMajors" defaultValue={profile.preferredMajors ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业类别"><AutoSaveSelect fieldKey="preferredMajorCategories" defaultValue={profile.preferredMajorCategories ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向批次"><AutoSaveSelect fieldKey="preferredBatches" defaultValue={profile.preferredBatches ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="优先模式" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveRadio fieldKey="priorityMode" options={PRIORITY_MODE} defaultValue={profile.priorityMode ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="意向标签" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveSelect fieldKey="preferredTags" defaultValue={profile.preferredTags ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24}><Divider plain orientation="left" style={{margin:'8px 0',fontSize:12,color:'#999'}}>排除项</Divider></Col>
        <Col xs={24} md={12}><Form.Item label="排除省份"><AutoSaveSelect fieldKey="excludedProvinces" defaultValue={profile.excludedProvinces ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除城市"><AutoSaveSelect fieldKey="excludedCities" defaultValue={profile.excludedCities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除院校"><AutoSaveSelect fieldKey="excludedUniversities" defaultValue={profile.excludedUniversities ?? []} mode="tags" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除专业"><AutoSaveSelect fieldKey="excludedMajors" defaultValue={profile.excludedMajors ?? []} mode="tags" /></Form.Item></Col>
      </Row>
    </Form>
  );
}
