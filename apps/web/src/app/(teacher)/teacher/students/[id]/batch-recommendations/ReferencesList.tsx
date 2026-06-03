'use client';
import type { ReferenceItem } from '@/services/batch-recommendations-api';

const ICONS: Record<string, string> = {
  pdf: '📄',
  xlsx: '📊',
  doc: '📝',
  announcement: '🌐',
};

/**
 * 浏览器原生只能预览 PDF/图片, doc/docx/xlsx 点击 target=_blank 通常触发下载.
 * 服务器用 libreoffice 把这些文件预转成同名 .preview.pdf (缓存到同目录),
 * 前端预览链接走 .preview.pdf, 下载链接保留原文件 — 老师能用 Word/Excel 编辑.
 *
 * 规则:
 *   pdf      → 预览 = downloadUrl 自身, 下载 = downloadUrl?download=1
 *   doc/xlsx → 预览 = <base>.preview.pdf,  下载 = downloadUrl?download=1 (原 doc/xlsx)
 *   announcement → 只显示"查看官网"
 */
function previewUrlFor(ref: ReferenceItem): string | null {
  if (!ref.downloadUrl) return null;
  if (ref.type === 'pdf' || ref.type === 'announcement') return ref.downloadUrl;
  // doc/xlsx: 拼 .preview.pdf
  return ref.downloadUrl.replace(/\.(doc|docx|xlsx|xls|ppt|pptx)$/i, '.preview.pdf');
}

export function ReferencesList({ references }: { references: ReferenceItem[] }) {
  if (!references || references.length === 0) return null;
  return (
    <div>
      <div className="font-medium mb-1">相关文件:</div>
      <ul className="space-y-1">
        {references.map((ref, i) => {
          const previewHref = previewUrlFor(ref);
          return (
            <li key={i} className="flex items-center gap-2">
              <span>{ICONS[ref.type] ?? '🌐'}</span>
              <span>{ref.title}</span>
              {ref.available && ref.downloadUrl ? (
                ref.external ? (
                  // 外站 (官网公告等): 只显示"查看", 不带 download 参数 (没意义).
                  <a
                    className="text-blue-600 underline"
                    href={ref.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    查看官网
                  </a>
                ) : (
                  // 本地文件: 预览 + 下载
                  <>
                    {previewHref ? (
                      <a
                        className="text-blue-600 underline"
                        href={previewHref}
                        target="_blank"
                        rel="noopener"
                      >
                        预览
                      </a>
                    ) : null}
                    <a
                      className="text-blue-600 underline"
                      href={`${ref.downloadUrl}?download=1`}
                    >
                      下载
                    </a>
                  </>
                )
              ) : (
                <span className="text-gray-400 text-xs italic">
                  文件待补
                  {ref.sourceNote && <> — {ref.sourceNote}</>}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
