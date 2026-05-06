'use client';
import { useState } from 'react';
import { Select } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: string[] | string | null;
  mode?: 'multiple' | 'tags';
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export default function AutoSaveSelect({ fieldKey, defaultValue, mode = 'tags', options, placeholder }: Props) {
  const [value, setValue] = useState<string[] | string | undefined>(
    defaultValue == null ? undefined : (defaultValue as any),
  );
  const { commit } = useAutoSave(fieldKey);
  return (
    <Select
      mode={mode}
      value={value as any}
      onChange={(v) => { setValue(v); commit(v); }}
      options={options}
      placeholder={placeholder}
      style={{ width: '100%' }}
      tokenSeparators={[',', '，']}
    />
  );
}
