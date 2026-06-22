/** @jest-environment jsdom */
import { renderHook, act } from '@testing-library/react';
import { usePersistentCollapse } from '../usePersistentCollapse';

beforeEach(() => localStorage.clear());

describe('usePersistentCollapse', () => {
  it('默认未折叠(defaultCollapsed=false)', () => {
    const { result } = renderHook(() => usePersistentCollapse('k'));
    expect(result.current[0]).toBe(false);
  });

  it('defaultCollapsed=true 且无存储时为 true', () => {
    const { result } = renderHook(() => usePersistentCollapse('k', true));
    expect(result.current[0]).toBe(true);
  });

  it('toggle 翻转并写入 localStorage', () => {
    const { result } = renderHook(() => usePersistentCollapse('k'));
    act(() => result.current[1]());
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('k')).toBe('1');
    act(() => result.current[1]());
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem('k')).toBe('0');
  });

  it('mount 时从 localStorage 回填 (存 1 → collapsed)', () => {
    localStorage.setItem('k', '1');
    const { result } = renderHook(() => usePersistentCollapse('k'));
    expect(result.current[0]).toBe(true);
  });

  it('setCollapsed 直接设值并持久化', () => {
    const { result } = renderHook(() => usePersistentCollapse('k'));
    act(() => result.current[2](true));
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem('k')).toBe('1');
  });
});
