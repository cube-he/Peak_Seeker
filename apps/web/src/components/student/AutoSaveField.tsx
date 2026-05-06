'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Input } from 'antd';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

interface Props {
  fieldKey: string;
  defaultValue?: string;
  placeholder?: string;
}

const DEBOUNCE_MS = 1500;

/**
 * Inline debounce — avoids adding lodash dep for a single use.
 * Returns the debounced function with `cancel()` method.
 */
function makeDebounced<T extends (...args: any[]) => any>(fn: T, wait: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

export default function AutoSaveField({ fieldKey, defaultValue = '', placeholder }: Props) {
  const [value, setValue] = useState(defaultValue);
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);

  const send = useCallback(
    async (val: string) => {
      setSaving();
      try {
        await studentApi.patchMyProfile({ [fieldKey]: val });
        setSaved();
      } catch (e) {
        setError((e as Error).message ?? '保存失败');
      }
    },
    [fieldKey, setSaving, setSaved, setError],
  );

  const debouncedSend = useMemo(() => makeDebounced((val: string) => { void send(val); }, DEBOUNCE_MS), [send]);

  useEffect(() => () => { debouncedSend.cancel(); }, [debouncedSend]);

  return (
    <Input
      value={value}
      placeholder={placeholder}
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        debouncedSend(v);
      }}
    />
  );
}
