'use client';
import { useEffect } from 'react';
import { TIcon } from './icons';

/**
 * Next 错误边界 (组件渲染抛异常时整页接管).
 * §9.7 全页崩溃态: 与 §9.2 API 加载失败不同, 后者只是一行 br-error.
 */
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
    <div className="br-page">
      <div className="br-crash">
        <span className="glyph"><TIcon.alert/></span>
        <h2>页面加载出错</h2>
        <div className="msg">{error?.message ?? '渲染批次推荐时发生异常。'}</div>
        {error?.digest && <span className="errid">错误 ID: {error.digest}</span>}
        <div className="hint">
          刚部署可能是缓存, 请按 <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> 硬刷新。
        </div>
        <div className="br-crash-actions">
          <button className="primary" onClick={() => reset()}>重试</button>
          <button className="ghost" onClick={() => window.location.reload()}>刷新页面</button>
        </div>
      </div>
    </div>
  );
}
