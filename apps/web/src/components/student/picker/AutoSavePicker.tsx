'use client';

import { useState } from 'react';
import { Select } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

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
  const [open, setOpen] = useState(false);
  // 选项由调用方 hook 提供，支持静态常量或 React Query 两种形式
  const { data: options, isLoading } = optionsHook();
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);
  const queryClient = useQueryClient();

  const handleChange = async (v: string[]) => {
    setValue(v);
    setSaving();
    try {
      await studentApi.patchMyProfile({ [fieldKey]: v } as any);
      setSaved();
      // picker 字段（城市/专业类别等）可能影响加分计算，改动后让 BonusCalcCard 重算
      queryClient.invalidateQueries({ queryKey: ['bonus-calc'] });
    } catch (e) {
      setError((e as Error).message ?? '保存失败');
    }
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
      open={open}
      onOpenChange={setOpen}
      style={{ width: '100%' }}
    />
  );
}
