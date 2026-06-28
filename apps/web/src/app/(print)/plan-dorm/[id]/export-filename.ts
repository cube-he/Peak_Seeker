import type { DormSheet } from './types';

// 院校生活情况导出文件名(浏览器「另存为 PDF」默认取 document.title)。
// 形如: 王润_本科批B段_院校生活情况_20260628
export function buildDormTitle(
  sheet: Pick<DormSheet, 'student' | 'plan'>,
  now: Date = new Date(),
): string {
  const safe = (s: string) => (s || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const parts = [safe(sheet.student?.name ?? '') || '学生', safe(sheet.plan?.batchName ?? '')].filter(
    Boolean,
  );
  return `${parts.join('_')}_院校生活情况_${ymd}`.replace(/_+/g, '_');
}
