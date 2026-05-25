/**
 * @jest-environment jsdom
 */
import { renderHook, act } from '@testing-library/react';
import { useDebouncedValue } from '../useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useDebouncedValue('a', 300));
    expect(result.current).toBe('a');
  });

  it('delays updates by the given delay', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    );
    rerender({ v: 'ab' });
    expect(result.current).toBe('a'); // not yet
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('ab');
  });

  it('collapses rapid changes into the last value', () => {
    const { result, rerender } = renderHook(
      ({ v }) => useDebouncedValue(v, 300),
      { initialProps: { v: 'a' } },
    );
    rerender({ v: 'ab' });
    act(() => { jest.advanceTimersByTime(100); });
    rerender({ v: 'abc' });
    act(() => { jest.advanceTimersByTime(300); });
    expect(result.current).toBe('abc');
  });
});
