'use client';
import { Form, Row, Col, Divider } from 'antd';
import AutoSaveSelect from '../auto-save/AutoSaveSelect';
import AutoSaveRadio from '../auto-save/AutoSaveRadio';
import AutoSavePicker from '../picker/AutoSavePicker';
import { useProvinceOptions } from '../picker/options/useProvinceOptions';
import { useCityOptions } from '../picker/options/useCityOptions';
import { useMajorCategoryOptions } from '../picker/options/useMajorCategoryOptions';
import { useUniversityOptions } from '../picker/options/useUniversityOptions';
import { useMajorOptions } from '../picker/options/useMajorOptions';
import { useBatchOptions } from '../picker/options/useBatchOptions';

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
        <Col xs={24} md={12}><Form.Item label="意向省份"><AutoSavePicker fieldKey="preferredProvinces" defaultValue={profile.preferredProvinces ?? []} optionsHook={useProvinceOptions} placeholder="搜索省份" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向城市"><AutoSavePicker fieldKey="preferredCities" defaultValue={profile.preferredCities ?? []} optionsHook={useCityOptions} placeholder="搜索城市" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向院校"><AutoSavePicker fieldKey="preferredUniversities" defaultValue={profile.preferredUniversities ?? []} optionsHook={useUniversityOptions} placeholder="搜索院校" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业"><AutoSavePicker fieldKey="preferredMajors" defaultValue={profile.preferredMajors ?? []} optionsHook={useMajorOptions} placeholder="搜索专业" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向专业类别"><AutoSavePicker fieldKey="preferredMajorCategories" defaultValue={profile.preferredMajorCategories ?? []} optionsHook={useMajorCategoryOptions} placeholder="搜索专业类别" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="意向批次"><AutoSavePicker fieldKey="preferredBatches" defaultValue={profile.preferredBatches ?? []} optionsHook={useBatchOptions} placeholder="搜索批次" /></Form.Item></Col>
        <Col xs={24}><Form.Item label="优先模式" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveRadio fieldKey="priorityMode" options={PRIORITY_MODE} defaultValue={profile.priorityMode ?? null} /></Form.Item></Col>
        <Col xs={24}><Form.Item label="意向标签" labelCol={{span:3}} wrapperCol={{span:21}}><AutoSaveSelect fieldKey="preferredTags" defaultValue={profile.preferredTags ?? []} mode="tags" placeholder="自由输入回车添加" /></Form.Item></Col>
        <Col xs={24}><Divider plain orientation="left" style={{margin:'8px 0',fontSize:12,color:'#999'}}>排除项</Divider></Col>
        <Col xs={24} md={12}><Form.Item label="排除省份"><AutoSavePicker fieldKey="excludedProvinces" defaultValue={profile.excludedProvinces ?? []} optionsHook={useProvinceOptions} placeholder="搜索省份" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除城市"><AutoSavePicker fieldKey="excludedCities" defaultValue={profile.excludedCities ?? []} optionsHook={useCityOptions} placeholder="搜索城市" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除院校"><AutoSavePicker fieldKey="excludedUniversities" defaultValue={profile.excludedUniversities ?? []} optionsHook={useUniversityOptions} placeholder="搜索院校" /></Form.Item></Col>
        <Col xs={24} md={12}><Form.Item label="排除专业"><AutoSavePicker fieldKey="excludedMajors" defaultValue={profile.excludedMajors ?? []} optionsHook={useMajorOptions} placeholder="搜索专业" /></Form.Item></Col>
      </Row>
    </Form>
  );
}
