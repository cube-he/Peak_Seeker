'use client';

import { useState } from 'react';
import { Switch } from 'antd';
import { useAutoSave } from './useAutoSave';

interface Props {
  fieldKey: string;
  defaultValue?: boolean | null;
  checkedChildren?: string;
  unCheckedChildren?: string;
}

export default function AutoSaveSwitch({
  fieldKey,
  defaultValue,
  checkedChildren = '是',
  unCheckedChildren = '否',
}: Props) {
  const [value, setValue] = useState<boolean>(defaultValue === true);
  const { commit } = useAutoSave(fieldKey);
  return (
    <Switch
      checked={value}
      onChange={(v) => {
        setValue(v);
        commit(v);
      }}
      checkedChildren={checkedChildren}
      unCheckedChildren={unCheckedChildren}
    />
  );
}
