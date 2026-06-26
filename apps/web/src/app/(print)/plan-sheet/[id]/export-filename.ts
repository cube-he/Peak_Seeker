import type { ExportSheet } from './types';

// 家长版导出文件名(浏览器「另存为 PDF」默认取 document.title)。
// 形如: 王润_本科批B段_志愿方案(家长版)_20260626
// 清洗 Windows/Mac 文件名非法字符 \ / : * ? " < > |, 并合并连续下划线。
export function buildExportTitle(
  sheet: Pick<ExportSheet, 'student' | 'plan'>,
  now: Date = new Date(),
): string {
  const safe = (s: string) => (s || '').replace(/[\\/:*?"<>|]/g, '_').trim();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const parts = [safe(sheet.student?.name) || '学生', safe(sheet.plan?.batchName ?? '')].filter(
    Boolean,
  );
  return `${parts.join('_')}_志愿方案(家长版)_${ymd}`.replace(/_+/g, '_');
}
