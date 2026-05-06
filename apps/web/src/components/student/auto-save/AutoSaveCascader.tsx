'use client';
/**
 * 多字段联动 Cascader（典型用例：户籍 省/市/县）
 *
 * 一次 onChange 同步 PATCH 3 个字段；不走 useAutoSave debounce
 * （Cascader 是点击操作，无打字反复）。
 *
 * 后端 provenance 把 province/city/county（或 examLocationProvince/...）
 * 自动归到同一组（hukou / examLocation），所以 3 字段一次 PATCH = 1 次 provenance 更新。
 */
import { useState } from 'react';
import { Cascader } from 'antd';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

interface CascaderOption {
  value: string;
  label: string;
  children?: CascaderOption[];
}

interface Props {
  /** 三级字段名，按 [省, 市, 县] 顺序 */
  fieldKeys: [string, string, string];
  /** 当前值 [省名, 市名, 县名]，缺位用空 */
  defaultValue?: (string | null | undefined)[];
  options: CascaderOption[];
  placeholder?: string;
}

export default function AutoSaveCascader({ fieldKeys, defaultValue = [], options, placeholder }: Props) {
  const [value, setValue] = useState<(string | undefined)[]>(
    (defaultValue ?? []).map((v) => v ?? undefined) as (string | undefined)[],
  );
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);

  const handleChange = async (vals: (string | number)[] | undefined) => {
    const v = (vals ?? []).map((x) => String(x));
    setValue(v);
    setSaving();
    try {
      await studentApi.patchMyProfile({
        [fieldKeys[0]]: v[0] ?? null,
        [fieldKeys[1]]: v[1] ?? null,
        [fieldKeys[2]]: v[2] ?? null,
      } as any);
      setSaved();
    } catch (e) {
      setError((e as Error).message ?? '保存失败');
    }
  };

  return (
    <Cascader
      value={value as any}
      onChange={handleChange}
      options={options}
      placeholder={placeholder ?? '请选择 省 / 市 / 县'}
      changeOnSelect
      showSearch={{ filter: (input, path) => path.some((opt) => (opt.label as string).includes(input)) }}
      style={{ width: '100%' }}
    />
  );
}
