'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { studentApi } from '@/services/student-api';
import { useStudentSaveStore } from '@/stores/student-save-state';

const DEBOUNCE_MS = 1500;

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
    if (timer) { clearTimeout(timer); timer = null; }
  };
  return debounced;
}

export function useAutoSave(fieldKey: string) {
  const setSaving = useStudentSaveStore((s) => s.setSaving);
  const setSaved = useStudentSaveStore((s) => s.setSaved);
  const setError = useStudentSaveStore((s) => s.setError);

  const send = useCallback(
    async (val: unknown) => {
      setSaving();
      try {
        await studentApi.patchMyProfile({ [fieldKey]: val } as any);
        setSaved();
      } catch (e) {
        setError((e as Error).message ?? '保存失败');
      }
    },
    [fieldKey, setSaving, setSaved, setError],
  );

  const debouncedSend = useMemo(
    () => makeDebounced((val: unknown) => { void send(val); }, DEBOUNCE_MS),
    [send],
  );

  useEffect(() => () => { debouncedSend.cancel(); }, [debouncedSend]);

  return { commit: debouncedSend, cancel: debouncedSend.cancel };
}
