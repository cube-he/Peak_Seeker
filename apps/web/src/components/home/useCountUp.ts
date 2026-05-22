'use client';

import { useEffect, useRef, useState } from 'react';

/** easeOutCubic — 与 landing.html script 的缓动函数一致 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** prefers-reduced-motion 是否开启 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

interface UseCountUpOptions {
  /** 缓动时长,默认 1400ms(对齐 landing.html 的 stat counter) */
  duration?: number;
  /** 保留小数位,默认 0 */
  decimals?: number;
  /** 是否启动动画;false 时停在 0(用于等待数据到达) */
  enabled?: boolean;
}

/**
 * 数字 count-up 动画 hook,复刻 landing.html 的 stat counter:
 * 从 0 缓动到 target(easeOutCubic),元素进入视口时才启动,只跑一次。
 * - 整数且 >= 1000 时千分位格式化;有小数位时按小数位格式化。
 * - prefers-reduced-motion 时直接跳到终态。
 * - target 变化(数据到达)时重新触发。
 *
 * 返回 { ref, display }:ref 绑到容器(用于视口探测),display 为当前显示文本。
 */
export function useCountUp<T extends HTMLElement = HTMLElement>(
  target: number,
  { duration = 1400, decimals = 0, enabled = true }: UseCountUpOptions = {},
) {
  const ref = useRef<T | null>(null);
  const [value, setValue] = useState(0);
  // 已跑过动画的目标值;target 变化时允许重新跑
  const playedFor = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const el = ref.current;
    if (!el) return;
    if (playedFor.current === target) return;

    // reduce motion:直接跳终态
    if (prefersReducedMotion()) {
      playedFor.current = target;
      setValue(target);
      return;
    }

    let rafId = 0;
    let cancelled = false;

    const run = () => {
      if (cancelled || playedFor.current === target) return;
      playedFor.current = target;
      const start = performance.now();
      const step = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / duration);
        setValue(target * easeOutCubic(t));
        if (t < 1) rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          run();
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );
    io.observe(el);

    // Hero 区:即便已在视口内,也在 500ms 后兜底启动(对齐 landing.html setTimeout)
    const kick = window.setTimeout(run, 500);

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      io.disconnect();
      window.clearTimeout(kick);
    };
  }, [target, duration, enabled]);

  // 格式化:小数位优先;否则整数,>= 1000 加千分位
  let display: string;
  if (decimals > 0) {
    display = value.toFixed(decimals);
  } else {
    const rounded = Math.round(value);
    display = target >= 1000 ? rounded.toLocaleString('en-US') : String(rounded);
  }

  return { ref, display };
}
