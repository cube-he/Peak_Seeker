'use client';
import { useState } from 'react';
import { Checkbox } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Option { label: string; value: string; }
interface Props {
  fieldKey: string;
  options: Option[];
  defaultValue?: string[] | null;
  maxCount?: number;
}

export default function AutoSaveCheckbox({ fieldKey, options, defaultValue, maxCount }: Props) {
  const [value, setValue] = useState<string[]>(defaultValue ?? []);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Checkbox.Group
      value={value}
      onChange={(vals) => {
        const next = vals as string[];
        if (maxCount && next.length > maxCount) return;
        setValue(next);
        commit(next);
      }}
      options={options}
    />
  );
}
