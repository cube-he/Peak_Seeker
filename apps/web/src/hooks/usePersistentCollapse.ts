import { useState, useEffect, useCallback } from 'react';

// 折叠状态 + localStorage 持久化. 返回 [collapsed, toggle].
// SSR 安全: 首次渲染恒为 defaultCollapsed(服务端与客户端一致), mount 后再从
// localStorage 同步, 避免 hydration mismatch。
export function usePersistentCollapse(
  storageKey: string,
  defaultCollapsed = false,
): [boolean, () => void] {
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === '1') setCollapsedState(true);
    else if (stored === '0') setCollapsedState(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = useCallback((v: boolean) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, v ? '1' : '0');
    }
  }, [storageKey]);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      persist(next);
      return next;
    });
  }, [persist]);

  return [collapsed, toggle];
}
