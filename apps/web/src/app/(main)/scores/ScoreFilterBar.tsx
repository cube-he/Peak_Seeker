'use client';

import { Input, Radio, Select, Space, Tag } from 'antd';

const { CheckableTag } = Tag;

const TAG_OPTIONS = ['985', '211', '双一流'] as const;
export type ScoreFilterTag = (typeof TAG_OPTIONS)[number];

export interface ScoreFilters {
  search: string;
  tags: ScoreFilterTag[];
  scope: 'all' | 'local' | 'remote';
  sort: 'distance' | 'rankAsc' | 'rankDesc';
}

export const DEFAULT_SCORE_FILTERS: ScoreFilters = {
  search: '',
  tags: [],
  scope: 'all',
  sort: 'distance',
};

interface ScoreFilterBarProps {
  value: ScoreFilters;
  onChange: (next: ScoreFilters) => void;
}

export function ScoreFilterBar({ value, onChange }: ScoreFilterBarProps) {
  const toggleTag = (tag: ScoreFilterTag, checked: boolean) => {
    onChange({
      ...value,
      tags: checked ? [...value.tags, tag] : value.tags.filter((t) => t !== tag),
    });
  };

  return (
    <Space wrap size="middle">
      <Input.Search
        placeholder="搜索院校名"
        allowClear
        value={value.search}
        onChange={(e) => onChange({ ...value, search: e.target.value })}
        style={{ width: 200 }}
      />
      <Space size={4}>
        {TAG_OPTIONS.map((t) => (
          <CheckableTag
            key={t}
            checked={value.tags.includes(t)}
            onChange={(checked) => toggleTag(t, checked)}
          >
            {t}
          </CheckableTag>
        ))}
      </Space>
      <Radio.Group
        value={value.scope}
        onChange={(e) => onChange({ ...value, scope: e.target.value })}
        size="small"
      >
        <Radio.Button value="all">全部</Radio.Button>
        <Radio.Button value="local">四川</Radio.Button>
        <Radio.Button value="remote">外省</Radio.Button>
      </Radio.Group>
      <Select
        value={value.sort}
        onChange={(v) => onChange({ ...value, sort: v })}
        style={{ width: 180 }}
        options={[
          { label: '默认 (位次相近)', value: 'distance' },
          { label: '按预测位次升序', value: 'rankAsc' },
          { label: '按预测位次降序', value: 'rankDesc' },
        ]}
      />
    </Space>
  );
}
