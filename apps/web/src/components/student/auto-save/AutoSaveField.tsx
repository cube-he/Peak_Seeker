'use client';

import { useState } from 'react';
import { Input } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: string;
  placeholder?: string;
}

export default function AutoSaveField({ fieldKey, defaultValue = '', placeholder }: Props) {
  const [value, setValue] = useState(defaultValue);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => { setValue(e.target.value); commit(e.target.value); }}
    />
  );
}
