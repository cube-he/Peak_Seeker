'use client';
import { useState } from 'react';
import { Input } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
}

export default function AutoSaveTextArea({ fieldKey, defaultValue = '', placeholder, rows = 3 }: Props) {
  const [value, setValue] = useState(defaultValue);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Input.TextArea
      value={value}
      placeholder={placeholder}
      autoSize={{ minRows: rows, maxRows: 8 }}
      onChange={(e) => { setValue(e.target.value); commit(e.target.value); }}
    />
  );
}
