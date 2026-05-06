'use client';

import { Card, Form } from 'antd';
import AutoSaveField from '../auto-save/AutoSaveField';

interface Props {
  profile: Record<string, any>;
}

const arrToStr = (a: any) => Array.isArray(a) ? a.join(',') : String(a ?? '');

export default function PreferenceSection({ profile }: Props) {
  return (
    <Card title="6. 志愿偏好与排除" size="small">
      <Form layout="vertical" size="small">
        <Form.Item label="意向省份（多选，逗号分隔）">
          <AutoSaveField fieldKey="preferredProvinces" defaultValue={arrToStr(profile.preferredProvinces)} />
        </Form.Item>
        <Form.Item label="意向城市">
          <AutoSaveField fieldKey="preferredCities" defaultValue={arrToStr(profile.preferredCities)} />
        </Form.Item>
        <Form.Item label="意向专业">
          <AutoSaveField fieldKey="preferredMajors" defaultValue={arrToStr(profile.preferredMajors)} />
        </Form.Item>
        <Form.Item label="意向院校">
          <AutoSaveField fieldKey="preferredUniversities" defaultValue={arrToStr(profile.preferredUniversities)} />
        </Form.Item>
        <Form.Item label="意向专业类别">
          <AutoSaveField fieldKey="preferredMajorCategories" defaultValue={arrToStr(profile.preferredMajorCategories)} />
        </Form.Item>
        <Form.Item label="意向批次">
          <AutoSaveField fieldKey="preferredBatches" defaultValue={arrToStr(profile.preferredBatches)} />
        </Form.Item>
        <Form.Item label="优先模式" help="city / university / major">
          <AutoSaveField fieldKey="priorityMode" defaultValue={profile.priorityMode ?? ''} />
        </Form.Item>
        <Form.Item label="意向标签">
          <AutoSaveField fieldKey="preferredTags" defaultValue={arrToStr(profile.preferredTags)} />
        </Form.Item>
        <Form.Item label="排除省份">
          <AutoSaveField fieldKey="excludedProvinces" defaultValue={arrToStr(profile.excludedProvinces)} />
        </Form.Item>
        <Form.Item label="排除城市">
          <AutoSaveField fieldKey="excludedCities" defaultValue={arrToStr(profile.excludedCities)} />
        </Form.Item>
        <Form.Item label="排除院校">
          <AutoSaveField fieldKey="excludedUniversities" defaultValue={arrToStr(profile.excludedUniversities)} />
        </Form.Item>
        <Form.Item label="排除专业">
          <AutoSaveField fieldKey="excludedMajors" defaultValue={arrToStr(profile.excludedMajors)} />
        </Form.Item>
      </Form>
    </Card>
  );
}
