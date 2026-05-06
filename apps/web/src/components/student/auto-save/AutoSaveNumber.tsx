'use client';
import { useState } from 'react';
import { InputNumber } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: number | null;
  step?: number;
  min?: number;
  max?: number;
  placeholder?: string;
}

export default function AutoSaveNumber({ fieldKey, defaultValue, step = 1, min, max, placeholder }: Props) {
  const [value, setValue] = useState<number | null>(defaultValue ?? null);
  const { commit } = useAutoSave(fieldKey);
  return (
    <InputNumber
      value={value}
      onChange={(v) => { setValue(v as number | null); commit(v); }}
      step={step}
      min={min}
      max={max}
      placeholder={placeholder}
      style={{ width: '100%' }}
    />
  );
}
