'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { studentApi } from '@/services/student-api';
import { userService } from '@/services/user';
import { useStudentSaveStore } from '@/stores/student-save-state';

const DEBOUNCE_MS = 1500;

// 这些字段位于 User 表（不在 StudentProfile）。autosave 时必须走 PUT /users/me，
// 否则 PUT /students/me 会因 forbidNonWhitelisted 拒绝（"property X should not exist" → 400）
const USER_FIELD_KEYS = new Set(['realName', 'phone', 'gender', 'ethnicity']);

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
  const queryClient = useQueryClient();

  const send = useCallback(
    async (val: unknown) => {
      setSaving();
      try {
        if (USER_FIELD_KEYS.has(fieldKey)) {
          await userService.updateProfile({ [fieldKey]: val } as any);
        } else {
          // TODO(typed-patch): replace `as any` with typed `PatchProfileDto<K>` helper across all autosave components
          await studentApi.patchMyProfile({ [fieldKey]: val } as any);
        }
        setSaved();
        // 加分相关字段（民族 / 户籍 / bonusItems...）改动后让 BonusCalcCard 重算
        queryClient.invalidateQueries({ queryKey: ['bonus-calc'] });
      } catch (e) {
        setError((e as Error).message ?? '保存失败');
      }
    },
    [fieldKey, setSaving, setSaved, setError, queryClient],
  );

  const debouncedSend = useMemo(
    () => makeDebounced((val: unknown) => { void send(val); }, DEBOUNCE_MS),
    [send],
  );

  useEffect(() => () => { debouncedSend.cancel(); }, [debouncedSend]);

  return { commit: debouncedSend, cancel: debouncedSend.cancel };
}
