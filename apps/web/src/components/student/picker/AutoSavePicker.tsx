'use client';

import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { useAutoSave } from '../auto-save/useAutoSave';

export interface PickerOption {
  label: string;
  value: string;
}

interface Props {
  fieldKey: string;
  defaultValue?: string[];
  /** 每个字段注入对应的 hook，避免选项写死在组件内 */
  optionsHook: () => { data: PickerOption[]; isLoading: boolean };
  placeholder?: string;
  /** 默认 "responsive"；测试环境可传数字规避 jsdom 零宽布局问题 */
  maxTagCount?: number | 'responsive';
}

export default function AutoSavePicker({
  fieldKey,
  defaultValue = [],
  optionsHook,
  placeholder,
  maxTagCount = 'responsive',
}: Props) {
  const [value, setValue] = useState<string[]>(defaultValue);
  // 选项由调用方 hook 提供，支持静态常量或 React Query 两种形式
  const { data: options, isLoading } = optionsHook();
  const { commit } = useAutoSave(fieldKey);

  // I4: 父组件 refetch profile 后 defaultValue 变更时同步本地 state
  // (老师并发改动 / BonusCalc 服务端回写场景)
  useEffect(() => {
    setValue(defaultValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(defaultValue)]);

  const handleChange = (v: string[]) => {
    setValue(v);
    commit(v);
  };

  return (
    <Select<string[]>
      mode="multiple"
      showSearch
      optionFilterProp="label"
      options={options}
      loading={isLoading}
      notFoundContent={isLoading ? '加载中...' : '无匹配'}
      maxTagCount={maxTagCount}
      virtual
      placeholder={placeholder ?? '搜索并勾选'}
      value={value}
      onChange={handleChange}
      style={{ width: '100%' }}
    />
  );
}
