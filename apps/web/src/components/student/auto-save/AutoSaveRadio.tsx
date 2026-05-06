'use client';
import { useState } from 'react';
import { Radio } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Option { label: string; value: string; }
interface Props {
  fieldKey: string;
  options: Option[];
  defaultValue?: string | null;
}

export default function AutoSaveRadio({ fieldKey, options, defaultValue }: Props) {
  const [value, setValue] = useState<string | null>(defaultValue ?? null);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Radio.Group
      value={value}
      onChange={(e) => { setValue(e.target.value); commit(e.target.value); }}
      options={options}
      optionType="button"
      buttonStyle="solid"
    />
  );
}
