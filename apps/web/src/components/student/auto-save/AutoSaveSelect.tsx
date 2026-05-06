'use client';
import { useState } from 'react';
import { Select } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: string[] | string | null;
  /** 'single' 单选；'multiple' 多选限定列表；'tags' 多选可自由输入 */
  mode?: 'single' | 'multiple' | 'tags';
  options?: { label: string; value: string }[];
  placeholder?: string;
  /** 单选模式下允许清空 */
  allowClear?: boolean;
  showSearch?: boolean;
}

export default function AutoSaveSelect({
  fieldKey,
  defaultValue,
  mode = 'tags',
  options,
  placeholder,
  allowClear,
  showSearch,
}: Props) {
  const [value, setValue] = useState<string[] | string | undefined>(
    defaultValue == null ? undefined : (defaultValue as any),
  );
  const { commit } = useAutoSave(fieldKey);

  // 单选模式 antd 不接受 mode 字段，传 undefined
  const antdMode = mode === 'single' ? undefined : mode;

  return (
    <Select
      mode={antdMode}
      value={value as any}
      onChange={(v) => { setValue(v); commit(v); }}
      options={options}
      placeholder={placeholder}
      allowClear={allowClear ?? mode === 'single'}
      showSearch={showSearch ?? mode === 'single'}
      optionFilterProp="label"
      style={{ width: '100%' }}
      tokenSeparators={mode !== 'single' ? [',', '，'] : undefined}
    />
  );
}
