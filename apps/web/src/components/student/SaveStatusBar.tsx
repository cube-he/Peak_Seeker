'use client';

import { useEffect } from 'react';
import { message } from 'antd';
import { useStudentSaveStore } from '@/stores/student-save-state';

const TOAST_KEY = 'student-profile-save';

export default function SaveStatusBar() {
  const state = useStudentSaveStore((s) => s.state);
  const errorMessage = useStudentSaveStore((s) => s.errorMessage);

  useEffect(() => {
    if (state === 'saving') {
      message.loading({ content: '保存中...', key: TOAST_KEY, duration: 0 });
    } else if (state === 'saved') {
      message.success({ content: '已保存', key: TOAST_KEY, duration: 1.5 });
    } else if (state === 'error') {
      message.error({ content: errorMessage ?? '保存失败', key: TOAST_KEY, duration: 0 });
    } else {
      message.destroy(TOAST_KEY);
    }
  }, [state, errorMessage]);

  return null;
}
