/* 批次推荐页用的 13 个 SVG 图标 (lucide 风格, 1.8 / 2 / 2.5px stroke).
   设计稿: WillNest Design System (智愿家) / teacher/components.jsx 里的 TIcon. */
import type { ReactElement } from 'react';

const s18 = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const s2  = { ...s18, strokeWidth: 2 } as const;
const s25 = { ...s18, strokeWidth: 2.5 } as const;

export const TIcon = {
  chevLeft:   (): ReactElement => <svg viewBox="0 0 24 24" {...s2}><polyline points="15 18 9 12 15 6"/></svg>,
  chevDown:   (): ReactElement => <svg viewBox="0 0 24 24" {...s2}><polyline points="6 9 12 15 18 9"/></svg>,
  chevRight:  (): ReactElement => <svg viewBox="0 0 24 24" {...s2}><polyline points="9 18 15 12 9 6"/></svg>,
  arrowRight: (): ReactElement => <svg viewBox="0 0 24 24" {...s2}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  check:      (): ReactElement => <svg viewBox="0 0 24 24" {...s25}><polyline points="20 6 9 17 4 12"/></svg>,
  close:      (): ReactElement => <svg viewBox="0 0 24 24" {...s2}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  search:     (): ReactElement => <svg viewBox="0 0 24 24" {...s2}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>,
  alert:      (): ReactElement => <svg viewBox="0 0 24 24" {...s18}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  shield:     (): ReactElement => <svg viewBox="0 0 24 24" {...s18}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  upload:     (): ReactElement => <svg viewBox="0 0 24 24" {...s18}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  info:       (): ReactElement => <svg viewBox="0 0 24 24" {...s18}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>,
  link:       (): ReactElement => <svg viewBox="0 0 24 24" {...s18}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  download:   (): ReactElement => <svg viewBox="0 0 24 24" {...s18}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
};
