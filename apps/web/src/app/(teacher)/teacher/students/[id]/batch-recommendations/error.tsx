'use client';
import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error('[batch-recommendations] page error:', error);
  }, [error]);

  return (
    <div className="p-6">
      <div className="border-2 border-red-300 bg-red-50 p-4 rounded">
        <div className="font-semibold text-red-700 mb-2">页面加载出错</div>
        <div className="text-sm text-red-700 mb-3">
          {error?.message ?? '未知错误'}
          {error?.digest && (
            <div className="text-xs text-gray-500 mt-1">
              错误 ID: {error.digest}
            </div>
          )}
        </div>
        <div className="text-xs text-gray-600 mb-3">
          如果是刚刚部署后第一次访问, 可能是浏览器缓存了旧版本。
          请按 <kbd className="px-1 border rounded">Ctrl</kbd>+
          <kbd className="px-1 border rounded">Shift</kbd>+
          <kbd className="px-1 border rounded">R</kbd> 硬刷新。
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 border rounded bg-white text-sm hover:bg-gray-50"
            onClick={() => reset()}
          >
            重试
          </button>
          <button
            className="px-3 py-1 border rounded bg-white text-sm hover:bg-gray-50"
            onClick={() => window.location.reload()}
          >
            刷新页面
          </button>
        </div>
      </div>
    </div>
  );
}
