'use client';

import { useStudentSaveStore } from '@/stores/student-save-state';
import { CheckCircleFilled, LoadingOutlined, CloseCircleFilled } from '@ant-design/icons';

export default function SaveStatusBar() {
  const { state, errorMessage } = useStudentSaveStore();

  if (state === 'idle') return null;

  return (
    <div className="sticky top-0 z-30 flex items-center gap-2 bg-white/90 px-3 py-1 text-xs backdrop-blur">
      {state === 'saving' && (
        <>
          <LoadingOutlined />
          <span>保存中…</span>
        </>
      )}
      {state === 'saved' && (
        <>
          <CheckCircleFilled className="text-green-500" />
          <span>已保存</span>
        </>
      )}
      {state === 'error' && (
        <>
          <CloseCircleFilled className="text-red-500" />
          <span>{errorMessage ?? '保存失败'}</span>
        </>
      )}
    </div>
  );
}
