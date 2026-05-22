'use client';

import { useEffect } from 'react';

/** easeOutCubic — 与 landing.html script 一致 */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** 在 dur 毫秒内把数值从 from 缓动到 to,每帧回调 onUpdate(复刻 landing.html 的 tween) */
function tween(
  from: number,
  to: number,
  dur: number,
  onUpdate: (v: number) => void,
): void {
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / dur);
    onUpdate(from + (to - from) * easeOutCubic(t));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/**
 * 首页滚动动效 hook —— 忠实复刻 landing.html <script> 的非 counter 部分:
 *  - [data-reveal] / [data-reveal-stagger]:进入视口加 in-view class(fade-up,CSS 控时长与错开)
 *  - [data-anim-dist]:冲稳保分布数字 0→target,900ms,逐个错开 80ms
 *  - [data-bar-fill]:进度条 width 0→target%,200ms 起,逐个错开 120ms;
 *    由所在 .sample-frame 内的 data-anim-dist 进入视口时统一触发(同原版)
 *  - .cap-card.featured:鼠标光晕,mousemove 更新 --halo-x/y/o,mouseleave 复位
 *
 * prefers-reduced-motion 时:reveal 由 CSS 跳终态;此处直接把 dist 数字、bar 宽度设为终值。
 *
 * 在首页根节点 mount 后调用一次即可,内部自行扫描 DOM。
 */
export function useHomeMotion(): void {
  useEffect(() => {
    const reduce =
      !!window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- reduced motion:直接跳终态,不做动画 ----
    if (reduce) {
      document
        .querySelectorAll<HTMLElement>('[data-bar-fill]')
        .forEach((el) => {
          el.style.width = `${el.dataset.target}%`;
        });
      document
        .querySelectorAll<HTMLElement>('[data-anim-dist] .cnt[data-target]')
        .forEach((el) => {
          el.textContent = el.dataset.target ?? el.textContent;
        });
      // reveal 由 CSS 的 prefers-reduced-motion 媒体查询负责;halo 同样被 CSS 关闭
      return;
    }

    // ---- 冲稳保分布数字 count-up ----
    const runDistCounts = (container: HTMLElement) => {
      if (container.dataset.done) return;
      container.dataset.done = '1';
      container
        .querySelectorAll<HTMLElement>('.cnt[data-target]')
        .forEach((el, idx) => {
          const target = Number(el.dataset.target);
          window.setTimeout(() => {
            tween(0, target, 900, (v) => {
              el.textContent = String(Math.round(v));
            });
          }, idx * 80);
        });
    };

    // ---- 进度条 bar fill ----
    const runBars = (scope: Element | null) => {
      const bars = (scope ?? document).querySelectorAll<HTMLElement>(
        '[data-bar-fill]:not([data-done])',
      );
      bars.forEach((el, idx) => {
        el.dataset.done = '1';
        window.setTimeout(
          () => {
            el.style.width = `${el.dataset.target}%`;
          },
          200 + idx * 120,
        );
      });
    };

    // ---- IntersectionObserver:reveal + dist + bar ----
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const el = entry.target as HTMLElement;

          if (
            el.hasAttribute('data-reveal') ||
            el.hasAttribute('data-reveal-stagger')
          ) {
            el.classList.add('in-view');
          }
          if (el.hasAttribute('data-anim-dist')) {
            runDistCounts(el);
            runBars(el.closest('.sample-frame'));
          }
          io.unobserve(el);
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' },
    );

    document
      .querySelectorAll<HTMLElement>(
        '[data-reveal], [data-reveal-stagger], [data-anim-dist]',
      )
      .forEach((el) => io.observe(el));

    // ---- AI 卡片鼠标光晕 ----
    const ai = document.querySelector<HTMLElement>('.cap-card.featured');
    const onMove = (e: MouseEvent) => {
      if (!ai) return;
      const r = ai.getBoundingClientRect();
      ai.style.setProperty('--halo-x', `${e.clientX - r.left}px`);
      ai.style.setProperty('--halo-y', `${e.clientY - r.top}px`);
      ai.style.setProperty('--halo-o', '1');
    };
    const onLeave = () => {
      ai?.style.setProperty('--halo-o', '0');
    };
    if (ai) {
      ai.addEventListener('mousemove', onMove);
      ai.addEventListener('mouseleave', onLeave);
    }

    return () => {
      io.disconnect();
      if (ai) {
        ai.removeEventListener('mousemove', onMove);
        ai.removeEventListener('mouseleave', onLeave);
      }
    };
  }, []);
}
